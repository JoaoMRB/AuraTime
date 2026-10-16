import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SERIAL_API, SerialLinkService } from './serial-link.service';
import { ScreenOutputService } from './screen-output.service';
import { DisplayStateService } from './display-state.service';
import { DisplaySnapshot } from './display-snapshot';
import { LOCKS_API } from '../web-locks';
import { REQUIRED_FONT_SHORTHANDS } from './screen-renderer';
import { englishLabels } from './testing/english-labels';
import { FakePort, FakeSerial } from './testing/fake-serial';
import { MAX_BAND_ROWS, Rect, splitBands } from './turing-protocol';

const flush = (ms = 0) => new Promise(r => setTimeout(r, ms));
const HELLO_OK = new Uint8Array([1, 1, 1, 1, 1, 1]);

/** Reads the (x0,y0,x1,y1) rectangle out of a 6-byte DISPLAY_BITMAP header. */
function headerRect(h: ArrayLike<number>): Rect {
  return {
    x0: (h[0] << 2) | (h[1] >> 6),
    y0: ((h[1] & 63) << 4) | (h[2] >> 4),
    x1: ((h[2] & 15) << 6) | (h[3] >> 2),
    y1: ((h[3] & 3) << 8) | h[4]
  };
}

interface ParsedBand { rect: Rect; pixelBytes: number; }

/**
 * Reads a byte stream the way the display does: a 6-byte header, then exactly w*h*2 bytes of pixels, then the
 * next header. Returns the bands it found and how many bytes were left over / missing at the end.
 */
function parseBitmaps(bytes: ArrayLike<number>): { bands: ParsedBand[]; incomplete: boolean } {
  const bands: ParsedBand[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes.length - i < 6 || bytes[i + 5] !== 197) return { bands, incomplete: true };
    const rect = headerRect(Array.prototype.slice.call(bytes, i, i + 6));
    const pixelBytes = (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1) * 2;
    i += 6;
    if (bytes.length - i < pixelBytes) return { bands, incomplete: true };
    bands.push({ rect, pixelBytes });
    i += pixelBytes;
  }
  return { bands, incomplete: false };
}

describe('splitBands', () => {
  it('leaves a rectangle of 40 rows or fewer alone', () => {
    const rect = { x0: 10, y0: 5, x1: 20, y1: 44 }; // exactly 40 rows
    expect(splitBands(rect)).toEqual([{ rect, offset: 0 }]);
    const one = { x0: 0, y0: 7, x1: 3, y1: 7 };
    expect(splitBands(one)).toEqual([{ rect: one, offset: 0 }]);
  });

  it('splits the full screen into eight bands of 40 rows that tile it exactly', () => {
    const bands = splitBands({ x0: 0, y0: 0, x1: 479, y1: 319 });
    expect(bands.length).toBe(8);
    bands.forEach((b, k) => {
      expect(b.rect).toEqual({ x0: 0, y0: k * 40, x1: 479, y1: k * 40 + 39 });
      expect(b.offset).toBe(k * 40 * 480);
    });
  });

  it('puts the remainder in a last, shorter band and keeps the columns', () => {
    const bands = splitBands({ x0: 100, y0: 10, x1: 149, y1: 100 }); // 91 rows, 50 wide
    expect(bands.map(b => [b.rect.y0, b.rect.y1])).toEqual([[10, 49], [50, 89], [90, 100]]);
    expect(bands.every(b => b.rect.x0 === 100 && b.rect.x1 === 149)).toBeTrue();
    expect(bands.map(b => b.offset)).toEqual([0, 40 * 50, 80 * 50]);
    expect(bands.every(b => b.rect.y1 - b.rect.y0 + 1 <= MAX_BAND_ROWS)).toBeTrue();
  });

  it('splits a 41-row rectangle into 40 + 1', () => {
    const bands = splitBands({ x0: 0, y0: 0, x1: 9, y1: 40 });
    expect(bands.map(b => b.rect.y1 - b.rect.y0 + 1)).toEqual([40, 1]);
  });
});

