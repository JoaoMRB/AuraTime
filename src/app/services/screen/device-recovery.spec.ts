import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DEVICE_RESET_WAIT_MS, SERIAL_API, SerialLinkService } from './serial-link.service';
import { ScreenOutputService } from './screen-output.service';
import { DisplayStateService } from './display-state.service';
import { DisplaySnapshot } from './display-snapshot';
import { LOCKS_API } from '../web-locks';
import { REQUIRED_FONT_SHORTHANDS } from './screen-renderer';
import { englishLabels } from './testing/english-labels';
import { FakePort, FakeSerial } from './testing/fake-serial';

const HELLO_OK = new Uint8Array([1, 1, 1, 1, 1, 1]);
const OPTIONS = { flowControl: true, brightness: 60, helloTimeoutMs: 20 };
const flush = (ms = 0) => new Promise(r => setTimeout(r, ms));
const CMD = { HELLO: 69, SCREEN_ON: 109, BRIGHTNESS: 110, ORIENTATION: 121, RESET: 101, BITMAP: 197 };

/** The command byte of every command-sized write (6 or 16 bytes), in order; pixel chunks are left out. */
const commands = (port: FakePort) =>
  port.writes.filter(w => w.length === 6 || w.length === 16).map(w => w[5]);

/** Reads the (y0, y1) rows of a 6-byte DISPLAY_BITMAP header. */
const rows = (h: Uint8Array) => ({ y0: ((h[1] & 63) << 4) | (h[2] >> 4), y1: ((h[3] & 3) << 8) | h[4] });

/** Reads a byte stream like the display: header, exactly w*h*2 pixel bytes, next header. */
function parseBitmaps(bytes: ArrayLike<number>): { bands: number; incomplete: boolean } {
  let i = 0;
  let bands = 0;
  const b = (k: number) => bytes[i + k];
  while (i < bytes.length) {
    if (bytes.length - i < 6 || b(5) !== CMD.BITMAP) return { bands, incomplete: true };
    const x0 = (b(0) << 2) | (b(1) >> 6);
    const y0 = ((b(1) & 63) << 4) | (b(2) >> 4);
    const x1 = ((b(2) & 15) << 6) | (b(3) >> 2);
    const y1 = ((b(3) & 3) << 8) | b(4);
    const size = (x1 - x0 + 1) * (y1 - y0 + 1) * 2;
    i += 6;
    if (bytes.length - i < size) return { bands, incomplete: true };
    i += size;
    bands++;
  }
  return { bands, incomplete: false };
}

