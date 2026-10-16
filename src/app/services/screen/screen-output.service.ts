import { Injectable, NgZone, OnDestroy, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DisplayStateService } from './display-state.service';
import { SerialLinkService } from './serial-link.service';
import { TickService } from './tick.service';
import { DESK_STATUS_HEARTBEAT_MS, DeskDisplayStatusService } from './desk-display-status.service';
import { fillDemoData } from './demo-data';
import { FontId, ThemeId, isFontId, isThemeId } from './theme-tokens';
import { isFiniteNumber, isRecord, parseJson, readStorage, writeStorage } from '../safe-storage';
import { REQUIRED_FONT_SHORTHANDS, drawScreen } from './screen-renderer';
import { ALL_SCREEN_VIEWS, ScreenView, ScreenViewMode } from './display-snapshot';
import {
  BrightnessConfig, DEFAULT_BRIGHTNESS_CONFIG, DEFAULT_VIEW_DURATIONS, ViewDurations, ViewInputs, RotationInfo,
  clampViewSeconds, MIN_VIEW_SECONDS, MAX_VIEW_SECONDS, effectiveBrightness, offsetToShow, rotationInfo, pixelShift, viewHasContent
} from './screen-logic';
import { DisplaySnapshot } from './display-snapshot';
import { DEFAULT_BAND_PAUSE_MS, MAX_BAND_PAUSE_MS } from './serial-link.service';
import { LOCKS_API, LOCK_DESK_DISPLAY } from '../web-locks';
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
  /** Pause after each band of a tall frame, 0..20 ms. */
  bandPauseMs: number;
  /** Order of the views in the rotation (a permutation of every view). */
  viewOrder: ScreenView[];
  /** Seconds each view stays on screen in the automatic rotation (10..60). */
  viewSeconds: ViewDurations;
  /** The display was connected last time: try to reconnect on startup. */
  autoConnect: boolean;
}

const STORAGE_KEY = 'auratime_screen';

const clampInt = (value: unknown, min: number, max: number): number | undefined =>
  isFiniteNumber(value) ? Math.min(max, Math.max(min, Math.round(value))) : undefined;

/**
 * Keeps only the valid fields of the stored screen preferences (a damaged value is dropped, never trusted).
 * Exported for the tests.
 */