describe('SerialLinkService: tall bitmaps go out as bands', () => {
  const OPTIONS = { flowControl: true, brightness: 60, helloTimeoutMs: 20 };
  let port: FakePort;
  let link: SerialLinkService;
  let initBytes: number;

  beforeEach(async () => {
    const serial = new FakeSerial();
    port = new FakePort();
    serial.picked = port;
    serial.ports = [port];
    TestBed.configureTestingModule({ providers: [{ provide: SERIAL_API, useValue: serial }] });
    link = TestBed.inject(SerialLinkService);
    port.reader.replies.push(HELLO_OK);
    expect(await link.connect(OPTIONS)).toBeTrue();
    initBytes = port.delivered.length; // HELLO, screen on, orientation, brightness
  });

  /** A frame whose pixel at index i holds i & 0xffff, so a band can be checked against its source rows. */
  const ramp = (n: number) => Uint16Array.from({ length: n }, (_, i) => i & 0xffff);

  it('sends the full screen as eight headers, each followed by exactly its own 480x40x2 bytes', async () => {
    await link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));

    const { bands, incomplete } = parseBitmaps(port.delivered.slice(initBytes));
    expect(incomplete).toBeFalse();
    expect(bands.length).toBe(8);
    bands.forEach((b, k) => {
      expect(b.rect).toEqual({ x0: 0, y0: k * 40, x1: 479, y1: k * 40 + 39 });
      expect(b.pixelBytes).toBe(480 * 40 * 2);
    });
    expect(port.delivered.length - initBytes).toBe(8 * (6 + 38400));
    expect(link.framesSent()).toBe(1);
    expect(link.bandsSent()).toBe(8);
    expect(link.lastSend()!.bytes).toBe(8 * (6 + 38400));
  });

  it('puts each band\'s own pixels after its header (no shifted or repeated rows)', async () => {
    const rect = { x0: 3, y0: 12, x1: 12, y1: 111 }; // 10 wide, 100 tall: 40 + 40 + 20 rows
    const pixels = ramp(10 * 100);
    await link.sendBitmap(rect, pixels);

    const stream = port.delivered.slice(initBytes);
    let at = 0;
    let row = 0;
    for (const height of [40, 40, 20]) {
      expect(headerRect(stream.slice(at, at + 6))).toEqual({ x0: 3, y0: 12 + row, x1: 12, y1: 12 + row + height - 1 });
      at += 6;
      for (let p = 0; p < 10 * height; p++, at += 2) {
        const expected = pixels[row * 10 + p];
        expect(stream[at] | (stream[at + 1] << 8)).withContext(`band at row ${row}, pixel ${p}`).toBe(expected);
      }
      row += height;
    }
    expect(at).toBe(stream.length);
  });

  it('still sends a small rectangle (the seconds digits) as a single bitmap', async () => {
    await link.sendBitmap({ x0: 200, y0: 100, x1: 279, y1: 139 }, ramp(80 * 40));
    const { bands } = parseBitmaps(port.delivered.slice(initBytes));
    expect(bands.length).toBe(1);
    expect(link.bandsSent()).toBe(1);
  });

  it('never writes anything between a header and its pixels, even if another command is queued meanwhile', async () => {
    port.writeDelayMs = 1;
    const frame = link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));
    const brightness = link.setBrightness(30); // queued while the frame is in flight
    await Promise.all([frame, brightness]);

    const stream = port.delivered.slice(initBytes);
    const { bands, incomplete } = parseBitmaps(stream.slice(0, 8 * (6 + 38400)));
    expect(incomplete).toBeFalse();
    expect(bands.length).toBe(8);
    expect(stream.length).toBe(8 * (6 + 38400) + 6); // the brightness command comes after the last band
    expect(stream[8 * (6 + 38400) + 5]).toBe(110);
  });

  describe('pause between bands', () => {
    const PAUSE = 17; // a value nothing else in the link waits for, so the spy below sees only band pauses

    function recordPauses(): void {
      const real = window.setTimeout.bind(window);
      spyOn(window, 'setTimeout').and.callFake(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms === PAUSE) port.log.push('pause');
        return real(fn, ms, ...args);
      }) as typeof window.setTimeout);
    }

    it('is 3 ms by default', () => {
      expect(link.bandPauseMs()).toBe(3);
    });

    it('happens after each band, never between a header and its pixels', async () => {
      link.bandPauseMs.set(PAUSE);
      recordPauses();
      port.log.length = 0;
      await link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));

      const text = port.log.join(' ');
      const oneBand = 'header (data )+pause';
      expect(text).toMatch(new RegExp('^(' + oneBand + '(?: |$)){8}$'));
      expect(text).not.toContain('header pause'); // nothing between a header and its pixels
      expect(text).not.toMatch(/pause data/); // nothing but a header follows a pause
      expect(port.log.filter(e => e === 'pause').length).toBe(8);
    });

    it('is skipped entirely at 0 ms, and a short frame still gets one pause after its only band', async () => {
      link.bandPauseMs.set(0);
      recordPauses();
      port.log.length = 0;
      await link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));
      expect(port.log).not.toContain('pause');

      link.bandPauseMs.set(PAUSE);
      port.log.length = 0;
      await link.sendBitmap({ x0: 0, y0: 0, x1: 9, y1: 9 }, ramp(100));
      expect(port.log).toEqual(['header', 'data', 'pause']);
    });
  });

  describe('a port that is slow or loses bytes', () => {
    it('a slow display is not a timeout: a frame far longer than the write timeout succeeds while chunks keep being accepted', async () => {
      link.writeTimeoutMs = 60;
      port.writeDelayMs = 8; // 8 ms per 2560-byte chunk: the whole frame needs about 1 s, 15x the timeout
      await link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));

      expect(link.writeTimeouts()).toBe(0);
      expect(link.bandsSent()).toBe(8);
      expect(parseBitmaps(port.delivered.slice(initBytes)).incomplete).toBeFalse();
    }, 20000);

    it('a chunk that never completes is a timeout, counted once, and the frame is abandoned', async () => {
      link.writeTimeoutMs = 30;
      port.gate = new Promise<void>(() => { /* the display stopped accepting data */ });
      await expectAsync(link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320)))
        .toBeRejectedWithError(/stopped responding/);
      expect(link.writeTimeouts()).toBe(1);
      expect(link.framesSent()).toBe(0);
    });

    it('bytes lost in the middle of a band leave that band short and the earlier bands intact', async () => {
      // lose 7 bytes inside the pixels of band 3 (index 2)
      const bandBytes = 6 + 38400;
      port.loss = { from: initBytes + 2 * bandBytes + 1000, count: 7 };
      await link.sendBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }, ramp(480 * 320));

      const stream = port.delivered.slice(initBytes);
      expect(stream.length).toBe(8 * bandBytes - 7);
      // the first two bands parse cleanly, exactly as sent
      const { bands } = parseBitmaps(stream.slice(0, 2 * bandBytes));
      expect(bands.map(b => b.rect.y0)).toEqual([0, 40]);
      // the third band's header is intact, its pixel area is 7 bytes short
      expect(headerRect(stream.slice(2 * bandBytes, 2 * bandBytes + 6))).toEqual({ x0: 0, y0: 80, x1: 479, y1: 119 });
    });
  });
});

