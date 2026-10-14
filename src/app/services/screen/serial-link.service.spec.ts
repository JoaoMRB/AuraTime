import { TestBed } from '@angular/core/testing';
import { SERIAL_API, SerialApiLike, SerialLinkService } from './serial-link.service';
import { FakePort, FakeSerial } from './testing/fake-serial';

describe('SerialLinkService', () => {
  const OPTIONS = { flowControl: true, brightness: 60, helloTimeoutMs: 20 };
  let serial: FakeSerial;
  let port: FakePort;

  function create(api: SerialApiLike | null = serial): SerialLinkService {
    TestBed.configureTestingModule({ providers: [{ provide: SERIAL_API, useValue: api }] });
    return TestBed.inject(SerialLinkService);
  }

  beforeEach(() => {
    serial = new FakeSerial();
    port = new FakePort();
    serial.picked = port;
    serial.ports = [port];
  });

  it('reports unsupported browsers', () => {
    const service = create(null);
    expect(service.status()).toBe('unsupported');
    expect(service.isSupported()).toBeFalse();
    expect(service.message()).toContain('Web Serial');
  });

  it('connects with RTS/CTS and runs the init sequence (hello, screen on, landscape, brightness)', async () => {
    port.reader.replies.push(new Uint8Array([1, 1, 1, 1, 1, 1]));
    const service = create();

    expect(await service.connect(OPTIONS)).toBeTrue();

    expect(service.status()).toBe('connected');
    expect(service.model()).toBe('UsbMonitor 3.5');
    expect(serial.requestedFilters).toEqual([{ usbVendorId: 0x1a86, usbProductId: 0x5722 }]);
    expect(port.openArgs).toEqual({ baudRate: 115200, flowControl: 'hardware', bufferSize: 65536 });

    const cmds = port.writes.map(w => Array.from(w));
    expect(cmds[0]).toEqual([69, 69, 69, 69, 69, 69]); // HELLO
    expect(cmds[1][5]).toBe(109); // SCREEN_ON
    expect(cmds[2][5]).toBe(121); // SET_ORIENTATION
    expect(cmds[2].length).toBe(16);
    expect(cmds[3][5]).toBe(110); // SET_BRIGHTNESS
  });

  it('can run without flow control and identifies a plain Turing when HELLO gets no reply', async () => {
    const service = create();
    await service.connect({ ...OPTIONS, flowControl: false });
    expect((port.openArgs as { flowControl: string }).flowControl).toBe('none');
    expect(service.model()).toBe('Turing 3.5');
    expect(service.status()).toBe('connected');
  });

  it('sends a bitmap as header + pixel bytes, split into chunks', async () => {
    const service = create();
    await service.connect(OPTIONS);
    port.writes.length = 0;

    const rect = { x0: 0, y0: 0, x1: 99, y1: 49 }; // 5000 px = 10000 bytes
    await service.sendBitmap(rect, new Uint16Array(5000).fill(0xf800));

    expect(port.writes[0][5]).toBe(197); // DISPLAY_BITMAP header
    const body = port.writes.slice(1);
    expect(body.every(c => c.length <= 2560)).toBeTrue();
    expect(body.reduce((n, c) => n + c.length, 0)).toBe(10000);
    expect(Array.from(body[0].subarray(0, 2))).toEqual([0x00, 0xf8]); // little-endian RGB565
    expect(service.framesSent()).toBe(1);
    expect(service.bytesSent()).toBeGreaterThan(10000);
  });

  it('gives up on a write that never completes instead of freezing (dead port after sleep)', async () => {
    const service = create();
    await service.connect(OPTIONS);
    service.writeTimeoutMs = 40;
    port.gate = new Promise<void>(() => { /* never resolves */ });

    await expectAsync(service.sendBitmap({ x0: 0, y0: 0, x1: 1, y1: 0 }, new Uint16Array([1, 2])))
      .toBeRejectedWithError(/stopped responding/);
  });

  it('keeps writes in order when several frames are queued', async () => {
    const service = create();
    await service.connect(OPTIONS);
    port.writes.length = 0;
    await Promise.all([
      service.sendBitmap({ x0: 0, y0: 0, x1: 1, y1: 0 }, new Uint16Array([1, 2])),
      service.sendBitmap({ x0: 5, y0: 0, x1: 6, y1: 0 }, new Uint16Array([3, 4]))
    ]);
    const headers = port.writes.filter(w => w.length === 6 && w[5] === 197);
    expect(headers.length).toBe(2);
    expect(port.writes.indexOf(headers[0])).toBeLessThan(port.writes.indexOf(headers[1]));
    expect(port.writes.length).toBe(4);
  });

  it('reconnects to an already authorised display without asking', async () => {
    const service = create();
    expect(await service.reconnect(OPTIONS)).toBeTrue();
    expect(service.status()).toBe('connected');
  });

  it('does not reconnect when no known display is authorised', async () => {
    serial.ports = [new FakePort({ usbVendorId: 0x1234, usbProductId: 0x1 })];
    const service = create();
    expect(await service.reconnect(OPTIONS)).toBeFalse();
    expect(service.status()).toBe('disconnected');
  });

  it('treats closing the picker as a quiet cancel', async () => {
    serial.cancelPicker = true;
    const service = create();
    expect(await service.connect(OPTIONS)).toBeFalse();
    expect(service.status()).toBe('disconnected');
    expect(service.message()).toBe('');
  });

  it('explains a busy port', async () => {
    port.failOpen = "Failed to execute 'open' on 'SerialPort': Failed to open serial port.";
    const service = create();
    expect(await service.connect(OPTIONS)).toBeFalse();
    expect(service.status()).toBe('error');
    expect(service.message()).toContain('TURZX');
  });

  it('disconnects cleanly', async () => {
    const service = create();
    await service.connect(OPTIONS);
    await service.disconnect();
    expect(service.status()).toBe('disconnected');
    expect(port.closed).toBeTrue();
  });

  it('notices the display being unplugged and then reconnects when it returns', async () => {
    const service = create();
    await service.connect(OPTIONS);

    serial.unplug(port);
    await new Promise(r => setTimeout(r));
    expect(service.status()).toBe('disconnected');
    expect(service.message()).toContain('unplugged');

    jasmine.clock().install();
    serial.dispatchEvent(new Event('connect'));
    jasmine.clock().tick(1000);
    jasmine.clock().uninstall();
    await new Promise(r => setTimeout(r, 400)); // init sequence includes a 150 ms pause
    expect(service.status()).toBe('connected');
  });

  it('does not auto-reconnect after an explicit disconnect', async () => {
    const service = create();
    await service.connect(OPTIONS);
    await service.disconnect();

    jasmine.clock().install();
    serial.dispatchEvent(new Event('connect'));
    jasmine.clock().tick(1000);
    jasmine.clock().uninstall();
    await new Promise(r => setTimeout(r, 50));
    expect(service.status()).toBe('disconnected');
  });
});
