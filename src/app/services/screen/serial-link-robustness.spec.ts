import { TestBed } from '@angular/core/testing';
import { SERIAL_API, SerialLinkService } from './serial-link.service';
import { FakePort, FakeSerial } from './testing/fake-serial';

describe('SerialLinkService: closing, reopening and retrying', () => {
  const OPTIONS = { flowControl: true, brightness: 60, helloTimeoutMs: 20 };
  const HELLO_OK = new Uint8Array([1, 1, 1, 1, 1, 1]);
  let serial: FakeSerial;
  let port: FakePort;
  let service: SerialLinkService;

  beforeEach(() => {
    serial = new FakeSerial();
    port = new FakePort();
    serial.picked = port;
    serial.ports = [port];
    TestBed.configureTestingModule({ providers: [{ provide: SERIAL_API, useValue: serial }] });
    service = TestBed.inject(SerialLinkService);
  });

  async function connected(): Promise<void> {
    port.reader.replies.push(HELLO_OK);
    expect(await service.connect(OPTIONS)).toBeTrue();
  }

  /** Records every status the page would have shown, in order. */
  function recordStatuses(): string[] {
    const seen: string[] = [];
    const set = service.status.set.bind(service.status);
    service.status.set = (value: Parameters<typeof set>[0]) => {
      seen.push(value);
      set(value);
    };
    return seen;
  }

  describe('closing the port', () => {
    it('aborts and releases the writer, cancels and releases the reader, and only then closes the port', async () => {
      await connected();
      port.events.length = 0;
      await service.disconnect();
      expect(port.events).toEqual(['writer.abort', 'writer.release', 'reader.release', 'port.close']);
      expect(port.isOpen).toBeFalse();
      expect(port.closed).toBeTrue();
    });

    it('really closes the port after a write that never completed (it used to stay open and locked)', async () => {
      await connected();
      service.writeTimeoutMs = 30;
      port.gate = new Promise<void>(() => { /* a dead port: the write never finishes */ });

      await expectAsync(service.sendBitmap({ x0: 0, y0: 0, x1: 1, y1: 0 }, new Uint16Array([1, 2]))).toBeRejectedWithError(/stopped responding/);
      await service.fail(new Error('The display stopped responding.'));

      expect(port.isOpen).withContext('the port must be closed again').toBeFalse();
      expect(port.events.indexOf('writer.abort')).toBeLessThan(port.events.indexOf('port.close'));
      expect(service.status()).toBe('error');
      expect(service.message()).toBe('SCREEN.MSG.NOT_RESPONDING');
    });

    it('and a reconnect after that write timeout really reopens the port and the display works again', async () => {
      await connected();
      service.writeTimeoutMs = 30;
      port.gate = new Promise<void>(() => { /* dead */ });
      await expectAsync(service.sendBitmap({ x0: 0, y0: 0, x1: 1, y1: 0 }, new Uint16Array([1, 2]))).toBeRejected();
      await service.fail(new Error('The display stopped responding.'));

      port.gate = null; // the display is back
      port.reader.replies.push(HELLO_OK);
      expect(await service.reconnect(OPTIONS, { silent: true })).toBeTrue();

      expect(port.openCount).toBe(2);
      expect(service.status()).toBe('connected');
      port.writes.length = 0;
      await service.sendBitmap({ x0: 0, y0: 0, x1: 0, y1: 0 }, new Uint16Array([7]));
      expect(port.writes.length).toBe(2); // header + pixel: it really writes again
    });

    it('logs the failures instead of swallowing them, and still tries every step', async () => {
      await connected();
      const warn = spyOn(console, 'warn');
      port.reader.failCancel = true;
      port.failClose = 1;

      await service.disconnect();

      const messages = warn.calls.allArgs().map(a => String(a[0]));
      expect(messages.some(m => m.includes('cancel the reader'))).toBeTrue();
      expect(messages.some(m => m.includes('close the port'))).toBeTrue();
      // the other steps were still attempted
      expect(port.events).toContain('writer.abort');
      expect(port.events).toContain('writer.release');
      expect(port.events).toContain('port.close');
      expect(service.status()).toBe('disconnected');
    });

    it('is quiet about the clean-up of a display that was unplugged (those failures are expected)', async () => {
      await connected();
      const warn = spyOn(console, 'warn');
      const debug = spyOn(console, 'debug');
      port.reader.failCancel = true;
      serial.unplug(port);
      await new Promise(r => setTimeout(r, 10));
      expect(warn).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalled();
      expect(service.message()).toBe('SCREEN.MSG.UNPLUGGED');
    });

    it('closes a port that an earlier session could not close, before opening it again', async () => {
      await connected();
      spyOn(console, 'warn');
      port.failClose = 1; // the first close fails: the port stays open
      await service.disconnect();
      expect(port.isOpen).toBeTrue();

      port.reader.replies.push(HELLO_OK);
      expect(await service.connect(OPTIONS)).toBeTrue(); // would be "already open" without the extra close
      expect(port.openCount).toBe(2);
    });

    it('closes the port when the handshake fails half way through the opening', async () => {
      port.reader.replies.push(HELLO_OK);
      spyOn(port, 'getInfo').and.callThrough();
      port.gate = Promise.resolve();
      const originalWritable = Object.getOwnPropertyDescriptor(FakePort.prototype, 'writable')!;
      Object.defineProperty(port, 'writable', { configurable: true, get: () => { throw new Error('boom'); } });
      expect(await service.connect(OPTIONS)).toBeFalse();
      delete (port as unknown as { writable?: unknown }).writable;
      expect(originalWritable).toBeTruthy();
      expect(port.isOpen).toBeFalse();
      expect(service.status()).toBe('error');
    });
  });

  describe('automatic reconnection', () => {
    it('does not flicker through "connecting" while the display is away', async () => {
      await connected();
      serial.unplug(port);
      await new Promise(r => setTimeout(r, 10));
      serial.ports = []; // gone

      const seen = recordStatuses();
      for (let i = 0; i < 4; i++) await service.reconnect(OPTIONS, { silent: true });
      expect(seen).toEqual([]); // not a single status change
      expect(service.status()).toBe('disconnected');
    });

    it('keeps the "unplugged" message through the retries, until the display is really back', async () => {
      await connected();
      serial.unplug(port);
      await new Promise(r => setTimeout(r, 10));
      expect(service.message()).toBe('SCREEN.MSG.UNPLUGGED');
      serial.ports = [];
      for (let i = 0; i < 3; i++) await service.reconnect(OPTIONS, { silent: true });
      expect(service.message()).toBe('SCREEN.MSG.UNPLUGGED');

      serial.ports = [port];
      port.reader.replies.push(HELLO_OK);
      expect(await service.reconnect(OPTIONS, { silent: true })).toBeTrue();
      expect(service.message()).toBe('');
    });

    it('a visible retry (not silent) still shows "connecting", as before', async () => {
      const seen = recordStatuses();
      serial.ports = [];
      await service.reconnect(OPTIONS);
      expect(seen).toEqual(['connecting', 'disconnected']);
    });

    it('goes straight to the new problem if the display is back but cannot be opened', async () => {
      await connected();
      serial.unplug(port);
      await new Promise(r => setTimeout(r, 10));
      port.failOpen = 'Failed to open serial port.';

      const seen = recordStatuses();
      expect(await service.reconnect(OPTIONS, { silent: true })).toBeFalse();
      expect(seen).not.toContain('connecting');
      expect(service.status()).toBe('error');
      expect(service.message()).toBe('SCREEN.MSG.BUSY');
    });

    it('two attempts at once open the port only once', async () => {
      port.reader.replies.push(HELLO_OK);
      const results = await Promise.all([service.reconnect(OPTIONS, { silent: true }), service.reconnect(OPTIONS, { silent: true })]);
      expect(results.filter(Boolean).length).toBe(1);
      expect(port.openCount).toBe(1);
    });

    it('the "device plugged in" event reconnects quietly', async () => {
      await connected();
      serial.unplug(port);
      await new Promise(r => setTimeout(r, 10));
      const seen = recordStatuses();
      port.reader.replies.push(HELLO_OK);
      serial.dispatchEvent(new Event('connect'));
      await new Promise(r => setTimeout(r, 1200));
      expect(service.status()).toBe('connected');
      expect(seen).not.toContain('connecting');
    });
  });

  describe('the HELLO handshake', () => {
    it('a UsbMonitor answers: no warning', async () => {
      await connected();
      expect(service.model()).toBe('UsbMonitor 3.5');
      expect(service.warning()).toBe('');
    });

    it('a device that does not answer is flagged, but still used', async () => {
      expect(await service.connect(OPTIONS)).toBeTrue();
      expect(service.status()).toBe('connected');
      expect(service.model()).toBe('Turing 3.5');
      expect(service.warning()).toBe('SCREEN.MSG.NO_HELLO');
    });

    it('a device that answers with something else is flagged too', async () => {
      port.reader.replies.push(new Uint8Array([9, 9, 9, 9, 9, 9]));
      await service.connect(OPTIONS);
      expect(service.warning()).toBe('SCREEN.MSG.NO_HELLO');
    });

    it('the warning goes away when the display is disconnected', async () => {
      await service.connect(OPTIONS);
      await service.disconnect();
      expect(service.warning()).toBe('');
    });
  });
});
