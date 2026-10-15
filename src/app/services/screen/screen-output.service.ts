import { Injectable, NgZone, OnDestroy, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DisplayStateService } from './display-state.service';
import { SerialLinkService } from './serial-link.service';
import { TickService } from './tick.service';
import { DESK_STATUS_HEARTBEAT_MS, DeskDisplayStatusService } from './desk-display-status.service';
import { fillDemoData } from './demo-data';
import { FONT_TOKENS, FontId, ThemeId, isThemeId } from './theme-tokens';
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
  /** Pin the display's theme (null = follow the app). */
  themePin: ThemeId | null;
  /** Pin the display's font (null = follow the app). */
  fontPin: FontId | null;
  /** Show sample data while no display is connected. */
  demo: boolean;
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
/**
 * Time between ticks above which we assume the PC slept (ticks are 1 s apart). Only applied while the page is
 * visible: a hidden page is throttled by the browser (1 tick a second, then about 1 a minute) and that gap
 * says nothing about the display.
 */
const SLEEP_GAP_MS = 5000;
/** Automatic reconnection: first retry after this long, doubling up to the maximum. */
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 30000;

const DEFAULT_PREFS: ScreenPrefs = {
  viewMode: 'auto',
  rotation: [...ALL_SCREEN_VIEWS],
  brightness: DEFAULT_BRIGHTNESS_CONFIG,
  flowControl: true,
  themePin: null,
  fontPin: null,
  demo: true,
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
  private deskStatus = inject(DeskDisplayStatusService);

  readonly viewMode = signal<ScreenViewMode>(DEFAULT_PREFS.viewMode);
  /** Views that take part in the automatic rotation (only those with content are actually shown). */
  readonly rotation = signal<ScreenView[]>(DEFAULT_PREFS.rotation);
  readonly brightness = signal<BrightnessConfig>(DEFAULT_PREFS.brightness);
  readonly flowControl = signal<boolean>(DEFAULT_PREFS.flowControl);
  /** Pinned theme / font; null means "follow the app". */
  readonly themePin = signal<ThemeId | null>(DEFAULT_PREFS.themePin);
  readonly fontPin = signal<FontId | null>(DEFAULT_PREFS.fontPin);
  /** The user allows sample data while no display is connected. */
  readonly demoEnabled = signal<boolean>(DEFAULT_PREFS.demo);
  /**
   * True while the preview shows sample data: no display connected and demo allowed. In a browser
   * without Web Serial there will never be a display, so the demo is always on.
   */
  readonly demoActive = computed(
    () => this.link.status() !== 'connected' && (this.demoEnabled() || !this.link.isSupported())
  );
  readonly alwaysFullFrame = signal<boolean>(DEFAULT_PREFS.alwaysFullFrame);
  readonly slowSend = signal<boolean>(DEFAULT_PREFS.slowSend);
  /** The view currently on screen (useful for the preview UI). */
  readonly activeView = signal<ScreenView>('clock');
  /** Backlight actually applied right now (after the night schedule). */
  readonly appliedBrightness = signal<number>(DEFAULT_PREFS.brightness.base);

  /** The canvas that is drawn and sent; the /screen page shows it as a live preview. */
  readonly canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null = null;

  /** Wait before the first automatic reconnection attempt. Adjustable for tests. */
  reconnectBaseMs = RECONNECT_BASE_MS;
  private reconnectFailures = 0;
  private lastReconnectAttempt = 0;
  private lastFrameAt = 0;
  private lastHeartbeat = 0;
  /** The page was hidden at some point since the last frame: the next gap is throttling, not sleep. */
  private hiddenSinceLastFrame = false;

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

      // Tell the other windows (the clock's settings) whether a display is connected.
      effect(() => {
        const connected = this.link.status() === 'connected';
        untracked(() => this.publishStatus(connected));
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
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.unsubscribeTick = this.tick.onTick(() => this.zone.runOutsideAngular(() => void this.renderFrame()));
    // The first frame also kicks off the reconnection to the display used last time (if any).
    await this.zone.runOutsideAngular(() => this.renderFrame());
  }

  stop(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
    this.started = false;
    if (this.isBrowser) {
      window.removeEventListener('pagehide', this.onPageHide);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.deskStatus.publish(false);
    }
  }

  /** The Desk Display window is going away: other windows must not keep showing "connected". */
  private onPageHide = () => this.deskStatus.publish(false);

  /** Tell the other windows right away that this page is (no longer) hidden, so their indicator stays right. */
  private onVisibilityChange = () => {
    if (document.hidden) this.hiddenSinceLastFrame = true;
    this.publishStatus(this.link.isConnected());
  };

  private publishStatus(connected: boolean): void {
    this.lastHeartbeat = Date.now();
    this.deskStatus.publish(connected, typeof document !== 'undefined' && document.hidden);
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

    let snap = this.display.snapshot();
    if (this.demoActive()) snap = fillDemoData(snap);
    const themePin = this.themePin();
    const fontPin = this.fontPin();
    if (themePin || fontPin) snap = { ...snap, theme: themePin ?? snap.theme, fontId: fontPin ?? snap.fontId };
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

    if (Date.now() - this.lastHeartbeat >= DESK_STATUS_HEARTBEAT_MS) {
      this.publishStatus(this.link.isConnected());
    }

    // A long gap between frames while the page is visible means the PC slept: the display may have lost its
    // picture. While hidden (or just after) the gap is the browser's throttling, and resending the whole
    // 300 KB picture on every throttled tick would only make things worse.
    const wallNow = Date.now();
    const throttled = document.hidden || this.hiddenSinceLastFrame;
    if (this.lastFrameAt && wallNow - this.lastFrameAt > SLEEP_GAP_MS && !throttled) {
      this.invalidateFrame();
    }
    if (!document.hidden) this.hiddenSinceLastFrame = false;
    this.lastFrameAt = wallNow;

    if (!this.link.isConnected()) {
      void this.maybeReconnect(wallNow);
      return;
    }
    this.reconnectFailures = 0;
    if (this.busy) return;
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

  /**
   * Keeps an always-on display alive: if it was connected before and the link is down
   * (unplugged, PC slept, write error), retry quietly with a growing delay.
   */
  private async maybeReconnect(wallNow: number): Promise<void> {
    if (!this.autoConnect || !this.link.isSupported()) return;
    const status = this.link.status();
    if (status === 'connecting' || status === 'connected' || status === 'unsupported') return;

    const delay = Math.min(this.reconnectBaseMs * 2 ** Math.max(0, this.reconnectFailures - 1), RECONNECT_MAX_MS);
    if (wallNow - this.lastReconnectAttempt < delay) return;
    this.lastReconnectAttempt = wallNow;

    const ok = await this.link.reconnect(this.connectOptions());
    this.reconnectFailures = ok ? 0 : Math.min(this.reconnectFailures + 1, 10);
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
      if (p.themePin && isThemeId(p.themePin)) this.themePin.set(p.themePin);
      if (p.fontPin && p.fontPin in FONT_TOKENS) this.fontPin.set(p.fontPin);
      if (typeof p.demo === 'boolean') this.demoEnabled.set(p.demo);
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
      themePin: this.themePin(),
      fontPin: this.fontPin(),
      demo: this.demoEnabled(),
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
