import {
  Component, DestroyRef, ElementRef, PLATFORM_ID, ViewChild, afterNextRender, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { TickService } from '../../services/screen/tick.service';
import { ALL_SCREEN_VIEWS, ScreenView } from '../../services/screen/display-snapshot';
import { createBaseSnapshot, fillDemoData } from '../../services/screen/demo-data';
import { REQUIRED_FONT_SHORTHANDS, drawScreen } from '../../services/screen/screen-renderer';
import { buildLabels, localeForLang } from '../../services/screen/screen-logic';
import { FontId, ThemeId } from '../../services/screen/theme-tokens';

/** How long each view stays on the mock-up, in ms (faster than the real 20 s: it is a showcase). */
export const MOCK_VIEW_MS = 4500;

/** Theme and font pairs the mock-up cycles through, one per round of all the views. */
export const MOCK_LOOKS: { theme: ThemeId; font: FontId }[] = [
  { theme: 'emerald-gold', font: 'outfit' },
  { theme: 'liquid-glass', font: 'inter' },
  { theme: 'obsidian-platinum', font: 'orbitron' },
  { theme: 'light-glass', font: 'playfair' }
];

/**
 * Animated mock-up of the Desk Display for the landing page. It is not a picture: it runs the real
 * renderer (the code that draws on the USB screen) on a canvas with sample data, cycling through
 * the views and themes. It only draws while visible and stays still for users who prefer reduced motion.
 */
@Component({
  selector: 'app-desk-display-mock',
  standalone: true,
  template: `
    <figure class="relative mx-auto w-full max-w-[560px] m-0">
      <div class="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-3 sm:p-4 shadow-[0_30px_70px_rgba(0,0,0,0.65)]">
        <div class="relative rounded-2xl bg-black overflow-hidden ring-1 ring-white/10" style="aspect-ratio: 480 / 320">
          <canvas #canvas width="480" height="320" class="block w-full h-auto" role="img"
                  [attr.aria-label]="ts.t('SCREEN.NAME') + ' - ' + ts.t('LANDING.DESK.MOCK_CAPTION')"></canvas>
        </div>
      </div>

      <!-- little stand, so it reads as a desk gadget -->
      <div class="mx-auto h-3 w-24 rounded-b-xl bg-gradient-to-b from-white/10 to-transparent" aria-hidden="true"></div>
      <div class="mx-auto h-1 w-40 rounded-full bg-black/60 blur-[2px]" aria-hidden="true"></div>

      <div class="mt-4 flex justify-center gap-1.5" aria-hidden="true">
        @for (view of views; track view; let i = $index) {
          <span class="h-1.5 rounded-full transition-all duration-500"
                [class]="i === activeIndex() ? 'w-6 bg-luxury-gold' : 'w-1.5 bg-white/20'"></span>
        }
      </div>
      <figcaption class="mt-3 text-center text-xs text-gray-500 font-outfit">{{ ts.t('LANDING.DESK.MOCK_CAPTION') }}</figcaption>
    </figure>
  `
})
export class DeskDisplayMockComponent {
  readonly ts = inject(TranslationService);
  private tick = inject(TickService);
  private destroyRef = inject(DestroyRef);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  readonly views: readonly ScreenView[] = ALL_SCREEN_VIEWS;
  readonly activeIndex = signal(0);

  private visible = true;
  private reducedMotion = false;
  private startedAt = 0;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    afterNextRender(() => void this.start());
  }

  private async start(): Promise<void> {
    if (!this.isBrowser) return;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.startedAt = Date.now();

    try {
      await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
    } catch {
      /* system fonts will do */
    }
    // The visitor may have left the page while the fonts were loading
    if (this.destroyed) return;

    // Draw only while on screen: it is far down the page and should not cost anything otherwise
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => {
        this.visible = entries.some(e => e.isIntersecting);
        if (this.visible) this.draw();
      });
      observer.observe(this.canvas.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }

    const unsubscribe = this.tick.onTick(() => this.draw());
    this.destroyRef.onDestroy(unsubscribe);
    this.draw();
  }

  /** Which view and look the mock-up shows after `elapsedMs`. */
  static frameAt(elapsedMs: number, reducedMotion: boolean): { viewIndex: number; lookIndex: number } {
    if (reducedMotion) return { viewIndex: 0, lookIndex: 0 };
    const step = Math.floor(elapsedMs / MOCK_VIEW_MS);
    return {
      viewIndex: step % ALL_SCREEN_VIEWS.length,
      lookIndex: Math.floor(step / ALL_SCREEN_VIEWS.length) % MOCK_LOOKS.length
    };
  }

  private draw(): void {
    if (!this.visible) return;
    const ctx = this.canvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const { viewIndex, lookIndex } = DeskDisplayMockComponent.frameAt(Date.now() - this.startedAt, this.reducedMotion);
    const look = MOCK_LOOKS[lookIndex];
    const lang = this.ts.currentLang();

    const snapshot = fillDemoData(createBaseSnapshot({
      now: new Date(),
      theme: look.theme,
      fontId: look.font,
      labels: buildLabels(path => this.ts.t(path)),
      locale: localeForLang(lang),
      use24h: true,
      focusRunning: true
    }));

    drawScreen(ctx, snapshot, ALL_SCREEN_VIEWS[viewIndex]);
    if (this.activeIndex() !== viewIndex) this.activeIndex.set(viewIndex);
  }
}
