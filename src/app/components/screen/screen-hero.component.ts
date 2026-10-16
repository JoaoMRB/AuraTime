import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, ViewChild, computed, inject, input
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { TranslationService } from '../../services/translation.service';
import { ScreenIconComponent } from './screen-icon.component';

/** Elements that use the arrow keys and Space themselves: the page shortcuts leave them alone. */
const INTERACTIVE = 'input, select, textarea, button, a[href], summary, [role="slider"], [role="switch"], [role="radio"], [contenteditable="true"]';

/**
 * The live preview inside a drawn 3.5" device, with the transport controls (previous, pause, next, pin) under
 * it. Owns the preview canvas of ScreenOutputService: the page only starts the output loop.
 * Keyboard (when `controls` is on): ← → change view, Space pauses the rotation.
 */
@Component({
  selector: 'app-screen-hero',
  standalone: true,
  imports: [ScreenIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './screen-hero.component.html'
})
export class ScreenHeroComponent implements AfterViewInit {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Show the transport controls and react to the keyboard (the control centre); off during setup. */
  readonly controls = input(false);
  /** The page has finished its first client render (labels that depend on the browser can appear). */
  readonly ready = input(false);

  @ViewChild('preview', { static: true }) previewHost!: ElementRef<HTMLElement>;

  readonly viewName = computed(() => this.ts.t(`SCREEN.VIEWS.${this.output.activeView().toUpperCase()}`));
  readonly progress = this.output.rotationProgress;
  /** 'rotating' | 'paused' | 'pinned' | 'held' (a running Pomodoro keeps the focus view) | 'single'. */
  readonly state = computed(() => {
    if (this.output.pinned()) return 'pinned';
    if (this.output.paused()) return 'paused';
    const p = this.progress();
    if (p.rotating) return 'rotating';
    return this.output.rotation().length > 1 ? 'held' : 'single';
  });
  readonly percent = computed(() => {
    const p = this.progress();
    return this.state() === 'rotating' && p.durationSec > 0 ? Math.min(100, ((p.elapsedSec + 1) / p.durationSec) * 100) : 0;
  });
  readonly secondsLeft = computed(() => Math.max(0, this.progress().durationSec - this.progress().elapsedSec));

  constructor() {
    if (this.isBrowser) {
      const onKey = (event: KeyboardEvent) => this.onKey(event);
      document.addEventListener('keydown', onKey);
      inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', onKey));
    }
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.output.canvas) this.previewHost.nativeElement.appendChild(this.output.canvas);
  }

  next(): void { this.output.stepView(1); }
  previous(): void { this.output.stepView(-1); }
  togglePause(): void { this.output.togglePause(); }
  togglePin(): void { this.output.pinView(this.output.pinned() ? null : this.output.activeView()); }

  /** ← → and Space, unless the user is typing or operating another control. */
  onKey(event: KeyboardEvent): void {
    if (!this.controls() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as Element | null;
    if (target?.closest?.(INTERACTIVE)) return;
    if (event.key === 'ArrowRight') this.next();
    else if (event.key === 'ArrowLeft') this.previous();
    else if (event.key === ' ' || event.code === 'Space') this.togglePause();
    else return;
    event.preventDefault();
  }
}
