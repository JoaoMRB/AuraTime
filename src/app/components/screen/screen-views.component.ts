import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, PLATFORM_ID, QueryList, ViewChild, ViewChildren,
  computed, effect, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { DisplayStateService } from '../../services/screen/display-state.service';
import { ALL_SCREEN_VIEWS, ScreenView } from '../../services/screen/display-snapshot';
import { MAX_VIEW_SECONDS, MIN_VIEW_SECONDS, viewHasContent } from '../../services/screen/screen-logic';
import { fillDemoData } from '../../services/screen/demo-data';
import { drawScreen } from '../../services/screen/screen-renderer';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../services/screen/turing-protocol';
import { TranslationService } from '../../services/translation.service';
import { ScreenIconComponent } from './screen-icon.component';

/** Thumbnails are redrawn at most this often, and only while the section is on screen. */
export const THUMBNAIL_MIN_INTERVAL_MS = 4000;
const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 160;

/**
 * The "Views" section: one card per view with a live thumbnail (drawn by the real renderer), an on/off switch,
 * a duration and the means to reorder (drag, or the up/down buttons).
 */
@Component({
  selector: 'app-screen-views',
  standalone: true,
  imports: [RouterLink, ScreenIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './screen-views.component.html'
})
export class ScreenViewsComponent implements AfterViewInit {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  private display = inject(DisplayStateService);
  private zone = inject(NgZone);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private destroyRef = inject(DestroyRef);

  readonly minSeconds = MIN_VIEW_SECONDS;
  readonly maxSeconds = MAX_VIEW_SECONDS;

  @ViewChild('section', { static: true }) section!: ElementRef<HTMLElement>;
  @ViewChildren('thumb') thumbs!: QueryList<ElementRef<HTMLCanvasElement>>;

  /** Which views have real data (sample data does not count: the hint is about the user's own setup). */
  readonly content = computed(() => viewHasContent(this.display.snapshot()));
  readonly cards = computed(() =>
    this.output.viewOrder().map(id => ({
      id,
      enabled: this.output.rotation().includes(id),
      seconds: this.output.viewSeconds()[id],
      hasContent: this.content()[id]
    }))
  );
  /** Polite announcement of the last reorder, for screen readers. */
  readonly announcement = signal('');
  readonly dragging = signal<ScreenView | null>(null);
  readonly dropTarget = signal<ScreenView | null>(null);

  private visible = false;
  private lastDraw = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private off: HTMLCanvasElement | null = null;
  /** Number of thumbnail refreshes done (diagnostics, tests). */
  drawCount = 0;

  constructor() {
    // A change of look or order is worth a refresh, but never more often than the minimum interval.
    effect(() => {
      this.output.themePin(); this.output.fontPin(); this.output.viewOrder(); this.output.demoActive(); this.cards();
      if (this.visible) this.request();
    });
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.thumbs.changes.subscribe(() => this.request());
    this.zone.runOutsideAngular(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.setVisible(true);
        return;
      }
      const observer = new IntersectionObserver(entries => this.setVisible(entries.some(e => e.isIntersecting)));
      observer.observe(this.section.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
      const interval = setInterval(() => this.request(), THUMBNAIL_MIN_INTERVAL_MS);
      this.destroyRef.onDestroy(() => clearInterval(interval));
    });
    this.destroyRef.onDestroy(() => this.timer !== null && clearTimeout(this.timer));
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.request();
  }

  /** Asks for a refresh: now if the last one is old enough, otherwise when it will be. */
  request(): void {
    if (!this.isBrowser || !this.visible || this.timer !== null) return;
    const wait = Math.max(0, this.lastDraw + THUMBNAIL_MIN_INTERVAL_MS - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, wait);
  }

  /**
   * Redraws the thumbnails, one per task, so no single task is long. Skipped while a frame is being sent to the
   * display or the page is hidden: the picture sent to the display always comes first.
   */
  refresh(): void {
    if (!this.isBrowser || document.hidden) return;
    if (this.output.isSending()) {
      this.lastDraw = Date.now() - THUMBNAIL_MIN_INTERVAL_MS + 500; // try again shortly
      this.request();
      return;
    }
    this.lastDraw = Date.now();
    this.drawCount++;
    const real = this.display.snapshot();
    const base = this.output.buildSnapshot();
    const content = viewHasContent(real);
    const targets = this.thumbs.toArray().map(ref => ref.nativeElement);
    const step = (i: number) => {
      if (i >= targets.length || !this.visible || this.output.isSending()) return;
      const canvas = targets[i];
      const view = canvas.dataset['view'] as ScreenView;
      if ((ALL_SCREEN_VIEWS as readonly string[]).includes(view)) this.drawThumb(canvas, view, content[view] ? base : fillDemoData({ ...base }));
      setTimeout(() => step(i + 1), 0);
    };
    step(0);
  }

  private drawThumb(canvas: HTMLCanvasElement, view: ScreenView, snap: ReturnType<ScreenOutputService['buildSnapshot']>): void {
    if (!this.off) {
      this.off = document.createElement('canvas');
      this.off.width = SCREEN_WIDTH;
      this.off.height = SCREEN_HEIGHT;
    }
    const source = this.off.getContext('2d');
    const target = canvas.getContext('2d');
    if (!source || !target) return;
    drawScreen(source, snap, view, { shift: { x: 0, y: 0 } });
    target.imageSmoothingQuality = 'high';
    target.drawImage(this.off, 0, 0, canvas.width, canvas.height);
  }

  readonly thumbWidth = THUMB_WIDTH;
  readonly thumbHeight = THUMB_HEIGHT;

  viewLabel(view: ScreenView): string {
    return this.ts.t(`SCREEN.VIEWS.${view.toUpperCase()}`);
  }

  fill(seconds: number): string {
    return `${((seconds - MIN_VIEW_SECONDS) / (MAX_VIEW_SECONDS - MIN_VIEW_SECONDS)) * 100}%`;
  }

  toggle(view: ScreenView, enabled: boolean): void {
    this.output.setInRotation(view, enabled);
  }

  move(view: ScreenView, delta: -1 | 1): void {
    this.output.moveView(view, delta);
    const position = this.output.viewOrder().indexOf(view) + 1;
    this.announcement.set(this.ts.format('SCREEN.UI.VIEWS.MOVED', { view: this.viewLabel(view), position, total: ALL_SCREEN_VIEWS.length }));
  }

  /* ---- drag and drop (the handle is the draggable part, so the sliders keep working) ---- */

  onDragStart(event: DragEvent, view: ScreenView, card: HTMLElement): void {
    this.dragging.set(view);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', view);
      event.dataTransfer.setDragImage?.(card, 24, 24);
    }
  }

  onDragOver(event: DragEvent, view: ScreenView): void {
    if (!this.dragging()) return;
    event.preventDefault();
    if (this.dropTarget() !== view) this.dropTarget.set(view);
  }

  onDrop(event: DragEvent, view: ScreenView): void {
    event.preventDefault();
    const dragged = this.dragging();
    this.endDrag();
    if (!dragged || dragged === view) return;
    this.output.moveViewTo(dragged, this.output.viewOrder().indexOf(view));
    this.announcement.set(this.ts.format('SCREEN.UI.VIEWS.MOVED', {
      view: this.viewLabel(dragged), position: this.output.viewOrder().indexOf(dragged) + 1, total: ALL_SCREEN_VIEWS.length
    }));
  }

  endDrag(): void {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }
}
