import {
  AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, afterNextRender, computed, effect, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { SerialLinkService } from '../../services/screen/serial-link.service';
import { ALL_SCREEN_VIEWS, ScreenView } from '../../services/screen/display-snapshot';
import { DisplayStateService } from '../../services/screen/display-state.service';
import { viewHasContent } from '../../services/screen/screen-logic';
import { FontId, THEME_IDS, ThemeId } from '../../services/screen/theme-tokens';
import { TranslationService } from '../../services/translation.service';
import { AlarmService } from '../../services/alarm.service';

/**
 * Desk Display: the page that drives the USB screen. A 3-step wizard (check the browser, connect
 * the display, choose the views) around a large live preview. Without a display, or in a browser
 * without Web Serial, the preview runs in demo mode.
 *
 * Keep it open (a dedicated window works best): Web Serial and the render loop live in this page.
 */
@Component({
  selector: 'app-screen',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './screen.component.html'
})
export class ScreenComponent implements AfterViewInit, OnDestroy {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  readonly link = inject(SerialLinkService);
  private display = inject(DisplayStateService);
  private title = inject(Title);
  private meta = inject(Meta);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @ViewChild('preview', { static: true }) previewHost!: ElementRef<HTMLElement>;

  /**
   * False on the server and during the first client render, so the prerendered HTML and the first
   * browser render are identical (what the browser supports is only known in the browser).
   */
  readonly ready = signal(false);

  readonly viewOptions: ScreenView[] = [...ALL_SCREEN_VIEWS];
  readonly themeIds: readonly ThemeId[] = THEME_IDS;
  readonly fontOptions: { id: FontId; name: string }[] = [
    { id: 'outfit', name: 'Outfit' },
    { id: 'orbitron', name: 'Orbitron' },
    { id: 'inter', name: 'Inter' },
    { id: 'playfair', name: 'Playfair Display' }
  ];
  readonly hours = Array.from({ length: 24 }, (_, h) => h);

  /** Which views currently have something to show (drives the "no data yet" hints). */
  readonly content = computed(() => viewHasContent(this.display.snapshot()));
  readonly connected = computed(() => this.link.status() === 'connected');
  /** 1 = browser not supported, 2 = connect the display, 3 = choose the views. */
  readonly currentStep = computed(() => (!this.supported ? 1 : this.connected() ? 3 : 2));
  readonly viewName = computed(() => this.viewLabel(this.output.activeView()));

  constructor() {
    // This page only *shows* the next alarm; ringing stays with the clock window.
    inject(AlarmService).stopChecker();

    afterNextRender(() => this.ready.set(true));

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
  }

  /** Whether this browser can talk to USB displays (Web Serial). */
  get supported(): boolean {
    return this.link.isSupported();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser || !this.output.canvas) return;
    this.previewHost.nativeElement.appendChild(this.output.canvas);
    void this.output.start();
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

  themeLabel(id: ThemeId): string {
    return this.ts.t(`CLOCK.THEME_${id.toUpperCase().replace(/-/g, '_')}`);
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
}
