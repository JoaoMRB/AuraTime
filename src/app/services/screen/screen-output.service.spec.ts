import { TestBed } from '@angular/core/testing';
import { EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { ScreenOutputService } from './screen-output.service';
import { DisplayStateService } from './display-state.service';
import { SERIAL_API } from './serial-link.service';
import { LOCKS_API, LOCK_DESK_DISPLAY } from '../web-locks';
import { FakeLockManager, flushLocks } from '../testing/fake-locks';
import { SerialLinkService } from './serial-link.service';
import { TickService } from './tick.service';
import { DisplaySnapshot } from './display-snapshot';
import { englishLabels } from './testing/english-labels';
import { FakePort, FakeSerial } from './testing/fake-serial';
import { REQUIRED_FONT_SHORTHANDS } from './screen-renderer';
import { cmdDisplayBitmap } from './turing-protocol';
import { DESK_STATUS_KEY, DeskDisplayStatusService } from './desk-display-status.service';

function snap(overrides: Partial<DisplaySnapshot> = {}): DisplaySnapshot {
  return {
    now: new Date(2026, 0, 15, 12, 0, 5),
    theme: 'emerald-gold',
    fontId: 'outfit',
    clock: { hhmm: '12:00', seconds: 5, ampm: '', dateLabel: 'Thursday, January 15', use24h: true },
    focus: { phase: 'idle', remainingSec: 1500, totalSec: 1500, tasks: [] },
    stats: { todayMin: 0, streak: 0 },
    week: { days: [], totalMin: 0, streak: 0 },
    worldClocks: [],
    labels: englishLabels(),
    ...overrides
  };
}

const flush = (ms = 0) => new Promise(r => setTimeout(r, ms));
/** Reads the (x0,y0,x1,y1) rectangle out of a 6-byte DISPLAY_BITMAP header. */
function headerRect(h: Uint8Array) {
  return {
    x0: (h[0] << 2) | (h[1] >> 6),
    y0: ((h[1] & 63) << 4) | (h[2] >> 4),
    x1: ((h[2] & 15) << 6) | (h[3] >> 2),
    y1: ((h[3] & 3) << 8) | h[4]
  };
}

describe('ScreenOutputService', () => {
  let state: ReturnType<typeof signal<DisplaySnapshot>>;
  let serial: FakeSerial;
  let port: FakePort;
  let service: ScreenOutputService;
  let link: SerialLinkService;

  /** Every DISPLAY_BITMAP header sent, with the bands of one tall frame merged back into one rectangle. */
  function bitmapHeaders(): Uint8Array[] {
    const merged: ReturnType<typeof headerRect>[] = [];
    for (const w of port.writes.filter(w => w.length === 6 && w[5] === 197)) {
      const r = headerRect(w);
      const last = merged[merged.length - 1];
      if (last && last.x0 === r.x0 && last.x1 === r.x1 && last.y1 + 1 === r.y0) last.y1 = r.y1;
      else merged.push(r);
    }
    return merged.map(r => cmdDisplayBitmap(r));
  }
  function brightnessWrites(): number[] {
    return port.writes
      .filter(w => w.length === 6 && w[5] === 110)
      .map(w => (w[0] << 2) | (w[1] >> 6));
  }

  beforeEach(async () => {
    // Web fonts load lazily: without this the text can change between two frames and look like a diff.
    await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
    localStorage.clear();
    state = signal(snap());
    serial = new FakeSerial();
    port = new FakePort();
    serial.picked = port;
    serial.ports = [port];
    TestBed.configureTestingModule({
      providers: [
        { provide: DisplayStateService, useValue: { snapshot: state } },
        { provide: SERIAL_API, useValue: serial },
        { provide: LOCKS_API, useValue: null }
      ]
    });
    service = TestBed.inject(ScreenOutputService);
    service.ownership.set('owner'); // as after start(): this window drives the display
    link = TestBed.inject(SerialLinkService);
  });

  afterEach(() => localStorage.clear());

  async function connect(): Promise<void> {
    port.reader.replies.push(new Uint8Array([1, 1, 1, 1, 1, 1]));
    await service.connect();
    await flush(300); // init sequence has a 150 ms pause, then the first full frame is sent
    TestBed.flushEffects();
    await flush(50);
  }

  it('draws a preview on the canvas without any display connected', async () => {
    await service.renderFrame();
    const data = service.canvas!.getContext('2d')!.getImageData(0, 0, 480, 320).data;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    expect(colors.size).toBeGreaterThan(10);
    expect(port.writes.length).toBe(0);
    expect(service.activeView()).toBe('clock');
  });

  it('sends the whole frame first, then only the area that changed', async () => {
    await connect();

    const first = bitmapHeaders();
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(headerRect(first[0])).toEqual({ x0: 0, y0: 0, x1: 479, y1: 319 });

    const before = bitmapHeaders().length;
    state.set(snap({ now: new Date(2026, 0, 15, 12, 0, 6), clock: { ...snap().clock, seconds: 6 } }));
    await service.renderFrame();

    const headers = bitmapHeaders();
    expect(headers.length).toBe(before + 1);
    const r = headerRect(headers[headers.length - 1]);
    const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    expect(area).toBeLessThan(480 * 320 * 0.05); // just the seconds line
  });

  it('sends nothing when the frame did not change', async () => {
    await connect();
    const before = bitmapHeaders().length;
    await service.renderFrame();
    expect(bitmapHeaders().length).toBe(before);
  });

  it('applies the night schedule: dim backlight at night, restored by day', async () => {
    await connect();
    expect(brightnessWrites().at(-1)).toBe(Math.round(255 - 0.6 * 255)); // base 60%

    state.set(snap({ now: new Date(2026, 0, 16, 2, 0, 0) }));
    await service.renderFrame();
    expect(brightnessWrites().at(-1)).toBe(Math.round(255 - 0.1 * 255)); // night level 10%
    expect(service.appliedBrightness()).toBe(10);

    state.set(snap({ now: new Date(2026, 0, 16, 12, 0, 0) }));
    await service.renderFrame();
    expect(service.appliedBrightness()).toBe(60);
  });

  it('paints black and turns the backlight off in night-black mode', async () => {
    service.patchBrightness({ nightBlack: true });
    state.set(snap({ now: new Date(2026, 0, 16, 2, 0, 0) }));
    await service.renderFrame();
    const data = service.canvas!.getContext('2d')!.getImageData(0, 0, 480, 320).data;
    expect(data.slice(0, 4000).every((v, i) => i % 4 === 3 || v === 0)).toBeTrue();
    expect(service.appliedBrightness()).toBe(0);
  });

  it('follows a fixed view and the pomodoro pin', async () => {
    service.viewMode.set('focus');
    await service.renderFrame();
    expect(service.activeView()).toBe('focus');

    service.viewMode.set('auto');
    state.set(snap({ focus: { phase: 'work', remainingSec: 100, totalSec: 1500, tasks: [] } }));
    await service.renderFrame();
    expect(service.activeView()).toBe('focus');
  });

  describe('a hidden page (throttled timers)', () => {
    const setHidden = (hidden: boolean) =>
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const fullFrames = () => bitmapHeaders().filter(h => {
      const r = headerRect(h);
      return r.x1 === 479 && r.y1 === 319 && r.x0 === 0 && r.y0 === 0;
    }).length;

    afterEach(() => {
      delete (document as unknown as { hidden?: boolean }).hidden; // back to the browser's own value
    });

    it('does not take a throttled gap for a sleeping PC: nothing is resent', async () => {
      await connect();
      const before = bitmapHeaders().length;
      await service.renderFrame();

      setHidden(true);
      jasmine.clock().install();
      try {
        for (let i = 1; i <= 4; i++) {
          jasmine.clock().mockDate(new Date(Date.now() + i * 60_000)); // about one tick a minute
          await service.renderFrame();
        }
      } finally {
        jasmine.clock().uninstall();
      }
      expect(bitmapHeaders().length).toBe(before);
    });

    it('does not force a full resend when the page comes back into view either', async () => {
      await connect();
      const full = fullFrames();
      await service.renderFrame();
      setHidden(true);
      (service as unknown as { onVisibilityChange(): void }).onVisibilityChange();
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(Date.now() + 90_000));
        await service.renderFrame();
        setHidden(false);
        (service as unknown as { onVisibilityChange(): void }).onVisibilityChange();
        jasmine.clock().mockDate(new Date(Date.now() + 90_000));
        await service.renderFrame();
      } finally {
        jasmine.clock().uninstall();
      }
      expect(fullFrames()).toBe(full);
    });

    it('a visible page with a long gap is still treated as a PC that slept: full resend', async () => {
      await connect();
      const full = fullFrames();
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(Date.now() + 90_000));
        await service.renderFrame();
      } finally {
        jasmine.clock().uninstall();
      }
      expect(fullFrames()).toBe(full + 1);
    });

    it('tells the other windows whether it is hidden, and when that changes', async () => {
      await connect();
      const stored = () => JSON.parse(localStorage.getItem(DESK_STATUS_KEY)!);
      expect(stored().hidden).toBeFalse();
      setHidden(true);
      (service as unknown as { onVisibilityChange(): void }).onVisibilityChange();
      expect(stored().hidden).toBeTrue();
      expect(stored().connected).toBeTrue();
      setHidden(false);
      (service as unknown as { onVisibilityChange(): void }).onVisibilityChange();
      expect(stored().hidden).toBeFalse();
    });
  });

  describe('always-on resilience', () => {
    beforeEach(() => {
      service.reconnectBaseMs = 0; // no waiting in tests unless a test sets it
    });

    it('reconnects by itself after the display is unplugged and plugged back', async () => {
      await connect();
      serial.unplug(port);
      await flush(20);
      expect(link.status()).toBe('disconnected');

      port.reader.replies.push(new Uint8Array([1, 1, 1, 1, 1, 1]));
      await service.renderFrame(); // next tick notices the link is down and retries
      await flush(400); // init sequence has a 150 ms pause
      expect(link.status()).toBe('connected');
    });

    it('recovers from a write error: drops the port, then reconnects', async () => {
      await connect();
      state.set(snap({ now: new Date(2026, 0, 15, 12, 0, 6), clock: { ...snap().clock, seconds: 6 } }));
      link.writeTimeoutMs = 30;
      port.gate = new Promise<void>(() => { /* port went dead */ });
      await service.renderFrame();
      expect(link.status()).toBe('error');
      expect(link.message().length).toBeGreaterThan(0);

      port.gate = null;
      link.writeTimeoutMs = 8000;
      port.reader.replies.push(new Uint8Array([1, 1, 1, 1, 1, 1]));
      await service.renderFrame();
      await flush(400);
      expect(link.status()).toBe('connected');
      // everything is resent after a reconnection
      const headers = bitmapHeaders();
      expect(headerRect(headers[headers.length - 1])).toEqual({ x0: 0, y0: 0, x1: 479, y1: 319 });
    });

    it('backs off between failed attempts (5 s, 10 s, 20 s, 30 s max)', async () => {
      await connect();
      serial.unplug(port);
      await flush(20);
      serial.ports = []; // the display never comes back

      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(2026, 0, 15, 12, 0, 0));
        service.reconnectBaseMs = 5000;
        const spy = spyOn(link, 'reconnect').and.resolveTo(false);
        const t0 = new Date(2026, 0, 15, 12, 0, 0).getTime();
        const attemptsAt = async (seconds: number) => {
          jasmine.clock().mockDate(new Date(t0 + seconds * 1000));
          await service.renderFrame();
          return spy.calls.count();
        };
        // [seconds since start, expected total attempts]: immediate, then 5 s, 10 s, 20 s, 30 s (cap)
        const expected: [number, number][] = [
          [0, 1], [4, 1], [5, 2], [14, 2], [15, 3], [34, 3], [35, 4], [64, 4], [65, 5], [94, 5], [95, 6]
        ];
        for (const [seconds, attempts] of expected) {
          expect(await attemptsAt(seconds)).withContext('t=' + seconds + 's').toBe(attempts);
        }
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('does not retry unless it was connected before, nor after an explicit disconnect', async () => {
      const spy = spyOn(link, 'reconnect').and.resolveTo(false);
      await service.renderFrame();
      await service.renderFrame();
      expect(spy).not.toHaveBeenCalled(); // never connected in this profile

      await connect();
      await service.disconnect();
      spy.calls.reset();
      await service.renderFrame();
      await service.renderFrame();
      expect(spy).not.toHaveBeenCalled();
    });

    it('resends the whole picture after a long gap between frames (PC woke up)', async () => {
      await connect();
      const before = bitmapHeaders().length;
      await service.renderFrame();
      expect(bitmapHeaders().length).toBe(before); // nothing changed, nothing sent

      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(Date.now() + 60_000)); // a minute passed without ticks
        await service.renderFrame();
      } finally {
        jasmine.clock().uninstall();
      }
      const headers = bitmapHeaders();
      expect(headers.length).toBe(before + 1);
      expect(headerRect(headers[headers.length - 1])).toEqual({ x0: 0, y0: 0, x1: 479, y1: 319 });
    });
  });

  describe('demo mode', () => {
    const rotate = async (slots: number) => {
      const seen: string[] = [];
      for (let slot = 0; slot < slots; slot++) {
        state.set(snap({ now: new Date(2026, 0, 15, 12, 0, slot * 20 + 1) }));
        await service.renderFrame();
        seen.push(service.activeView());
      }
      return seen;
    };

    it('is on by default and rotates through every view with sample data while no display is connected', async () => {
      expect(service.demoActive()).toBeTrue();
      const seen = await rotate(6);
      expect(new Set(seen)).toEqual(new Set(['clock', 'focus', 'week', 'alarm', 'world', 'weather']));
    });

    it('does not send anything to a display (there is none)', async () => {
      await rotate(3);
      expect(port.writes.length).toBe(0);
    });

    it('stops as soon as a display is connected: only real data is shown', async () => {
      await connect();
      expect(service.demoActive()).toBeFalse();
      const seen = await rotate(4);
      expect(new Set(seen)).toEqual(new Set(['clock', 'focus'])); // the snapshot has no week/alarm/world/weather data
    });

    it('can be turned off, and the choice is remembered', async () => {
      service.demoEnabled.set(false);
      expect(service.demoActive()).toBeFalse();
      TestBed.flushEffects();
      expect(JSON.parse(localStorage.getItem('auratime_screen')!).demo).toBeFalse();
      const seen = await rotate(4);
      expect(new Set(seen)).toEqual(new Set(['clock', 'focus']));
    });

    it('keeps real data where it exists and only fills the gaps', async () => {
      state.set(snap({ stats: { todayMin: 40, streak: 9 } }));
      service.viewMode.set('clock');
      await service.renderFrame();
      // the footer of the clock view shows the real numbers: the frame differs from one with other numbers
      const real = service.canvas!.getContext('2d')!.getImageData(0, 0, 480, 320).data.slice();
      state.set(snap({ stats: { todayMin: 41, streak: 9 } }));
      await service.renderFrame();
      const other = service.canvas!.getContext('2d')!.getImageData(0, 0, 480, 320).data;
      expect(real.some((v, i) => v !== other[i])).toBeTrue();
    });
  });

  describe('theme and font', () => {
    const pixels = () => service.canvas!.getContext('2d')!.getImageData(0, 0, 480, 320).data.slice();
    const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.some((v, i) => v !== b[i]);

    beforeEach(() => service.viewMode.set('clock'));

    it('follows the app by default', async () => {
      state.set(snap({ theme: 'emerald-gold' }));
      await service.renderFrame();
      const emerald = pixels();
      state.set(snap({ theme: 'light-glass' }));
      await service.renderFrame();
      expect(differs(emerald, pixels())).toBeTrue();
    });

    it('can pin the theme: the app theme no longer matters', async () => {
      service.themePin.set('obsidian-platinum');
      state.set(snap({ theme: 'emerald-gold' }));
      await service.renderFrame();
      const a = pixels();
      state.set(snap({ theme: 'light-glass' }));
      await service.renderFrame();
      expect(differs(a, pixels())).toBeFalse();
    });

    it('can pin the font', async () => {
      state.set(snap({ fontId: 'outfit' }));
      await service.renderFrame();
      const outfit = pixels();
      service.fontPin.set('orbitron');
      await service.renderFrame();
      const pinned = pixels();
      expect(differs(outfit, pinned)).toBeTrue();
      state.set(snap({ fontId: 'inter' }));
      await service.renderFrame();
      expect(differs(pinned, pixels())).toBeFalse();
    });

    it('remembers the pins and ignores invalid stored values', () => {
      service.themePin.set('dark-glass');
      service.fontPin.set('playfair');
      TestBed.flushEffects();
      const saved = JSON.parse(localStorage.getItem('auratime_screen')!);
      expect(saved.themePin).toBe('dark-glass');
      expect(saved.fontPin).toBe('playfair');

      localStorage.setItem('auratime_screen', JSON.stringify({ themePin: 'neon', fontPin: 'comic' }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: DisplayStateService, useValue: { snapshot: signal(snap()) } },
          { provide: SERIAL_API, useValue: new FakeSerial() },
        { provide: LOCKS_API, useValue: null }
        ]
      });
      const restored = TestBed.inject(ScreenOutputService);
      expect(restored.themePin()).toBeNull();
      expect(restored.fontPin()).toBeNull();
    });
  });

  describe('status for the clock window', () => {
    const stored = () => JSON.parse(localStorage.getItem(DESK_STATUS_KEY)!);

    it('publishes "not connected" at first and "connected" once the display is up', async () => {
      TestBed.flushEffects();
      expect(stored().connected).toBeFalse();
      await connect();
      expect(stored().connected).toBeTrue();
      await service.disconnect();
      TestBed.flushEffects();
      expect(stored().connected).toBeFalse();
    });

    it('repeats it as a heartbeat while the page is open', async () => {
      await connect();
      const first = stored().at;
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(Date.now() + 6000));
        await service.renderFrame();
      } finally {
        jasmine.clock().uninstall();
      }
      expect(stored().at).toBeGreaterThan(first);
    });

    it('says "not connected" when the page is stopped', async () => {
      await connect();
      service.stop();
      expect(stored().connected).toBeFalse();
    });
  });

  describe('rotation choice', () => {
    beforeEach(() => service.demoEnabled.set(false));

    const worldClocks = [{ label: 'Tokyo', hhmm: '09:00', ampm: '', dayOffset: 0, utc: 'UTC+9' }];
    const at = (slot: number) => new Date(2026, 0, 15, 12, 0, slot * 20 + 1);

    it('includes every view by default and keeps the canonical order when toggling', () => {
      expect(service.rotation()).toEqual(['clock', 'focus', 'week', 'alarm', 'world', 'weather']);
      service.setInRotation('week', false);
      service.setInRotation('clock', false);
      expect(service.rotation()).toEqual(['focus', 'alarm', 'world', 'weather']);
      service.setInRotation('week', true);
      service.setInRotation('clock', true);
      expect(service.rotation()).toEqual(['clock', 'focus', 'week', 'alarm', 'world', 'weather']);
    });

    it('rotates only through enabled views that have data', async () => {
      service.rotation.set(['clock', 'world', 'alarm']); // alarm has no data -> skipped
      const seen: string[] = [];
      for (let slot = 0; slot < 4; slot++) {
        state.set(snap({ now: at(slot), worldClocks }));
        await service.renderFrame();
        seen.push(service.activeView());
      }
      expect(seen).toEqual(['clock', 'world', 'clock', 'world']);
    });

    it('falls back to the clock when its only enabled view has no data', async () => {
      service.rotation.set(['world']);
      state.set(snap({ worldClocks: [] }));
      await service.renderFrame();
      expect(service.activeView()).toBe('clock');
    });

    it('remembers the rotation and ignores unknown views from old preferences', () => {
      service.setInRotation('weather', false);
      TestBed.flushEffects();
      expect(JSON.parse(localStorage.getItem('auratime_screen')!).rotation).toEqual(['clock', 'focus', 'week', 'alarm', 'world']);

      localStorage.setItem('auratime_screen', JSON.stringify({ rotation: ['world', 'bogus', 'clock'], viewMode: 'nope' }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: DisplayStateService, useValue: { snapshot: signal(snap()) } },
          { provide: SERIAL_API, useValue: new FakeSerial() },
        { provide: LOCKS_API, useValue: null }
        ]
      });
      const restored = TestBed.inject(ScreenOutputService);
      expect(restored.rotation()).toEqual(['clock', 'world']);
      expect(restored.viewMode()).toBe('auto'); // invalid mode ignored
    });
  });

  it('resends everything on demand', async () => {
    await connect();
    const before = bitmapHeaders().length;
    service.refreshAll();
    await service.renderFrame();
    const headers = bitmapHeaders();
    expect(headers.length).toBe(before + 1);
    expect(headerRect(headers[headers.length - 1])).toEqual({ x0: 0, y0: 0, x1: 479, y1: 319 });
  });

  it('remembers preferences and auto-reconnects on the next start', async () => {
    service.viewMode.set('weather');
    service.setBrightnessBase(80);
    port.reader.replies.push(new Uint8Array([1, 1, 1, 1, 1, 1]));
    await service.connect();
    await flush(300);
    TestBed.flushEffects();

    const saved = JSON.parse(localStorage.getItem('auratime_screen')!);
    expect(saved.viewMode).toBe('weather');
    expect(saved.brightness.base).toBe(80);
    expect(saved.autoConnect).toBeTrue();

    // "Reload": new injector, same localStorage and the same authorised port
    TestBed.resetTestingModule();
    const port2 = new FakePort();
    const serial2 = new FakeSerial();
    serial2.ports = [port2];
    TestBed.configureTestingModule({
      providers: [
        { provide: DisplayStateService, useValue: { snapshot: signal(snap()) } },
        { provide: SERIAL_API, useValue: serial2 },
        { provide: LOCKS_API, useValue: null }
      ]
    });
    const restored = TestBed.inject(ScreenOutputService);
    expect(restored.viewMode()).toBe('weather');
    expect(restored.brightness().base).toBe(80);

    await restored.start();
    await flush(1200); // HELLO gets no reply from this fake port: wait out its 700 ms timeout + init
    expect(TestBed.inject(SerialLinkService).status()).toBe('connected');
    expect(port2.writes.length).toBeGreaterThan(0);
    restored.stop();
  });

  describe('wire integrity', () => {
    /**
     * Walks everything written to the port and checks the framing: each bitmap header (cmd 197) must be
     * followed by exactly width*height*2 pixel bytes, with nothing (brightness, another header...) in between.
     */
    function assertWellFramed(writes: Uint8Array[]): number {
      let bitmaps = 0;
      let remaining = 0;
      for (const w of writes) {
        if (remaining > 0) {
          remaining -= w.length;
          expect(remaining).withContext('pixel payload overran its rectangle').toBeGreaterThanOrEqual(0);
        } else if (w.length === 6 && w[5] === 197) {
          const r = headerRect(w);
          remaining = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) * 2;
          bitmaps++;
        } else {
          expect(w.length).withContext('stray write between bitmaps').toBe(6);
          expect([109, 110, 69]).toContain(w[5]);
        }
      }
      expect(remaining).withContext('last bitmap is incomplete').toBe(0);
      return bitmaps;
    }

    it('never interleaves anything inside a bitmap, even with concurrent renders, brightness and refreshes', async () => {
      await connect();
      port.writes.length = 0;

      const at = (h: number, s: number) => snap({
        now: new Date(2026, 0, 16, h, 0, s),
        clock: { ...snap().clock, seconds: s },
        focus: { phase: 'idle', remainingSec: 1500, totalSec: 1500, tasks: [{ text: 'a', done: false, active: true }] }
      });
      const jobs: Promise<void>[] = [];
      for (let i = 0; i < 6; i++) {
        state.set(at(i % 2 ? 2 : 12, i)); // alternates night/day => brightness commands in the mix
        jobs.push(service.renderFrame(), service.renderFrame());
        if (i === 2) service.refreshAll();
        service.viewMode.set(i % 2 ? 'focus' : 'clock');
        await flush(0);
      }
      await Promise.all(jobs);
      await flush(100);

      expect(assertWellFramed(port.writes)).toBeGreaterThan(1);
    });

    it('writes full 2560-byte chunks (320 x 8) for large bitmaps', async () => {
      await connect();
      const sizes = port.writes.filter(w => w.length > 6).map(w => w.length);
      expect(Math.max(...sizes)).toBe(2560);
      expect(sizes.slice(0, -1).every(n => n === 2560 || n < 2560)).toBeTrue();
    });

    it('does not reinstall a stale reference frame when a refresh happens during a send', async () => {
      await connect();

      let release!: () => void;
      port.gate = new Promise<void>(res => (release = res));
      state.set(snap({ now: new Date(2026, 0, 15, 12, 0, 7), clock: { ...snap().clock, seconds: 7 } }));
      const inFlight = service.renderFrame(); // blocked on the gate, mid-send
      await flush(10);
      service.refreshAll(); // invalidates the reference while the send is pending
      port.gate = null;
      release();
      await inFlight;

      const before = bitmapHeaders().length;
      await service.renderFrame(); // nothing changed on canvas, but the display must get a full frame
      const headers = bitmapHeaders();
      expect(headers.length).toBe(before + 1);
      expect(headerRect(headers[headers.length - 1])).toEqual({ x0: 0, y0: 0, x1: 479, y1: 319 });
    });

    it('"always send the full screen" sends 480x320 every time, even if nothing changed', async () => {
      await connect();
      service.alwaysFullFrame.set(true);
      const before = bitmapHeaders().length;
      await service.renderFrame();
      await service.renderFrame();
      const headers = bitmapHeaders().slice(before);
      expect(headers.length).toBe(2);
      for (const h of headers) expect(headerRect(h)).toEqual({ x0: 0, y0: 0, x1: 479, y1: 319 });
    });

    it('"slow send" sets a per-chunk pause on the link and is remembered', async () => {
      service.slowSend.set(true);
      TestBed.flushEffects();
      expect(link.chunkDelayMs()).toBe(3);
      expect(JSON.parse(localStorage.getItem('auratime_screen')!).slowSend).toBeTrue();
      service.slowSend.set(false);
      TestBed.flushEffects();
      expect(link.chunkDelayMs()).toBe(0);
    });

    it('reports the size and timing of the last send', async () => {
      await connect();
      const m = link.lastSend()!;
      expect(m.width).toBe(480);
      expect(m.height).toBe(320);
      expect(m.bytes).toBe(8 * 6 + 480 * 320 * 2); // eight 40-row bands, each with its own header
      expect(m.ms).toBeGreaterThanOrEqual(0);
      expect(m.maxGapMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('does not auto-reconnect after an explicit disconnect', async () => {
    await connect();
    await service.disconnect();
    expect(JSON.parse(localStorage.getItem('auratime_screen')!).autoConnect).toBeFalse();
    expect(link.status()).toBe('disconnected');
  });

  it('start() renders on every shared tick and stop() unsubscribes', async () => {
    const tick = TestBed.inject(TickService);
    await service.start();
    const spy = spyOn(service, 'renderFrame').and.callThrough();
    (tick as unknown as { emit(): void }).emit();
    expect(spy).toHaveBeenCalledTimes(1);
    service.stop();
    (tick as unknown as { emit(): void }).emit();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('ScreenOutputService: only one window drives the display', () => {
  let locks: FakeLockManager;
  let serialA: FakeSerial;
  let serialB: FakeSerial;
  let a: ScreenOutputService;
  let b: ScreenOutputService;
  let injectorB: EnvironmentInjector;

  beforeEach(async () => {
    await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
    localStorage.clear();
    locks = new FakeLockManager();
    serialA = new FakeSerial();
    serialA.picked = new FakePort();
    serialB = new FakeSerial();
    serialB.picked = new FakePort();
    TestBed.configureTestingModule({
      providers: [
        { provide: DisplayStateService, useValue: { snapshot: signal(snap()) } },
        { provide: SERIAL_API, useValue: serialA },
        { provide: LOCKS_API, useValue: locks }
      ]
    });
    a = TestBed.inject(ScreenOutputService);
    // "The second /screen window": its own display service and serial link, the same lock manager.
    injectorB = createEnvironmentInjector(
      [
        ScreenOutputService,
        SerialLinkService,
        DeskDisplayStatusService,
        { provide: SERIAL_API, useValue: serialB }
      ],
      TestBed.inject(EnvironmentInjector)
    );
    b = injectorB.get(ScreenOutputService);
  });

  afterEach(() => {
    a.stop();
    b.stop();
    injectorB.destroy();
  });

  it('the first window owns the display, the second finds it taken', async () => {
    await a.start();
    await flushLocks();
    await b.start();
    await flushLocks();
    expect(locks.requests.filter(n => n === LOCK_DESK_DISPLAY).length).toBeGreaterThanOrEqual(2);
    expect(a.ownership()).toBe('owner');
    expect(b.ownership()).toBe('other');
  });

  it('the other window never opens the port, never connects and never touches the shared status', async () => {
    await a.start();
    await flushLocks();
    const status = injectorB.get(DeskDisplayStatusService);
    const publish = spyOn(status, 'publish').and.callThrough();
    const getPorts = spyOn(serialB, 'getPorts').and.callThrough();
    const requestPort = spyOn(serialB, 'requestPort').and.callThrough();
    (b as unknown as { autoConnect: boolean }).autoConnect = true; // it would reconnect on its own if it could

    await b.start();
    await flushLocks();
    expect(await b.connect()).toBeFalse();
    await b.renderFrame();
    await b.renderFrame();
    b.stop();

    expect(requestPort).not.toHaveBeenCalled();
    expect(getPorts).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled(); // not even the "false" a closing window usually leaves behind
  });

  it('closing the second window leaves the status of the first one alone', async () => {
    await a.start();
    await flushLocks();
    TestBed.flushEffects();
    await b.start();
    await flushLocks();
    const before = localStorage.getItem(DESK_STATUS_KEY);
    expect(before).toBeTruthy();
    b.stop();
    expect(localStorage.getItem(DESK_STATUS_KEY)).toBe(before);
  });

  it('the other window takes over when the owner goes away', async () => {
    await a.start();
    await flushLocks();
    await b.start();
    await flushLocks();
    expect(b.ownership()).toBe('other');

    a.stop();
    await flushLocks();
    expect(b.ownership()).toBe('owner');
    expect(await b.connect()).toBeTrue(); // and it can use the display now
  });

  it('a window that gave up waiting does not become the owner later', async () => {
    await a.start();
    await flushLocks();
    await b.start();
    await flushLocks();
    b.stop();
    a.stop();
    await flushLocks();
    expect(b.ownership()).toBe('unknown');
  });

  it('a browser without Web Locks: the window simply owns the display', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DisplayStateService, useValue: { snapshot: signal(snap()) } },
        { provide: SERIAL_API, useValue: serialA },
        { provide: LOCKS_API, useValue: null }
      ]
    });
    const solo = TestBed.inject(ScreenOutputService);
    await solo.start();
    expect(solo.ownership()).toBe('owner');
    solo.stop();
  });

  it('if the lock itself fails, the display is still usable (it falls back to owning it)', async () => {
    TestBed.resetTestingModule();
    const warn = spyOn(console, 'warn');
    const broken = { request: () => Promise.reject(new Error('locks are broken')) } as unknown as LockManager;
    TestBed.configureTestingModule({
      providers: [
        { provide: DisplayStateService, useValue: { snapshot: signal(snap()) } },
        { provide: SERIAL_API, useValue: serialA },
        { provide: LOCKS_API, useValue: broken }
      ]
    });
    const solo = TestBed.inject(ScreenOutputService);
    await solo.start();
    await flushLocks();
    expect(solo.ownership()).toBe('owner');
    expect(warn).toHaveBeenCalled();
    solo.stop();
  });
});
