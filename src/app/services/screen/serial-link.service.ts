import { Injectable, InjectionToken, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Orientation, Rect, TURING_BAUD_RATE, TURING_USB_PRODUCT_ID, TURING_USB_VENDOR_ID, WRITE_CHUNK_BYTES,
  cmdBrightness, cmdDisplayBitmap, cmdHello, cmdOrientation, cmdReset, cmdScreenOn, isUsbMonitorHelloReply, rgb565ToBytes, splitBands
} from './turing-protocol';

/* Minimal structural types for the parts of Web Serial we use (not in the TS 5.5 DOM lib). */
export interface SerialReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}
export interface SerialWriterLike {
  write(chunk: Uint8Array): Promise<void>;
  /** Errors the stream and rejects pending writes: the only way to get rid of a write stuck on a dead port. */
  abort(reason?: unknown): Promise<void>;
  releaseLock(): void;
}
export interface SerialPortLike {
  open(options: { baudRate: number; flowControl: 'none' | 'hardware'; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  readable: { getReader(): SerialReaderLike } | null;
  writable: { getWriter(): SerialWriterLike } | null;
}
export interface SerialApiLike extends EventTarget {
  requestPort(options?: { filters?: { usbVendorId: number; usbProductId: number }[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

/** Provides navigator.serial (overridable in tests). */
export const SERIAL_API = new InjectionToken<SerialApiLike | null>('SERIAL_API', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && 'serial' in navigator ? (navigator as unknown as { serial: SerialApiLike }).serial : null)
});

/**
 * Whether the page is in a secure context (https or localhost). Browsers hide navigator.serial everywhere else,
 * for example on plain http from a LAN address, even in Chrome: "no Web Serial" and "not allowed here" look the
 * same to the code, and the visitor needs to be told which one it is. Overridable in tests.
 */
export const SECURE_CONTEXT = new InjectionToken<boolean>('SECURE_CONTEXT', {
  providedIn: 'root',
  factory: () => typeof window === 'undefined' || window.isSecureContext !== false
});

/**
 * How long to wait for the display after a RESET before looking for it again. The reference library waits about
 * 5 s: the display drops off the USB bus and Windows enumerates it again. Overridable in tests.
 */
export const DEVICE_RESET_WAIT_MS = new InjectionToken<number>('DEVICE_RESET_WAIT_MS', {
  providedIn: 'root',
  factory: () => 5000
});

/** Timing of the last bitmap sent, to diagnose transfer problems. */
export interface SendMetrics {
  width: number;
  height: number;
  bytes: number;
  /** Total time to hand the bitmap to the port. */
  ms: number;
  /** Longest pause between two consecutive chunk writes (JS-side stalls show up here). */
  maxGapMs: number;
}

export type SerialStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectOptions {
  /** RTS/CTS hardware flow control (recommended for this display). */
  flowControl: boolean;
  /** Initial backlight 0..100. */
  brightness: number;
  /** How long to wait for the HELLO reply, in ms. */
  helloTimeoutMs?: number;
  /** Skip the RESET that starts every connection (the display is known to be in a clean state). */
  skipReset?: boolean;
}

const DEFAULT_HELLO_TIMEOUT_MS = 700;
const STALL_WARNING_MS = 4000;
const MAX_SEND_HISTORY = 300;
/** Default pause after each band: lets the display finish one band before the next header arrives. */
export const DEFAULT_BAND_PAUSE_MS = 3;
export const MAX_BAND_PAUSE_MS = 20;
/** A single chunk write that takes longer than this means the port is dead (e.g. after the PC slept). */
const DEFAULT_WRITE_TIMEOUT_MS = 8000;

/** A SerialPort has streams only while it is open. (Read fresh each time: the state changes under our feet.) */
const streamsOf = (port: SerialPortLike) => ({ readable: port.readable, writable: port.writable });
const isOpen = (port: SerialPortLike) => {
  const { readable, writable } = streamsOf(port);
  return !!(readable || writable);
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Web Serial link to the Turing/TURZX 3.5" display (rev. A / UsbMonitor).
 * Must live in a visible page (not the MV3 service worker): Web Serial is not available there.
 */
@Injectable({
  providedIn: 'root'
})
export class SerialLinkService implements OnDestroy {
  private serial = inject(SERIAL_API);
  private secureContext = inject(SECURE_CONTEXT);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly status = signal<SerialStatus>('disconnected');
  /**
   * What the UI should tell the user: a translation key (e.g. 'SCREEN.MSG.BUSY') or ''.
   * The service stays language-agnostic; the page translates it.
   */
  readonly message = signal<string>('');
  /** Raw technical text of an unexpected error, shown next to the generic message. */
  readonly messageDetail = signal<string>('');
  /** Reply of the HELLO handshake, e.g. "UsbMonitor 3.5". */
  readonly model = signal<string>('');
  /**
   * A translation key for something worth telling the user while still connected (for example a device that
   * did not answer the HELLO handshake). Not an error: the display is used anyway.
   */
  readonly warning = signal<string>('');
  /** Frames (changed rectangles) sent since connecting; a tall frame goes out as several bands. */
  readonly framesSent = signal<number>(0);
  /** Diagnostics for the /screen page; unlike framesSent they survive reconnections. */
  readonly bandsSent = signal<number>(0);
  readonly writeTimeouts = signal<number>(0);
  /** Times the display was reset on purpose (every connection starts with one). */
  readonly resets = signal<number>(0);
  /** Times the link was torn down and the display reset because it looked stuck (the watchdog, or a hard resync). */
  readonly resyncs = signal<number>(0);
  readonly bytesSent = signal<number>(0);
  /** Diagnostic: extra pause after every chunk (ms). 0 = off. Mirrors the prototype's "slow send". */
  readonly chunkDelayMs = signal<number>(0);
  /** Pause after every band of a bitmap (ms), never between a header and its pixels. 0 = off. */
  readonly bandPauseMs = signal<number>(DEFAULT_BAND_PAUSE_MS);
  readonly lastSend = signal<SendMetrics | null>(null);
  /** When and how long the most recent frames took (newest last), for the sparkline on the /screen page. */
  readonly sendHistory = signal<readonly { at: number; ms: number }[]>([]);
  /** Hard limit for one chunk write; exceeded = the link is treated as broken. Adjustable for tests. */
  writeTimeoutMs = DEFAULT_WRITE_TIMEOUT_MS;
  /** Wait after a RESET before looking for the display again (it re-enumerates on the USB bus). */
  resetWaitMs = inject(DEVICE_RESET_WAIT_MS);
  /** How long after the wait to keep looking for it before giving up. */
  resetGiveUpMs = 15000;

  private port: SerialPortLike | null = null;
  private writer: SerialWriterLike | null = null;
  private reader: SerialReaderLike | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastOptions: ConnectOptions | null = null;
  private autoReconnect = false;
  private bytesCounter = 0;
  private lastChunkEnd: number | null = null;
  private gapMax = 0;
  /** A connect/reconnect is in progress (so two attempts never open the same port at once). */
  private opening = false;
  /** The page is going away: nothing new is written, and a frame in progress stops after its current band. */
  private suspended = false;

  private onDeviceDisconnect = (event: Event) => {
    // Per spec the event target is the SerialPort that went away.
    const e = event as Event & { port?: unknown };
    if (this.port && ((event.target as unknown) === this.port || e.port === this.port)) {
      // The device is gone, so closing its streams is expected to fail: not worth a warning.
      void this.teardown('SCREEN.MSG.UNPLUGGED', undefined, true);
    }
  };

  private onDeviceConnect = () => {
    if (this.autoReconnect && this.status() !== 'connected' && this.status() !== 'connecting' && this.lastOptions) {
      setTimeout(() => void this.reconnect(this.lastOptions!, { silent: true }), 800);
    }
  };

  constructor() {
    if (!this.isBrowser || !this.serial) {
      this.status.set(this.isBrowser ? 'unsupported' : 'disconnected');
      if (this.isBrowser) this.setMessage('SCREEN.MSG.UNSUPPORTED');
      return;
    }
    this.serial.addEventListener('disconnect', this.onDeviceDisconnect);
    this.serial.addEventListener('connect', this.onDeviceConnect);
  }

  isSupported(): boolean {
    return this.serial !== null;
  }

  /**
   * Web Serial is missing because the page is not in a secure context (plain http on a network address), not
   * because of the browser: the fix is to open it over https or from localhost, not to switch browsers.
   */
  isInsecureContext(): boolean {
    return this.serial === null && !this.secureContext;
  }

  /** Asks the user to pick the display. Needs a user gesture. */
  async connect(options: ConnectOptions): Promise<boolean> {
    if (!this.serial || this.opening || this.status() === 'connecting' || this.status() === 'connected') return false;
    this.opening = true;
    this.status.set('connecting');
    this.setMessage('');
    try {
      const port = await this.serial.requestPort({
        filters: [{ usbVendorId: TURING_USB_VENDOR_ID, usbProductId: TURING_USB_PRODUCT_ID }]
      });
      return await this.openPort(port, options);
    } catch (e) {
      // NotFoundError = the user closed the picker: not an error worth showing.
      const cancelled = (e as { name?: string })?.name === 'NotFoundError';
      this.status.set(cancelled ? 'disconnected' : 'error');
      if (cancelled) this.setMessage('');
      else this.reportError(e);
      return false;
    } finally {
      this.opening = false;
    }
  }

  /**
   * Reopens a previously authorised display without any dialog. Returns false if none is available.
   * `silent` is for automatic retries: the status never flips to 'connecting' (that would make the page flicker
   * every few seconds while the display is away) and the message (for example "unplugged") stays until the
   * display is really back or fails for a different reason.
   */
  async reconnect(options: ConnectOptions, { silent = false }: { silent?: boolean } = {}): Promise<boolean> {
    if (!this.serial || this.opening || this.status() === 'connecting' || this.status() === 'connected') return false;
    this.opening = true;
    if (!silent) this.status.set('connecting');
    try {
      const ports = await this.serial.getPorts();
      const port = ports.find(p => {
        const info = p.getInfo();
        return info.usbVendorId === TURING_USB_VENDOR_ID && info.usbProductId === TURING_USB_PRODUCT_ID;
      });
      if (!port) {
        if (!silent) this.status.set('disconnected');
        return false;
      }
      return await this.openPort(port, options);
    } catch (e) {
      this.status.set('error');
      this.reportError(e);
      return false;
    } finally {
      this.opening = false;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false; // an explicit disconnect must not be undone by a later 'connect' event
    await this.teardown('');
  }

  /** Sends a rectangle of RGB565 pixels. Writes are serialised. */
  sendBitmap(rect: Rect, pixels: Uint16Array): Promise<void> {
    return this.enqueue(async () => {
      if (this.suspended) return;
      // Every band (header + pixels) belongs to this one job: nothing else can be written in between. A tall
      // rectangle goes out as bands so that a lost byte spoils one band at most and the next one starts clean.
      const started = performance.now();
      this.lastChunkEnd = null;
      this.gapMax = 0;
      const width = rect.x1 - rect.x0 + 1;
      let bytes = 0;
      for (const band of splitBands(rect)) {
        // Between two bands the display is in a clean state: that is the place to stop when the page unloads.
        if (this.suspended && bytes > 0) break;
        const rows = band.rect.y1 - band.rect.y0 + 1;
        const header = cmdDisplayBitmap(band.rect);
        const body = rgb565ToBytes(pixels.subarray(band.offset, band.offset + rows * width));
        await this.write(header);
        await this.write(body);
        bytes += header.length + body.length;
        this.bandsSent.update(n => n + 1);
        const pause = this.bandPauseMs();
        if (pause > 0) await sleep(pause);
      }
      this.framesSent.update(n => n + 1);
      // Signals are updated once per frame, not per chunk, to keep the write loop tight.
      this.bytesSent.set(this.bytesCounter);
      this.sendHistory.update(h => [...h.slice(1 - MAX_SEND_HISTORY), { at: Date.now(), ms: Math.round(performance.now() - started) }]);
      this.lastSend.set({
        width,
        height: rect.y1 - rect.y0 + 1,
        bytes,
        ms: Math.round(performance.now() - started),
        maxGapMs: Math.round(this.gapMax)
      });
    });
  }

  /** Tells the display again which way up it is (it may have lost it: a reset, a power glitch). */
  setOrientation(): Promise<void> {
    return this.enqueue(async () => {
      if (this.suspended) return;
      await this.write(cmdOrientation(Orientation.Landscape));
    });
  }

  /** The page is unloading: stop queuing new frames. A bitmap in progress finishes its current band and stops. */
  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  /**
   * Tears the link down and brings it back with a RESET: for a display that is connected on paper but no longer
   * answers (frozen, mid-bitmap, wrong orientation). Counted in `resyncs`.
   */
  async hardResync(options: ConnectOptions | null = this.lastOptions): Promise<boolean> {
    if (!options || !this.serial) return false;
    this.resyncs.update(n => n + 1);
    await this.teardown('', 'error');
    return this.reconnect({ ...options, skipReset: false }, { silent: true });
  }

  setBrightness(level: number): Promise<void> {
    return this.enqueue(async () => {
      if (this.suspended) return;
      await this.write(cmdBrightness(level));
      this.bytesSent.set(this.bytesCounter);
    });
  }

  /** Called by the output loop when a write fails: drops the port but keeps auto-reconnect armed. */
  async fail(error: unknown): Promise<void> {
    await this.teardown('', 'error');
    this.reportError(error);
  }

  isConnected(): boolean {
    return this.status() === 'connected';
  }

  ngOnDestroy(): void {
    this.serial?.removeEventListener('disconnect', this.onDeviceDisconnect);
    this.serial?.removeEventListener('connect', this.onDeviceConnect);
  }

  /* ------------------------------ internals ------------------------------ */

  /**
   * Every connection starts from a known state: the display is reset (which clears a bitmap left half-sent and
   * a wrong orientation), we wait for it to come back on the bus, then initialise it from scratch.
   */
  private async openPort(port: SerialPortLike, options: ConnectOptions): Promise<boolean> {
    let target = port;
    if (!options.skipReset) {
      try {
        target = await this.resetDevice(port, options);
      } catch (e) {
        await this.teardown('', 'error');
        this.reportError(e);
        return false;
      }
    }
    return this.attach(target, options);
  }

  /** Opens the port, sends RESET, closes it, waits, and finds the display again through getPorts(). */
  private async resetDevice(port: SerialPortLike, options: ConnectOptions): Promise<SerialPortLike> {
    if (isOpen(port)) {
      await this.attempt('close a port left open by the previous session', () => port.close());
      if (isOpen(port)) throw new Error('The port is still open from an earlier session.');
    }
    await port.open({
      baudRate: TURING_BAUD_RATE,
      flowControl: options.flowControl ? 'hardware' : 'none',
      bufferSize: 65536
    });
    const writer = port.writable?.getWriter();
    if (!writer) throw new Error('The port has no readable/writable stream.');
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The display stopped responding.')), this.writeTimeoutMs);
      });
      try {
        await Promise.race([writer.write(cmdReset()), timeout]);
      } finally {
        clearTimeout(timer);
      }
      this.resets.update(n => n + 1);
    } catch (e) {
      await this.attempt('abort the writer after a failed reset', () => writer.abort('reset failed'), true);
      await this.attempt('release the writer', () => writer.releaseLock(), true);
      await this.attempt('close the port after a failed reset', () => port.close(), true);
      throw e;
    }
    await this.attempt('release the writer', () => writer.releaseLock());
    await this.attempt('close the port for the reset', () => port.close());

    await sleep(this.resetWaitMs);
    const back = await this.findDevice();
    await sleep(Math.min(500, this.resetWaitMs)); // let it finish booting before the first command
    return back;
  }

  /** The display re-enumerates after a reset, and the port may disappear for a moment: keep looking. */
  private async findDevice(): Promise<SerialPortLike> {
    const deadline = Date.now() + this.resetGiveUpMs;
    for (;;) {
      const ports = await this.serial!.getPorts();
      const found = ports.find(p => {
        const info = p.getInfo();
        return info.usbVendorId === TURING_USB_VENDOR_ID && info.usbProductId === TURING_USB_PRODUCT_ID;
      });
      if (found) return found;
      if (Date.now() >= deadline) throw new Error('The display did not come back after the reset.');
      await sleep(250);
    }
  }

  private async attach(port: SerialPortLike, options: ConnectOptions): Promise<boolean> {
    try {
      // A port that a previous session could not close is still open (and open() would refuse it): close it first.
      if (isOpen(port)) {
        await this.attempt('close a port left open by the previous session', () => port.close());
        if (isOpen(port)) throw new Error('The port is still open from an earlier session.');
      }
      await port.open({
        baudRate: TURING_BAUD_RATE,
        flowControl: options.flowControl ? 'hardware' : 'none',
        bufferSize: 65536
      });
      // From here on teardown() owns the port, so any failure below closes it properly.
      this.port = port;
      const { readable, writable } = streamsOf(port);
      if (!writable || !readable) throw new Error('The port has no readable/writable stream.');
      this.writer = writable.getWriter();
      this.reader = readable.getReader();
      this.framesSent.set(0);
      this.bytesSent.set(0);
      this.bytesCounter = 0;
      this.lastSend.set(null);
      this.lastOptions = options;

      await this.enqueue(async () => {
        await this.write(cmdHello());
        const reply = await this.readBytes(6, options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS);
        const answered = isUsbMonitorHelloReply(reply);
        this.model.set(answered ? 'UsbMonitor 3.5' : 'Turing 3.5');
        // The original Turing 3.5" stays silent, so this is a warning, not an error: but a device that does not
        // answer may also be a model we do not support, and the user should know if the picture looks wrong.
        this.warning.set(answered ? '' : 'SCREEN.MSG.NO_HELLO');
        await this.write(cmdScreenOn());
        await this.write(cmdOrientation(Orientation.Landscape));
        await sleep(150);
        await this.write(cmdBrightness(options.brightness));
      });
      this.bytesSent.set(this.bytesCounter);

      this.autoReconnect = true;
      this.status.set('connected');
      this.setMessage('');
      return true;
    } catch (e) {
      await this.teardown('', 'error');
      this.reportError(e);
      return false;
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Chunked write with a watchdog: with flow control on, a display that stops accepting data blocks forever. */
  private async write(bytes: Uint8Array): Promise<void> {
    const writer = this.writer;
    if (!writer) throw new Error('Not connected.');
    for (let i = 0; i < bytes.length; i += WRITE_CHUNK_BYTES) {
      const part = bytes.subarray(i, i + WRITE_CHUNK_BYTES);
      const startedAt = performance.now();
      if (this.lastChunkEnd !== null) this.gapMax = Math.max(this.gapMax, startedAt - this.lastChunkEnd);
      const watchdog = setTimeout(() => {
        this.setMessage('SCREEN.MSG.STALLED');
      }, STALL_WARNING_MS);
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      const hardTimeout = new Promise<never>((_, reject) => {
        hardTimer = setTimeout(() => {
          this.writeTimeouts.update(n => n + 1);
          reject(new Error('The display stopped responding.'));
        }, this.writeTimeoutMs);
      });
      try {
        // Without this a write to a dead port can stay pending forever and freeze the whole output loop.
        await Promise.race([writer.write(part), hardTimeout]);
      } finally {
        clearTimeout(watchdog);
        clearTimeout(hardTimer);
      }
      this.bytesCounter += part.length;
      this.lastChunkEnd = performance.now();
      const delay = this.chunkDelayMs();
      if (delay > 0) await sleep(delay);
    }
  }

  /** Reads up to n bytes, giving up after `ms`. */
  private async readBytes(n: number, ms: number): Promise<Uint8Array> {
    const out: number[] = [];
    const deadline = Date.now() + ms;
    while (out.length < n && Date.now() < deadline && this.reader && this.port?.readable) {
      const timeout = sleep(Math.max(0, deadline - Date.now())).then(() => ({ timeout: true as const }));
      const result = await Promise.race([this.reader.read(), timeout]);
      if ('timeout' in result) {
        // A pending read() cannot be abandoned: cancel it and take a fresh reader.
        await this.reader.cancel().catch(() => undefined);
        this.reader.releaseLock();
        this.reader = this.port.readable.getReader();
        break;
      }
      if (result.done) break;
      out.push(...(result.value ?? []));
    }
    return new Uint8Array(out);
  }

  /**
   * Closes the port the way Web Serial requires: a writer that may still have a write stuck on a dead port is
   * aborted and released, the reader is cancelled and released, and only then is the port closed (close() throws
   * while a stream is locked). Every step is attempted even if a previous one failed, and failures are logged.
   * `expectFailures` (the device was unplugged) logs them quietly: the streams are gone with the device.
   */
  private async teardown(message: string, status?: SerialStatus, expectFailures = false): Promise<void> {
    const { port, reader, writer } = this;
    this.port = this.writer = this.reader = null;
    this.queue = Promise.resolve();
    const quiet = expectFailures;

    if (writer) {
      await this.attempt('abort the writer', () => writer.abort('closing'), quiet);
      await this.attempt('release the writer', () => writer.releaseLock(), quiet);
    }
    if (reader) {
      await this.attempt('cancel the reader', () => reader.cancel(), quiet);
      await this.attempt('release the reader', () => reader.releaseLock(), quiet);
    }
    if (port) {
      await this.attempt('close the port', () => port.close(), quiet);
    }

    this.model.set('');
    this.warning.set('');
    this.status.set(status ?? (this.isSupported() ? 'disconnected' : 'unsupported'));
    this.setMessage(message);
  }

  /** Runs one step of a clean-up. A failure is logged, never swallowed, and never stops the next step. */
  private async attempt(what: string, action: () => unknown, quiet = false): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      (quiet ? console.debug : console.warn)(`[SerialLink] could not ${what}`, error);
      return false;
    }
  }

  private setMessage(key: string, detail = ''): void {
    this.message.set(key);
    this.messageDetail.set(detail);
  }

  /** Maps an exception to one of our translatable messages (the raw text is kept as detail when unknown). */
  private reportError(e: unknown): void {
    const text = e instanceof Error ? e.message : String(e);
    if (/failed to open|access denied|busy|in use/i.test(text)) {
      this.setMessage('SCREEN.MSG.BUSY');
    } else if (/stopped responding|did not come back/i.test(text)) {
      this.setMessage('SCREEN.MSG.NOT_RESPONDING');
    } else {
      this.setMessage('SCREEN.MSG.GENERIC', text);
    }
  }
}