describe('Hard resync of the display', () => {
  describe('the RESET at the start of every connection', () => {
    let serial: FakeSerial;
    let port: FakePort;
    let link: SerialLinkService;

    beforeEach(() => {
      serial = new FakeSerial();
      port = new FakePort();
      serial.picked = port;
      serial.ports = [port];
      TestBed.configureTestingModule({ providers: [{ provide: SERIAL_API, useValue: serial }] });
      link = TestBed.inject(SerialLinkService);
    });

    it('sends RESET first, closes the port, waits for the display, reopens it and only then initialises it', async () => {
      link.resetWaitMs = 60;
      port.vanishAfterResetMs = 150; // it drops off the bus for longer than the wait: the link has to keep looking
      const getPorts = spyOn(serial, 'getPorts').and.callThrough();
      port.reader.replies.push(HELLO_OK);

      const started = performance.now();
      expect(await link.connect(OPTIONS)).toBeTrue();
      const took = performance.now() - started;

      expect(commands(port)).toEqual([CMD.RESET, CMD.HELLO, CMD.SCREEN_ON, CMD.ORIENTATION, CMD.BRIGHTNESS]);
      expect(port.openCount).toBe(2); // once for the RESET, once for the real session
      expect(port.closeCount).toBe(1); // closed after the RESET, before the wait
      expect(took).toBeGreaterThanOrEqual(150); // it really waited until the display was back
      expect(getPorts.calls.count()).toBeGreaterThan(1); // ...by asking again, not by guessing
      expect(link.resets()).toBe(1);
      expect(link.status()).toBe('connected');
    });

    it('also resets on a silent reconnection (page load, unplug/replug)', async () => {
      port.reader.replies.push(HELLO_OK);
      expect(await link.connect(OPTIONS)).toBeTrue();
      await link.disconnect();
      port.writes.length = 0;
      port.reader.replies.push(HELLO_OK);

      expect(await link.reconnect(OPTIONS, { silent: true })).toBeTrue();
      expect(commands(port)[0]).toBe(CMD.RESET);
      expect(link.resets()).toBe(2);
    });

    it('says so, and stays closed, when the display does not come back', async () => {
      link.resetWaitMs = 10;
      link.resetGiveUpMs = 120;
      port.vanishAfterResetMs = 5000;

      expect(await link.connect(OPTIONS)).toBeFalse();
      expect(link.status()).toBe('error');
      expect(link.message()).toBe('SCREEN.MSG.NOT_RESPONDING');
      expect(port.isOpen).toBeFalse();
    });

    it('a RESET that cannot be written is a failure, not a hang', async () => {
      link.writeTimeoutMs = 30;
      port.gate = new Promise<void>(() => { /* a dead port */ });
      expect(await link.connect(OPTIONS)).toBeFalse();
      expect(link.status()).toBe('error');
      expect(port.isOpen).toBeFalse();
    });

    it('skipReset connects without one (for a display known to be clean)', async () => {
      port.reader.replies.push(HELLO_OK);
      expect(await link.connect({ ...OPTIONS, skipReset: true })).toBeTrue();
      expect(commands(port)).toEqual([CMD.HELLO, CMD.SCREEN_ON, CMD.ORIENTATION, CMD.BRIGHTNESS]);
    });

    it('hardResync drops the link and brings it back through a RESET, and counts it', async () => {
      port.reader.replies.push(HELLO_OK);
      await link.connect(OPTIONS);
      port.writes.length = 0;
      port.reader.replies.push(HELLO_OK);

      expect(await link.hardResync()).toBeTrue();
      expect(link.resyncs()).toBe(1);
      expect(commands(port)).toEqual([CMD.RESET, CMD.HELLO, CMD.SCREEN_ON, CMD.ORIENTATION, CMD.BRIGHTNESS]);
      expect(link.status()).toBe('connected');
    });
  });

  describe('when the page unloads', () => {
    let port: FakePort;
    let link: SerialLinkService;

    beforeEach(async () => {
      const serial = new FakeSerial();
      port = new FakePort();
      serial.picked = port;
      serial.ports = [port];
      TestBed.configureTestingModule({ providers: [{ provide: SERIAL_API, useValue: serial }] });
      link = TestBed.inject(SerialLinkService);
      port.reader.replies.push(HELLO_OK);
      await link.connect({ ...OPTIONS, skipReset: true });
    });

    const ramp = (n: number) => Uint16Array.from({ length: n }, (_, i) => i & 0xffff);

    it('a frame in progress stops between two bands, never inside one', async () => {
      const mark = port.delivered.length;
      port.writeDelayMs = 2;
      const frame = link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));
      await flush(40); // somewhere in the first bands
      link.suspend();
      await frame;

      const { bands, incomplete } = parseBitmaps(port.delivered.slice(mark));
      expect(incomplete).withContext('the display must not be left in the middle of a bitmap').toBeFalse();
      expect(bands).toBeGreaterThan(0);
      expect(bands).toBeLessThan(8);
    });

    it('nothing new is queued once suspended, and writing starts again after resume', async () => {
      link.suspend();
      const mark = port.writes.length;
      await link.sendBitmap({ x0: 0, y0: 0, x1: 9, y1: 9 }, ramp(100));
      await link.setBrightness(30);
      await link.setOrientation();
      expect(port.writes.length).toBe(mark);

      link.resume();
      await link.setBrightness(30);
      expect(port.writes.length).toBe(mark + 1);
    });
  });

  describe('with the output service', () => {
    let serial: FakeSerial;
    let port: FakePort;
    let service: ScreenOutputService;
    let link: SerialLinkService;
    let state: ReturnType<typeof signal<DisplaySnapshot>>;

    const snap = (overrides: Partial<DisplaySnapshot> = {}): DisplaySnapshot => ({
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
    });
    const tick = (seconds: number) =>
      state.set(snap({ now: new Date(2026, 0, 15, 12, 0, seconds), clock: { ...snap().clock, seconds } }));
    const headerWrites = () => port.writes.filter(w => w.length === 6 && w[5] === CMD.BITMAP);

    beforeEach(async () => {
      await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
      localStorage.clear();
      state = signal(snap());
      serial = new FakeSerial();
      port = new FakePort();
      serial.picked = port;
      serial.ports = [port];
      TestBed.configureTestingModule({
        providers: [
          { provide: DEVICE_RESET_WAIT_MS, useValue: 20 },
          { provide: DisplayStateService, useValue: { snapshot: state } },
          { provide: SERIAL_API, useValue: serial },
          { provide: LOCKS_API, useValue: null }
        ]
      });
      service = TestBed.inject(ScreenOutputService);
      service.ownership.set('owner');
      service.bandPauseMs.set(0);
      service.reconnectBaseMs = 0;
      link = TestBed.inject(SerialLinkService);
      port.reader.replies.push(HELLO_OK);
      await service.connect();
      await flush(300);
      TestBed.flushEffects();
      await flush(50);
    });

    afterEach(() => localStorage.clear());

    it('a connection is reset, initialised, and followed by a full banded redraw', () => {
      expect(port.resetCount).toBe(1);
      const cmds = commands(port);
      expect(cmds.slice(0, 5)).toEqual([CMD.RESET, CMD.HELLO, CMD.SCREEN_ON, CMD.ORIENTATION, CMD.BRIGHTNESS]);
      const bands = headerWrites().map(rows);
      expect(bands.length).toBe(8);
      expect(bands.map(b => b.y0)).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
    });

    it('re-asserts the orientation before every full redraw, including the one every 5 minutes', async () => {
      port.writes.length = 0;
      tick(6);
      await service.renderFrame();
      expect(commands(port)).not.toContain(CMD.ORIENTATION); // a small update: nothing to re-assert

      // five minutes later the whole picture is sent again
      port.writes.length = 0;
      state.set(snap({ now: new Date(2026, 0, 15, 12, 6, 10), clock: { ...snap().clock, seconds: 10 } }));
      await service.renderFrame();
      const order = port.writes.filter(w => w.length === 16 || (w.length === 6 && w[5] === CMD.BITMAP)).map(w => (w.length === 16 ? 'orientation' : 'header'));
      expect(order[0]).toBe('orientation');
      expect(order.filter(x => x === 'header').length).toBe(8);

      // and a manual redraw does the same
      port.writes.length = 0;
      service.refreshAll();
      tick(11);
      await service.renderFrame();
      expect(commands(port)).toContain(CMD.ORIENTATION);
    });

    it('the watchdog: a send stuck for too long triggers a hard resync and a full banded redraw', async () => {
      expect(link.resyncs()).toBe(0);
      service.watchdogMs = 80;
      link.writeTimeoutMs = 60000; // so the per-chunk timeout cannot get there first
      port.gate = new Promise<void>(() => { /* the display stopped taking data */ });
      tick(7);
      void service.renderFrame(); // stuck inside its first write
      await flush(120);

      port.gate = null; // the new session is healthy
      port.writes.length = 0;
      port.reader.replies.push(HELLO_OK);
      tick(8);
      await service.renderFrame(); // a tick finds the send older than the watchdog
      await flush(300);
      TestBed.flushEffects();
      await flush(100);

      expect(link.resyncs()).toBe(1);
      expect(service.forcedFullRedraws()).toBeGreaterThanOrEqual(1);
      expect(link.status()).toBe('connected');
      expect(port.resetCount).toBe(2); // the one at connection and the resync's
      expect(commands(port)[0]).toBe(CMD.RESET);
      const bands = headerWrites().map(rows);
      expect(bands.slice(0, 8).map(b => b.y0)).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
    });

    it('the watchdog leaves a healthy, merely slow send alone', async () => {
      service.watchdogMs = 5000;
      port.writeDelayMs = 3;
      service.refreshAll();
      tick(9);
      const frame = service.renderFrame();
      await flush(30);
      await service.renderFrame(); // busy, but far younger than the watchdog
      await frame;
      expect(link.resyncs()).toBe(0);
      expect(port.resetCount).toBe(1);
    });

    it('beforeunload stops new frames, and a frame in progress ends cleanly after its current band', async () => {
      const unload = (service as unknown as { onBeforeUnload: () => void }).onBeforeUnload;
      port.writeDelayMs = 2;
      const mark = port.delivered.length;
      service.refreshAll();
      tick(12);
      const inFlight = service.renderFrame();
      await flush(40);
      unload();
      await inFlight;

      const stream = port.delivered.slice(mark);
      // everything after the orientation command is a whole number of whole bitmaps
      const afterOrientation = stream.slice(16);
      expect(parseBitmaps(afterOrientation).incomplete).toBeFalse();
      expect(parseBitmaps(afterOrientation).bands).toBeLessThan(8);

      // no new frame is queued while the page is going away
      const written = port.writes.length;
      tick(13);
      await service.renderFrame();
      expect(port.writes.length).toBe(written);
      expect(link.isSuspended()).toBeTrue();
    });

    it('if the page stays after a beforeunload, writing resumes and the picture is redrawn in full', async () => {
      const internals = service as unknown as { onBeforeUnload: () => void; resumeAfterUnload: () => void };
      internals.onBeforeUnload();
      expect(link.isSuspended()).toBeTrue();
      internals.resumeAfterUnload();
      expect(link.isSuspended()).toBeFalse();

      port.writes.length = 0;
      tick(14);
      await service.renderFrame();
      expect(headerWrites().length).toBe(8); // a full redraw, not a partial update on top of a stopped frame
    });
  });
});
