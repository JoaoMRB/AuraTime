import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ScreenOutputService } from './screen-output.service';
import { DisplayStateService } from './display-state.service';
import { SERIAL_API } from './serial-link.service';
import { SerialLinkService } from './serial-link.service';
import { TickService } from './tick.service';
import { DisplaySnapshot } from './display-snapshot';
import { labelsFor } from './screen-logic';
import { FakePort, FakeSerial } from './testing/fake-serial';

function snap(overrides: Partial<DisplaySnapshot> = {}): DisplaySnapshot {
  return {
    now: new Date(2026, 0, 15, 12, 0, 5),
    theme: 'emerald-gold',
    fontId: 'outfit',
    clock: { hhmm: '12:00', seconds: 5, ampm: '', dateLabel: 'Thursday, January 15', use24h: true },
    focus: { phase: 'idle', remainingSec: 1500, totalSec: 1500, tasks: [] },
    stats: { todayMin: 0, streak: 0 },
    labels: labelsFor('en'),
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

  function bitmapHeaders(): Uint8Array[] {
    return port.writes.filter(w => w.length === 6 && w[5] === 197);
  }
  function brightnessWrites(): number[] {
    return port.writes
      .filter(w => w.length === 6 && w[5] === 110)
      .map(w => (w[0] << 2) | (w[1] >> 6));
  }

  beforeEach(async () => {
    localStorage.clear();
    state = signal(snap());
    serial = new FakeSerial();
    port = new FakePort();
    serial.picked = port;
    serial.ports = [port];
    TestBed.configureTestingModule({
      providers: [
        { provide: DisplayStateService, useValue: { snapshot: state } },
        { provide: SERIAL_API, useValue: serial }
      ]
    });
    service = TestBed.inject(ScreenOutputService);
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
        { provide: SERIAL_API, useValue: serial2 }
      ]
    });
    const restored = TestBed.inject(ScreenOutputService);
    expect(restored.viewMode()).toBe('weather');
    expect(restored.brightness().base).toBe(80);

    await restored.start();
    await flush(400);
    expect(TestBed.inject(SerialLinkService).status()).toBe('connected');
    expect(port2.writes.length).toBeGreaterThan(0);
    restored.stop();
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