export function sanitizeScreenPrefs(raw: unknown): Partial<ScreenPrefs> {
  if (!isRecord(raw)) return {};
  const out: Partial<ScreenPrefs> = {};

  const mode = raw['viewMode'];
  if (mode === 'auto' || (typeof mode === 'string' && (ALL_SCREEN_VIEWS as readonly string[]).includes(mode))) out.viewMode = mode as ScreenViewMode;
  if (Array.isArray(raw['rotation'])) out.rotation = ALL_SCREEN_VIEWS.filter(v => (raw['rotation'] as unknown[]).includes(v));

  if (isRecord(raw['brightness'])) {
    const b = raw['brightness'];
    const brightness: Partial<BrightnessConfig> = {};
    const base = clampInt(b['base'], 0, 100);
    const nightLevel = clampInt(b['nightLevel'], 0, 100);
    const from = clampInt(b['nightFromHour'], 0, 23);
    const to = clampInt(b['nightToHour'], 0, 23);
    if (base !== undefined) brightness.base = base;
    if (nightLevel !== undefined) brightness.nightLevel = nightLevel;
    if (from !== undefined) brightness.nightFromHour = from;
    if (to !== undefined) brightness.nightToHour = to;
    if (typeof b['nightEnabled'] === 'boolean') brightness.nightEnabled = b['nightEnabled'];
    if (typeof b['nightBlack'] === 'boolean') brightness.nightBlack = b['nightBlack'];
    out.brightness = { ...DEFAULT_BRIGHTNESS_CONFIG, ...brightness };
  }

  if (Array.isArray(raw['viewOrder'])) {
    // keep the stored order of the valid, distinct views, then add any view the list was missing
    const seen = (raw['viewOrder'] as unknown[]).filter((v, i, all): v is ScreenView =>
      (ALL_SCREEN_VIEWS as readonly unknown[]).includes(v) && all.indexOf(v) === i);
    out.viewOrder = [...seen, ...ALL_SCREEN_VIEWS.filter(v => !seen.includes(v))];
  }
  if (isRecord(raw['viewSeconds'])) {
    const seconds = { ...DEFAULT_VIEW_DURATIONS };
    for (const view of ALL_SCREEN_VIEWS) {
      const value = clampInt(raw['viewSeconds'][view], MIN_VIEW_SECONDS, MAX_VIEW_SECONDS);
      if (value !== undefined) seconds[view] = value;
    }
    out.viewSeconds = seconds;
  }
  const pause = clampInt(raw['bandPauseMs'], 0, MAX_BAND_PAUSE_MS);
  if (pause !== undefined) out.bandPauseMs = pause;

  for (const key of ['flowControl', 'demo', 'alwaysFullFrame', 'slowSend', 'autoConnect'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  }
  if (typeof raw['themePin'] === 'string' && isThemeId(raw['themePin'])) out.themePin = raw['themePin'];
  if (isFontId(raw['fontPin'])) out.fontPin = raw['fontPin'];
  return out;
}
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
  bandPauseMs: DEFAULT_BAND_PAUSE_MS,
  viewOrder: [...ALL_SCREEN_VIEWS],
  viewSeconds: { ...DEFAULT_VIEW_DURATIONS },
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
  private locks = inject(LOCKS_API);

  /**
   * Only one /screen window may drive the display: two windows writing to the same port would corrupt the
   * picture and fight over the shared status. 'unknown' until the lock answers, 'owner' for the window that
   * holds it, 'other' for a window that found it taken (it keeps a preview but never touches the port).
   */
  readonly ownership = signal<'unknown' | 'owner' | 'other'>('unknown');
  private releaseOwnership: (() => void) | null = null;
  private abortClaim: AbortController | null = null;

  readonly viewMode = signal<ScreenViewMode>(DEFAULT_PREFS.viewMode);
  /** Views that take part in the automatic rotation (only those with content are actually shown). */
  readonly rotation = signal<ScreenView[]>(DEFAULT_PREFS.rotation);
  /** Order in which the views rotate (every view appears once; `rotation` says which of them take part). */
  readonly viewOrder = signal<ScreenView[]>(DEFAULT_PREFS.viewOrder);
  /** Seconds each view stays on screen in the automatic rotation. */
  readonly viewSeconds = signal<ViewDurations>(DEFAULT_PREFS.viewSeconds);
  /** The automatic rotation is held on the current view (not saved: a reload resumes the rotation). */
  readonly paused = signal(false);
  private pausedView: ScreenView = 'clock';
  /** A view is pinned (the display stays on it). */
  readonly pinned = computed(() => this.viewMode() !== 'auto');
  /** Where the rotation is right now, for the progress bar. */
  readonly rotationProgress = signal<RotationInfo>({ view: 'clock', rotating: false, elapsedSec: 0, durationSec: 0 });
  /** When the current connection came up (ms since the epoch), or null. */
  readonly connectedAt = signal<number | null>(null);
  private rotationOffsetSec = 0;
  private redrawQueued = false;
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
  readonly bandPauseMs = signal<number>(DEFAULT_PREFS.bandPauseMs);
  /** The view currently on screen (useful for the preview UI). */
  readonly activeView = signal<ScreenView>('clock');
  /** Diagnostic: full redraws forced because a transfer failed (the display's state was then unknown). */
  readonly forcedFullRedraws = signal<number>(0);
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
        const pause = this.bandPauseMs();
        untracked(() => this.link.bandPauseMs.set(pause));
      });
      effect(() => {
        const delay = this.slowSend() ? SLOW_SEND_CHUNK_DELAY_MS : 0;
        untracked(() => this.link.chunkDelayMs.set(delay));
      });

      // Tell the other windows (the clock's settings) whether a display is connected.
      effect(() => {
        const connected = this.link.status() === 'connected';
        this.ownership();
        untracked(() => this.publishStatus(connected));
      });

      // A fresh connection starts from a blank display: resend everything.
      effect(() => {
        const connected = this.link.status() === 'connected';
        untracked(() => this.connectedAt.set(connected ? (this.connectedAt() ?? Date.now()) : null));
      }, { allowSignalWrites: true });

      // A change made on the page shows in the preview at once, not on the next tick.
      effect(() => {
        this.viewMode(); this.rotation(); this.viewOrder(); this.viewSeconds(); this.paused();
        this.themePin(); this.fontPin(); this.brightness(); this.demoActive();
        untracked(() => this.scheduleRedraw());
      });

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
    this.claimDisplay();

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
      if (this.isOwner()) this.deskStatus.publish(false); // a window that never owned the display says nothing
      this.releaseDisplay();
    }
  }

  private isOwner(): boolean {
    return this.ownership() === 'owner';
  }

  /**
   * Takes the display lock without waiting. If another window has it, this one becomes a read-only preview and
   * waits in the queue, taking over (and starting to drive the display) when the other window goes away.
   * Where Web Locks do not exist there is nothing to coordinate with, so the window simply owns the display.
   */
  private claimDisplay(): void {
    const locks = this.locks;
    if (!locks) {
      this.ownership.set('owner');
      return;
    }
    const abort = new AbortController();
    this.abortClaim = abort;
    const hold = () => new Promise<void>(resolve => (this.releaseOwnership = resolve));
    const become = async () => {
      this.ownership.set('owner');
      await hold();
    };

    locks
      .request(LOCK_DESK_DISPLAY, { ifAvailable: true }, async lock => {
        if (lock) return become();
        this.ownership.set('other');
        await locks.request(LOCK_DESK_DISPLAY, { signal: abort.signal }, become);
      })
      .catch(error => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        // Never leave the display unusable because coordination failed: carry on as the owner.
        console.warn('[ScreenOutput] could not use the display lock', error);
        this.ownership.set('owner');
      });
  }

  private releaseDisplay(): void {
    this.abortClaim?.abort();
    this.abortClaim = null;
    this.releaseOwnership?.();
    this.releaseOwnership = null;
    this.ownership.set('unknown');
  }

  /** The Desk Display window is going away: other windows must not keep showing "connected". */
  private onPageHide = () => {
    if (this.isOwner()) this.deskStatus.publish(false);
  };

  /** Tell the other windows right away that this page is (no longer) hidden, so their indicator stays right. */
  private onVisibilityChange = () => {
    if (document.hidden) this.hiddenSinceLastFrame = true;
    this.publishStatus(this.link.isConnected());
  };

  private publishStatus(connected: boolean): void {
    if (!this.isOwner()) return; // the status belongs to the window that drives the display
    this.lastHeartbeat = Date.now();
    this.deskStatus.publish(connected, typeof document !== 'undefined' && document.hidden);
  }

  /** Must be called from a click: opens the browser's device picker. */
  async connect(): Promise<boolean> {
    if (this.ownership() === 'other') return false;
    const ok = await this.zone.runOutsideAngular(() => this.link.connect(this.connectOptions()));
    if (ok) this.autoConnect = true;
    this.persistPrefs();
    return ok;
  }

  async disconnect(): Promise<void> {
    if (this.ownership() === 'other') return;
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

  /** The snapshot the display draws: the app's data, or sample data in demo mode, with the pinned theme and font. */
  buildSnapshot(): DisplaySnapshot {
    let snap = this.display.snapshot();
    if (this.demoActive()) snap = fillDemoData(snap);
    const themePin = this.themePin();
    const fontPin = this.fontPin();
    if (themePin || fontPin) snap = { ...snap, theme: themePin ?? snap.theme, fontId: fontPin ?? snap.fontId };
    return snap;
  }

  /** What to show right now, from the snapshot and the user's choices. */
  private rotationInputs(snap: DisplaySnapshot): ViewInputs {
    return {
      mode: this.paused() && this.viewMode() === 'auto' ? this.pausedView : this.viewMode(),
      focusRunning: snap.focus.phase !== 'idle',
      enabled: this.rotation(),
      hasContent: viewHasContent(snap),
      nowMs: snap.now.getTime(),
      order: this.viewOrder(),
      durations: this.viewSeconds(),
      offsetSec: this.rotationOffsetSec
    };
  }

  /** Draws the current state on the canvas (the preview, and the picture sent to the display). */
  private paint(): { now: Date; level: number } {
    const snap = this.buildSnapshot();
    const now = snap.now;
    const info = rotationInfo(this.rotationInputs(snap));
    const { level, black } = effectiveBrightness(now, this.brightness());
    this.activeView.set(info.view);
    this.rotationProgress.set(info);
    this.appliedBrightness.set(level);
    drawScreen(this.ctx!, snap, info.view, { shift: pixelShift(now), black });
    return { now, level };
  }

  /** Redraws the preview only (never sends), at most once per animation frame. */
  private scheduleRedraw(): void {
    if (!this.isBrowser || !this.ctx || this.redrawQueued || !this.started) return;
    this.redrawQueued = true;
    this.zone.runOutsideAngular(() => requestAnimationFrame(() => {
      this.redrawQueued = false;
      if (this.started) this.paint();
    }));
  }

  /** A frame is being handed to the display right now. */
  isSending(): boolean {
    return this.busy;
  }

  /** Draws and sends right away, outside Angular's zone (for the previous / next buttons). */
  renderNow(): void {
    this.zone.runOutsideAngular(() => void this.renderFrame());
  }

  /* ------------------------------ view controls ------------------------------ */

  /** Views the rotation shows right now: enabled, with something to show, in rotation order. */
  activeRotation(): ScreenView[] {
    const content = viewHasContent(this.buildSnapshot());
    return this.viewOrder().filter(v => this.rotation().includes(v) && content[v]);
  }

  private neighbour(delta: 1 | -1): ScreenView {
    const views = this.activeRotation();
    const list = views.length ? views : this.viewOrder();
    const at = list.indexOf(this.activeView());
    return list[at < 0 ? 0 : (at + delta + list.length) % list.length];
  }

  /** Previous / next view. Pinned: moves the pin. Paused: moves the held view. Rotating: jumps in the rotation. */
  stepView(delta: 1 | -1): void {
    const target = this.neighbour(delta);
    if (this.pinned()) {
      this.viewMode.set(target);
    } else if (this.paused()) {
      this.pausedView = target;
    } else {
      const snap = this.buildSnapshot();
      this.rotationOffsetSec = offsetToShow({ ...this.rotationInputs(snap), offsetSec: 0 }, target, 0);
    }
    this.paint();
    this.renderNow();
  }

  /** Holds the rotation on the view now showing, or lets it go on from where it stopped. */
  togglePause(): void {
    if (this.pinned()) return; // a pinned view is already held
    if (this.paused()) {
      const snap = this.buildSnapshot();
      const info = this.rotationProgress();
      this.rotationOffsetSec = offsetToShow({ ...this.rotationInputs(snap), mode: 'auto', offsetSec: 0 }, this.pausedView, info.elapsedSec);
      this.paused.set(false);
    } else {
      this.pausedView = this.activeView();
      this.paused.set(true);
    }
    this.paint();
  }

  /** Keeps the display on one view (or, with null, goes back to the automatic rotation). */
  pinView(view: ScreenView | null): void {
    this.paused.set(false);
    this.viewMode.set(view ?? 'auto');
    this.paint();
    this.renderNow();
  }

  /** Moves a view up or down in the rotation order. */
  moveView(view: ScreenView, delta: -1 | 1): void {
    this.moveViewTo(view, this.viewOrder().indexOf(view) + delta);
  }

  /** Puts a view at a given position of the rotation order. */
  moveViewTo(view: ScreenView, index: number): void {
    const order = this.viewOrder();
    const from = order.indexOf(view);
    const to = Math.min(order.length - 1, Math.max(0, index));
    if (from < 0 || from === to) return;
    const next = order.filter(v => v !== view);
    next.splice(to, 0, view);
    this.viewOrder.set(next);
  }

  setViewSeconds(view: ScreenView, seconds: number): void {
    this.viewSeconds.update(d => ({ ...d, [view]: clampViewSeconds(seconds) }));
  }

  /** Draws the current snapshot and, if connected, pushes the changes. Safe to call at any time. */
  async renderFrame(): Promise<void> {
    if (!this.ctx || !this.canvas) return;

    const { now, level } = this.paint();

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
      // A bitmap may have been cut off mid-way: the display could be waiting for pixels that will never come,
      // so nothing it shows can be trusted. Drop the port (the reconnection re-initialises it) and redraw it
      // all, band by band, before any partial update is sent again.
      this.invalidateFrame();
      this.forcedFullRedraws.update(n => n + 1);
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
    if (!this.isOwner() || !this.autoConnect || !this.link.isSupported()) return;
    const status = this.link.status();
    if (status === 'connecting' || status === 'connected' || status === 'unsupported') return;

    const delay = Math.min(this.reconnectBaseMs * 2 ** Math.max(0, this.reconnectFailures - 1), RECONNECT_MAX_MS);
    if (wallNow - this.lastReconnectAttempt < delay) return;
    this.lastReconnectAttempt = wallNow;

    const ok = await this.link.reconnect(this.connectOptions(), { silent: true });
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
    const p = sanitizeScreenPrefs(parseJson(readStorage(STORAGE_KEY)));
    if (p.viewMode) this.viewMode.set(p.viewMode);
    if (p.rotation) this.rotation.set(p.rotation);
    if (p.viewOrder) this.viewOrder.set(p.viewOrder);
    if (p.viewSeconds) this.viewSeconds.set(p.viewSeconds);
    if (p.brightness) this.brightness.set(p.brightness);
    if (p.flowControl !== undefined) this.flowControl.set(p.flowControl);
    if (p.themePin) this.themePin.set(p.themePin);
    if (p.fontPin) this.fontPin.set(p.fontPin);
    if (p.demo !== undefined) this.demoEnabled.set(p.demo);
    if (p.alwaysFullFrame !== undefined) this.alwaysFullFrame.set(p.alwaysFullFrame);
    if (p.slowSend !== undefined) this.slowSend.set(p.slowSend);
    if (p.bandPauseMs !== undefined) this.bandPauseMs.set(p.bandPauseMs);
    if (p.autoConnect !== undefined) this.autoConnect = p.autoConnect;
  }

  private persistPrefs(): void {
    const prefs: ScreenPrefs = {
      viewMode: this.viewMode(),
      rotation: this.rotation(),
      viewOrder: this.viewOrder(),
      viewSeconds: this.viewSeconds(),
      brightness: this.brightness(),
      flowControl: this.flowControl(),
      themePin: this.themePin(),
      fontPin: this.fontPin(),
      demo: this.demoEnabled(),
      alwaysFullFrame: this.alwaysFullFrame(),
      slowSend: this.slowSend(),
      bandPauseMs: this.bandPauseMs(),
      autoConnect: this.autoConnect
    };
    writeStorage(STORAGE_KEY, JSON.stringify(prefs));
  }
}