describe('ScreenOutputService: a failure during a large frame', () => {
  let serial: FakeSerial;
  let port: FakePort;
  let service: ScreenOutputService;
  let link: SerialLinkService;
  let state: ReturnType<typeof signal<DisplaySnapshot>>;

  const snap = (): DisplaySnapshot => ({
    now: new Date(2026, 0, 15, 12, 0, 5),
    theme: 'emerald-gold',
    fontId: 'outfit',
    clock: { hhmm: '12:00', seconds: 5, ampm: '', dateLabel: 'Thursday, January 15', use24h: true },
    focus: { phase: 'idle', remainingSec: 1500, totalSec: 1500, tasks: [] },
    stats: { todayMin: 0, streak: 0 },
    week: { days: [], totalMin: 0, streak: 0 },
    worldClocks: [],
    labels: englishLabels()
  });

  const bitmapRects = () => port.writes.filter(w => w.length === 6 && w[5] === 197).map(headerRect);
  const isBand = (r: Rect) => r.x0 === 0 && r.x1 === 479 && r.y1 - r.y0 + 1 <= MAX_BAND_ROWS;

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
        { provide: DisplayStateService, useValue: { snapshot: state } },
        { provide: SERIAL_API, useValue: serial },
        { provide: LOCKS_API, useValue: null }
      ]
    });
    service = TestBed.inject(ScreenOutputService);
    service.ownership.set('owner');
    service.reconnectBaseMs = 0;
    link = TestBed.inject(SerialLinkService);
    port.reader.replies.push(HELLO_OK);
    await service.connect();
    await flush(300);
    TestBed.flushEffects();
    await flush(50);
  });

  afterEach(() => localStorage.clear());

  it('the first frame after connecting is eight bands', () => {
    const rects = bitmapRects();
    expect(rects.length).toBe(8);
    expect(rects.every(isBand)).toBeTrue();
    expect(rects.map(r => r.y0)).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
  });

  it('a write timeout in the middle of a large frame is followed by a full, banded redraw before any partial update', async () => {
    expect(service.forcedFullRedraws()).toBe(0);
    const sentBefore = port.writes.length;
    const deliveredBefore = port.delivered.length;

    // A full frame that gets stuck during its second band: header + 15 chunks of band 0, then header + 3 chunks.
    service.alwaysFullFrame.set(true);
    link.writeTimeoutMs = 30;
    port.stallAfterWrites = port.writeCount + 1 + 15 + 1 + 3;
    await service.renderFrame();

    expect(link.status()).toBe('error');
    expect(link.writeTimeouts()).toBe(1);
    expect(service.forcedFullRedraws()).toBe(1);
    const cutOff = parseBitmaps(port.delivered.slice(deliveredBefore));
    expect(cutOff.incomplete).withContext('the display was left in the middle of a bitmap').toBeTrue();
    expect(cutOff.bands.length).toBe(1);

    // The display comes back: everything is redrawn, band by band from the top, before any partial update.
    port.stallAfterWrites = null;
    service.alwaysFullFrame.set(false);
    link.writeTimeoutMs = 8000;
    port.reader.replies.push(HELLO_OK);
    await service.renderFrame(); // notices the link is down and reconnects
    await flush(400);
    TestBed.flushEffects();
    await flush(100);
    expect(link.status()).toBe('connected');

    const afterRecovery = port.writes.slice(sentBefore);
    // skip the bytes of the interrupted frame; the redraw starts with the first header written after the HELLO
    const hello = afterRecovery.findIndex(w => w.length === 6 && w[5] === 69);
    expect(hello).toBeGreaterThanOrEqual(0);
    const rects = afterRecovery.slice(hello).filter(w => w.length === 6 && w[5] === 197).map(headerRect);
    expect(rects.length).toBeGreaterThanOrEqual(8);
    expect(rects.slice(0, 8).every(isBand)).toBeTrue();
    expect(rects.slice(0, 8).map(r => r.y0)).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
    expect(service.forcedFullRedraws()).toBe(1);

    // and only then do small updates resume
    state.set({ ...snap(), now: new Date(2026, 0, 15, 12, 0, 6), clock: { ...snap().clock, seconds: 6 } });
    const before = bitmapRects().length;
    await service.renderFrame();
    const added = bitmapRects().slice(before);
    expect(added.length).toBe(1);
    expect((added[0].x1 - added[0].x0 + 1) * (added[0].y1 - added[0].y0 + 1)).toBeLessThan(480 * 320 * 0.05);
  });
});
