import {
  AfterViewInit, Component, DestroyRef, ElementRef, HostListener, OnDestroy, PLATFORM_ID, ViewChild, afterNextRender, computed, effect, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { SerialLinkService } from '../../services/screen/serial-link.service';
import { ScreenView } from '../../services/screen/display-snapshot';
import { TranslationService } from '../../services/translation.service';
import { AlarmService } from '../../services/alarm.service';
import { ScreenHeroComponent } from './screen-hero.component';
import { ScreenViewsComponent } from './screen-views.component';
import { ScreenAppearanceComponent } from './screen-appearance.component';
import { ScreenScheduleComponent } from './screen-schedule.component';
import { ScreenHealthComponent } from './screen-health.component';
import { ScreenIconComponent } from './screen-icon.component';

/**
 * Desk Display: the page that drives the USB screen. Two modes around one large preview:
 *  - setup (no display yet): a compact 3-step flow (check the browser, connect, customise);
 *  - control centre (connected, or when the visitor chose to customise): transport controls, views, appearance,
 *    schedule and link health.
 * Without a display, or in a browser without Web Serial, the preview runs in demo mode.
 *
 * Keep it open (a dedicated window works best): Web Serial and the render loop live in this page.
 */
@Component({
  selector: 'app-screen',
  standalone: true,
  imports: [
    RouterLink, ScreenHeroComponent, ScreenViewsComponent, ScreenAppearanceComponent, ScreenScheduleComponent,
    ScreenHealthComponent, ScreenIconComponent
  ],
  templateUrl: './screen.component.html'
})
export class ScreenComponent implements AfterViewInit, OnDestroy {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  readonly link = inject(SerialLinkService);
  private title = inject(Title);
  private meta = inject(Meta);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @ViewChild('statusMenu') statusMenu?: ElementRef<HTMLElement>;

  /**
   * False on the server and during the first client render, so the prerendered HTML and the first
   * browser render are identical (what the browser supports is only known in the browser).
   */
  readonly ready = signal(false);
  /** The page is in a background tab or minimized: the browser slows it down and the display can lag. */
  readonly pageHidden = signal(false);
  /** The visitor opened the customisation before connecting a display (it then works on the demo preview). */
  readonly customizing = signal(false);
  readonly menuOpen = signal(false);

  readonly connected = computed(() => this.link.status() === 'connected');
  /** Another /screen window is driving the display: this one only shows a preview. */
  readonly otherWindow = computed(() => this.output.ownership() === 'other');
  /** The control centre: shown with a display connected, or on request. Never in a browser that cannot work. */
  readonly controlCentre = computed(() => this.supported && !this.otherWindow() && (this.connected() || this.customizing()));
  readonly viewName = computed(() => this.viewLabel(this.output.activeView()));

  constructor() {
    // This page only *shows* the next alarm; ringing stays with the clock window. The suppression lasts
    // only as long as this page, so alarms work again as soon as the visitor leaves /screen.
    const releaseAlarms = inject(AlarmService).suppressRinging();
    inject(DestroyRef).onDestroy(releaseAlarms);

    afterNextRender(() => this.ready.set(true));

    if (this.isBrowser) {
      this.pageHidden.set(document.hidden);
      const onVisibility = () => this.pageHidden.set(document.hidden);
      document.addEventListener('visibilitychange', onVisibility);
      inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));
    }

    // Own title and description (also in the prerendered HTML), in the app language
    effect(() => {
      const title = this.ts.t('SCREEN.SEO.TITLE');
      const description = this.ts.t('SCREEN.SEO.DESCRIPTION');
      this.title.setTitle(title);
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ name: 'twitter:title', content: title });
      this.meta.updateTag({ name: 'twitter:description', content: description });
    });

    // The menu belongs to a connected display: close it when the display goes away.
    effect(() => {
      if (!this.connected()) this.menuOpen.set(false);
    }, { allowSignalWrites: true });
  }

  /** Whether this browser can talk to USB displays (Web Serial). */
  get supported(): boolean {
    return this.link.isSupported();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.output.canvas) void this.output.start();
  }

  ngOnDestroy(): void {
    this.output.stop();
    this.output.canvas?.remove();
  }

  changeLang(lang: string): void {
    this.ts.setLanguage(lang);
  }

  viewLabel(view: ScreenView): string {
    return this.ts.t(`SCREEN.VIEWS.${view.toUpperCase()}`);
  }

  kilobytes(): string {
    return (this.link.bytesSent() / 1024).toFixed(0);
  }

  statusText(): string {
    switch (this.link.status()) {
      case 'connected': return this.ts.t('SCREEN.PAGE.S2.CONNECTED');
      case 'connecting': return this.ts.t('SCREEN.PAGE.S2.CONNECTING');
      case 'error': return this.ts.t('SCREEN.PAGE.S2.ERROR');
      default: return this.ts.t('SCREEN.PAGE.S2.DISCONNECTED');
    }
  }

  statusClass(): string {
    switch (this.link.status()) {
      case 'connected': return 'text-emerald-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-200';
    }
  }

  /** Dot colour of the header pill. */
  dotClass(): string {
    switch (this.link.status()) {
      case 'connected': return 'bg-emerald-400';
      case 'connecting': return 'bg-amber-300';
      case 'error': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  }

  toggleMenu(): void {
    this.menuOpen.update(open => !open);
  }

  async disconnect(): Promise<void> {
    this.menuOpen.set(false);
    this.customizing.set(false);
    await this.output.disconnect();
  }

  redraw(): void {
    this.menuOpen.set(false);
    this.output.refreshAll();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.statusMenu?.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      this.statusMenu?.nativeElement.querySelector<HTMLElement>('button')?.focus();
    }
  }
}
