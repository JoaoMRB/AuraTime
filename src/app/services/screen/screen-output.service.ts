import { Injectable, NgZone, OnDestroy, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DisplayStateService } from './display-state.service';
import { SerialLinkService } from './serial-link.service';
import { TickService } from './tick.service';
import { REQUIRED_FONT_SHORTHANDS, drawScreen } from './screen-renderer';
import { ALL_SCREEN_VIEWS, ScreenView, ScreenViewMode } from './display-snapshot';
import {
  BrightnessConfig, DEFAULT_BRIGHTNESS_CONFIG, effectiveBrightness, pickView, pixelShift, viewHasContent
} from './screen-logic';
import { SCREEN_HEIGHT, SCREEN_WIDTH, diffRect, extractRect, rgbaToRgb565 } from './turing-protocol';

/** User preferences for the screen, persisted under `auratime_screen`. */
export interface ScreenPrefs {
  viewMode: ScreenViewMode;
  /** Views allowed in the automatic rotation. */
  rotation: ScreenView[];
  brightness: BrightnessConfig;
  flowControl: boolean;
  /** Diagnostic: resend the whole 480x320 frame every second instead of only the changed rectangle. */
  alwaysFullFrame: boolean;
  /** Diagnostic: pause 3 ms after every chunk (what the prototype called "slow send"). */
  slowSend: boolean;
  /** The display was connected last time: try to reconnect on startup. */
  autoConnect: boolean;
}

const STORAGE_KEY = 'auratime_screen';
/** Resend the whole frame this often to heal any glitch on the display. */
const FULL_REFRESH_MS = 5 * 60 * 1000;

const DEFAULT_PREFS: ScreenPrefs = {
  viewMode: 'auto',
  rotation: [...ALL_SCREEN_VIEWS],
  brightness: DEFAULT_BRIGHTNESS_CONFIG,
  flowControl: true,
  alwaysFullFrame: false,
  slowSend: false,
  autoConnect: false
};

/** Pause per chunk in slow-send diagnostic mode. */
const SLOW_SEND_CHUNK_DELAY_MS = 3;

/**
 * Draws the DisplaySnapshot onto a 480x320 canvas once per second and, when the display is
 * connected, sends only the rectangle that changed.
 */
@Injectable({
  providedIn: 'root'
})
export class ScreenOutputService implements OnDestroy {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private display = inject(DisplayStateService);
  private link = inject(SerialLinkService);
  private tick = inject(TickService);
  private zone = inject(NgZone);

  readonly viewMode = signal<ScreenViewMode>(DEFAULT_PREFS.viewMode);
  /** Views that take part in the automatic rotation (only those with content are actually shown). */
  readonly rotation = signal<ScreenView[]>(DEFAULT_PREFS.rotation);
  readonly brightness = signal<BrightnessConfig>(DEFAULT_PREFS.brightness);
  readonly flowControl = signal<boolean>(DEFAULT_PREFS.flowControl);
  readonly alwaysFullFrame = signal<boolean>(DEFAULT_PREFS.alwaysFullFrame);
  readonly slowSend = signal<boolean>(DEFAULT_PREFS.slowSend);
  /** The view currently on screen (useful for the preview UI). */
  readonly activeView = signal<ScreenView>('clock');
  /** Backlight actually applied right now (after the night schedule). */
  readonly appliedBrightness = signal<number>(DEFAULT_PREFS.brightness.base);

  /** The canvas that is drawn and sent; the /screen page shows it as a live preview. */
  readonly canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null = null;

  private autoConnect = DEFAULT_PREFS.autoConnect;
  private started = false;
  private busy = false;
  private prevFrame: Uint16Array | null = null;
  /**
   * Bumped whenever prevFrame is invalidated. A send that was already in flight must not
   * re-install its (now stale) frame as the reference when it finishes.
   */
  private epoch = 0;
  private lastFullRefresh = 0;
  private lastSentBrightness: number | null = null;
  private unsubscribeTick: (() => void) | null = null;

