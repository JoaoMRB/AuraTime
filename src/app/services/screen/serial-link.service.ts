import { Injectable, InjectionToken, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Orientation, Rect, TURING_BAUD_RATE, TURING_USB_PRODUCT_ID, TURING_USB_VENDOR_ID, WRITE_CHUNK_BYTES,
  cmdBrightness, cmdDisplayBitmap, cmdHello, cmdOrientation, cmdScreenOn, isUsbMonitorHelloReply, rgb565ToBytes
} from './turing-protocol';

/* Minimal structural types for the parts of Web Serial we use (not in the TS 5.5 DOM lib). */
export interface SerialReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}
export interface SerialWriterLike {
  write(chunk: Uint8Array): Promise<void>;
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
}

const DEFAULT_HELLO_TIMEOUT_MS = 700;
const STALL_WARNING_MS = 4000;
/** A single chunk write that takes longer than this means the port is dead (e.g. after the PC slept). */
const DEFAULT_WRITE_TIMEOUT_MS = 8000;

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
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly status = signal<SerialStatus>('disconnected');
  /** Human-readable detail for the UI (errors, stalls, model). */
  readonly message = signal<string>('');
  /** Reply of the HELLO handshake, e.g. "UsbMonitor 3.5". */
  readonly model = signal<string>('');
  readonly framesSent = signal<number>(0);
  readonly bytesSent = signal<number>(0);
  /** Diagnostic: extra pause after every chunk (ms). 0 = off. Mirrors the prototype's "slow send". */
  readonly chunkDelayMs = signal<number>(0);
  readonly lastSend = signal<SendMetrics | null>(null);
  /** Hard limit for one chunk write; exceeded = the link is treated as broken. Adjustable for tests. */
  writeTimeoutMs = DEFAULT_WRITE_TIMEOUT_MS;

  private port: SerialPortLike | null = null;
  private writer: SerialWriterLike | null = null;
  private reader: SerialReaderLike | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastOptions: ConnectOptions | null = null;
  private autoReconnect = false;
  private bytesCounter = 0;
  private lastChunkEnd: number | null = null;
  private gapMax = 0;

  private onDeviceDisconnect = (event: Event) => {
    // Per spec the event target is the SerialPort that went away.
    const e = event as Event & { port?: unknown };
    if (this.port && ((event.target as unknown) === this.port || e.port === this.port)) {
      void this.teardown('Display unplugged. Waiting for it to come back…');
    }
  };

  private onDeviceConnect = () => {
    if (this.autoReconnect && this.status() !== 'connected' && this.status() !== 'connecting' && this.lastOptions) {
      setTimeout(() => void this.reconnect(this.lastOptions!), 800);
    }
  };

  constructor() {
    if (!this.isBrowser || !this.serial) {
      this.status.set(this.isBrowser ? 'unsupported' : 'disconnected');
      if (this.isBrowser) this.message.set('This browser has no Web Serial support. Use Chrome or Edge.');
      return;
    }
    this.serial.addEventListener('disconnect', this.onDeviceDisconnect);
    this.serial.addEventListener('connect', this.onDeviceConnect);
  }

  isSupported(): boolean {
    return this.serial !== null;
  }

  /** Asks the user to pick the display. Needs a user gesture. */
  async connect(options: ConnectOptions): Promise<boolean> {
    if (!this.serial || this.status() === 'connecting' || this.status() === 'connected') return false;
    this.status.set('connecting');
    this.message.set('');
    try {
      const port = await this.serial.requestPort({
        filters: [{ usbVendorId: TURING_USB_VENDOR_ID, usbProductId: TURING_USB_PRODUCT_ID }]
      });
      return await this.openPort(port, options);
    } catch (e) {
      // NotFoundError = the user closed the picker: not an error worth showing.
      const cancelled = (e as { name?: string })?.name === 'NotFoundError';
      this.status.set(cancelled ? 'disconnected' : 'error');
      this.message.set(cancelled ? '' : this.describeError(e));
      return false;
    }
  }

  /** Reopens a previously authorised display without any dialog. Returns false if none is available. */
  async reconnect(options: ConnectOptions): Promise<boolean> {
    if (!this.serial || this.status() === 'connecting' || this.status() === 'connected') return false;
    this.status.set('connecting');
    try {
      const ports = await this.serial.getPorts();
      const port = ports.find(p => {
        const info = p.getInfo();
        return info.usbVendorId === TURING_USB_VENDOR_ID && info.usbProductId === TURING_USB_PRODUCT_ID;
      });
      if (!port) {
        this.status.set('disconnected');
        return false;
      }
      return await this.openPort(port, options);
    } catch (e) {
      this.status.set('error');
      this.message.set(this.describeError(e));
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false; // an explicit disconnect must not be undone by a later 'connect' event
    await this.teardown('');
  }

  /** Sends a rectangle of RGB565 pixels. Writes are serialised. */
  sendBitmap(rect: Rect, pixels: Uint16Array): Promise<void> {
    return this.enqueue(async () => {
      // Header and pixels are one atomic job: nothing else can be written in between.
      const started = performance.now();
      this.lastChunkEnd = null;
      this.gapMax = 0;
      const header = cmdDisplayBitmap(rect);
      const body = rgb565ToBytes(pixels);
      await this.write(header);
      await this.write(body);
      this.framesSent.update(n => n + 1);
      // Signals are updated once per bitmap, not per chunk, to keep the write loop tight.
      this.bytesSent.set(this.bytesCounter);
      this.lastSend.set({
        width: rect.x1 - rect.x0 + 1,
        height: rect.y1 - rect.y0 + 1,
        bytes: header.length + body.length,
        ms: Math.round(performance.now() - started),
        maxGapMs: Math.round(this.gapMax)
      });
    });
  }

  setBrightness(level: number): Promise<void> {
    return this.enqueue(async () => {
      await this.write(cmdBrightness(level));
      this.bytesSent.set(this.bytesCounter);
    });
  }

  /** Called by the output loop when a write fails: drops the port but keeps auto-reconnect armed. */
  async fail(error: unknown): Promise<void> {
    await this.teardown('');
    this.status.set('error');
    this.message.set(this.describeError(error));
  }

  isConnected(): boolean {
    return this.status() === 'connected';
  }

  ngOnDestroy(): void {
    this.serial?.removeEventListener('disconnect', this.onDeviceDisconnect);
    this.serial?.removeEventListener('connect', this.onDeviceConnect);
  }

  /* ------------------------------ internals ------------------------------ */

  private async openPort(port: SerialPortLike, options: ConnectOptions): Promise<boolean> {
    try {
      await port.open({
        baudRate: TURING_BAUD_RATE,
        flowControl: options.flowControl ? 'hardware' : 'none',
        bufferSize: 65536
      });
      if (!port.writable || !port.readable) throw new Error('The port has no readable/writable stream.');
      this.port = port;
      this.writer = port.writable.getWriter();
      this.reader = port.readable.getReader();
      this.framesSent.set(0);
      this.bytesSent.set(0);
      this.bytesCounter = 0;
      this.lastSend.set(null);
      this.lastOptions = options;

      await this.enqueue(async () => {
        await this.write(cmdHello());
        const reply = await this.readBytes(6, options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS);
        this.model.set(isUsbMonitorHelloReply(reply) ? 'UsbMonitor 3.5' : 'Turing 3.5');
        await this.write(cmdScreenOn());
        await this.write(cmdOrientation(Orientation.Landscape));
        await sleep(150);
        await this.write(cmdBrightness(options.brightness));
      });
      this.bytesSent.set(this.bytesCounter);

      this.autoReconnect = true;
      this.status.set('connected');
      this.message.set('');
      return true;
    } catch (e) {
      await this.teardown('');
      this.status.set('error');
      this.message.set(this.describeError(e));
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
        this.message.set('The display is not accepting data. Try turning off flow control and reconnect.');
      }, STALL_WARNING_MS);
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      const hardTimeout = new Promise<never>((_, reject) => {
        hardTimer = setTimeout(() => reject(new Error('The display stopped responding.')), this.writeTimeoutMs);
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

  private async teardown(message: string): Promise<void> {
    const { port, reader, writer } = this;
    this.port = this.writer = this.reader = null;
    this.queue = Promise.resolve();
    try { await reader?.cancel(); } catch { /* already closed */ }
    try { reader?.releaseLock(); } catch { /* ignore */ }
    try { writer?.releaseLock(); } catch { /* ignore */ }
    try { await port?.close(); } catch { /* already closed */ }
    this.model.set('');
    this.status.set(this.isSupported() ? 'disconnected' : 'unsupported');
    this.message.set(message);
  }

  private describeError(e: unknown): string {
    const text = e instanceof Error ? e.message : String(e);
    if (/failed to open|access denied|busy|in use/i.test(text)) {
      return 'Could not open the port. Is the TURZX software (or another tab) using the display? Close it and try again.';
    }
    return text;
  }
}