  constructor() {
    if (this.isBrowser) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = SCREEN_WIDTH;
      this.canvas.height = SCREEN_HEIGHT;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.loadPrefs();

      effect(() => this.persistPrefs());
      effect(() => {
        const delay = this.slowSend() ? SLOW_SEND_CHUNK_DELAY_MS : 0;
        untracked(() => this.link.chunkDelayMs.set(delay));
      });

      // A fresh connection starts from a blank display: resend everything.
      effect(() => {
        if (this.link.status() === 'connected') {
          untracked(() => {
            this.invalidateFrame();
            this.lastSentBrightness = null;
            void this.renderFrame();
          });
        }
      });
    } else {
      this.canvas = null;
    }
  }

  /** Starts the render loop (idempotent). Waits for the fonts so the first frame is not drawn in a fallback. */
  async start(): Promise<void> {
    if (!this.isBrowser || this.started) return;
    this.started = true;

    try {
      await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
    } catch {
      /* fonts missing: the renderer falls back to system fonts */
    }

    // The loop runs outside Angular's zone: change detection between two chunks of one bitmap
    // would open gaps in the serial stream, which the display may not tolerate.
    this.unsubscribeTick = this.tick.onTick(() => this.zone.runOutsideAngular(() => void this.renderFrame()));
    await this.renderFrame();

    if (this.autoConnect && this.link.isSupported()) {
      await this.zone.runOutsideAngular(() => this.link.reconnect(this.connectOptions()));
    }
  }

  stop(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
    this.started = false;
  }

  /** Must be called from a click: opens the browser's device picker. */
  async connect(): Promise<boolean> {
    const ok = await this.zone.runOutsideAngular(() => this.link.connect(this.connectOptions()));
    if (ok) this.autoConnect = true;
    this.persistPrefs();
    return ok;
  }

  async disconnect(): Promise<void> {
    this.autoConnect = false;
    await this.link.disconnect();
    this.persistPrefs();
  }

  /** Forces the next frame to be sent in full. */
  refreshAll(): void {
    this.invalidateFrame();
  }

  private invalidateFrame(): void {
    this.prevFrame = null;
    this.epoch++;
  }

  /** Adds or removes a view from the automatic rotation. */
  setInRotation(view: ScreenView, included: boolean): void {
    this.rotation.update(list => {
      const without = list.filter(v => v !== view);
      return included ? ALL_SCREEN_VIEWS.filter(v => v === view || without.includes(v)) : without;
    });
  }

  setBrightnessBase(level: number): void {
    this.brightness.update(b => ({ ...b, base: level }));
  }

  patchBrightness(patch: Partial<BrightnessConfig>): void {
    this.brightness.update(b => ({ ...b, ...patch }));
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /* ------------------------------ rendering ------------------------------ */

  /** Draws the current snapshot and, if connected, pushes the changes. Safe to call at any time. */
  async renderFrame(): Promise<void> {
    if (!this.ctx || !this.canvas) return;

    const snap = this.display.snapshot();
    const now = snap.now;
    const view = pickView({
      mode: this.viewMode(),
      focusRunning: snap.focus.phase !== 'idle',
      enabled: this.rotation(),
      hasContent: viewHasContent(snap),
      nowMs: now.getTime()
    });
    const { level, black } = effectiveBrightness(now, this.brightness());

    this.activeView.set(view);
    this.appliedBrightness.set(level);
    drawScreen(this.ctx, snap, view, { shift: pixelShift(now), black });

    if (!this.link.isConnected() || this.busy) return;
    this.busy = true;
    try {
      if (now.getTime() - this.lastFullRefresh > FULL_REFRESH_MS) {
        this.invalidateFrame();
        this.lastFullRefresh = now.getTime();
      }
      if (level !== this.lastSentBrightness) {
        await this.link.setBrightness(level);
        this.lastSentBrightness = level;
      }
      await this.pushFrame();
    } catch (e) {
      this.invalidateFrame();
      await this.link.fail(e);
    } finally {
      this.busy = false;
    }
  }

  private async pushFrame(): Promise<void> {
    const ctx = this.ctx!;
    const cur = rgbaToRgb565(ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).data);
    const epoch = this.epoch;
    const reference = this.alwaysFullFrame() ? null : this.prevFrame;
    const rect = diffRect(reference, cur, SCREEN_WIDTH, SCREEN_HEIGHT);
    if (!rect) return;
    await this.link.sendBitmap(rect, extractRect(cur, SCREEN_WIDTH, rect));
    // Only after the whole bitmap was written, and only if nobody invalidated the reference meanwhile.
    if (epoch === this.epoch) this.prevFrame = cur;
  }

  /* ------------------------------ preferences ------------------------------ */

  private connectOptions() {
    return { flowControl: this.flowControl(), brightness: this.appliedBrightness() };
  }

  private loadPrefs(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<ScreenPrefs>;
      if (p.viewMode && (p.viewMode === 'auto' || ALL_SCREEN_VIEWS.includes(p.viewMode))) this.viewMode.set(p.viewMode);
      if (Array.isArray(p.rotation)) {
        this.rotation.set(ALL_SCREEN_VIEWS.filter(v => p.rotation!.includes(v)));
      }
      if (p.brightness) this.brightness.set({ ...DEFAULT_BRIGHTNESS_CONFIG, ...p.brightness });
      if (typeof p.flowControl === 'boolean') this.flowControl.set(p.flowControl);
      if (typeof p.alwaysFullFrame === 'boolean') this.alwaysFullFrame.set(p.alwaysFullFrame);
      if (typeof p.slowSend === 'boolean') this.slowSend.set(p.slowSend);
      if (typeof p.autoConnect === 'boolean') this.autoConnect = p.autoConnect;
    } catch {
      /* corrupted prefs: keep defaults */
    }
  }

  private persistPrefs(): void {
    const prefs: ScreenPrefs = {
      viewMode: this.viewMode(),
      rotation: this.rotation(),
      brightness: this.brightness(),
      flowControl: this.flowControl(),
      alwaysFullFrame: this.alwaysFullFrame(),
      slowSend: this.slowSend(),
      autoConnect: this.autoConnect
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  }
}
