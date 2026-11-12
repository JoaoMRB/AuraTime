import { SerialPort } from 'serialport';
import {
  Orientation, Rect, TURING_BAUD_RATE, TURING_USB_PRODUCT_ID, TURING_USB_VENDOR_ID, WRITE_CHUNK_BYTES,
  cmdBrightness, cmdDisplayBitmap, cmdHello, cmdOrientation, cmdReset, cmdScreenOn, isUsbMonitorHelloReply,
  rgb565ToBytes, splitBands
} from '../../src/app/services/screen/turing-protocol';

const WRITE_TIMEOUT_MS = 4000;
const HELLO_TIMEOUT_MS = 1000;
/** The display drops off the USB bus after a RESET and Windows enumerates it again. */
const RESET_WAIT_MS = 5000;
const RESET_GIVE_UP_MS = 15000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const hex = (id: number) => id.toString(16).padStart(4, '0');

export interface LinkOptions {
  brightness: number;
  flowControl: boolean;
  /** Skip the RESET at connect time (faster start, but a half-sent bitmap from a previous run is not cleared). */
  skipReset?: boolean;
}

/** Path of the display's serial port (e.g. "COM3"), or null when it is not plugged in. */
export async function findDisplayPath(): Promise<string | null> {
  const ports = await SerialPort.list();
  const found = ports.find(
    p => p.vendorId?.toLowerCase() === hex(TURING_USB_VENDOR_ID) && p.productId?.toLowerCase() === hex(TURING_USB_PRODUCT_ID)
  );
  return found?.path ?? null;
}

/**
 * The serial link to the display, on the operating system's own serial port: no browser, no permission prompt,
 * no timer throttling. Same command sequence as the Web Serial link of the web app.
 */
export class DisplayLink {
  private port: SerialPort | null = null;
  model = '';

  get connected(): boolean {
    return this.port?.isOpen === true;
  }

  /** Resets the display, waits for it to come back, and initialises it. Throws when it cannot. */
  async connect(options: LinkOptions): Promise<void> {
    let path = await findDisplayPath();
    if (!path) throw new Error('The display is not plugged in.');

    if (!options.skipReset) {
      const port = await this.open(path, options);
      try {
        await this.writeTo(port, cmdReset());
      } finally {
        await this.closePort(port);
      }
      await sleep(RESET_WAIT_MS);
      path = await this.waitForDisplay();
      await sleep(500); // let it finish booting before the first command
    }

    const port = await this.open(path, options);
    this.port = port;
    try {
      await this.write(cmdHello());
      const reply = await this.read(6, HELLO_TIMEOUT_MS);
      this.model = isUsbMonitorHelloReply(reply) ? 'UsbMonitor 3.5' : 'Turing 3.5';
      await this.write(cmdScreenOn());
      await this.write(cmdOrientation(Orientation.Landscape));
      await sleep(150);
      await this.write(cmdBrightness(options.brightness));
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  /** Sends a rectangle of RGB565 pixels, in bands: a lost byte then spoils one band at most. */
  async sendBitmap(rect: Rect, pixels: Uint16Array): Promise<number> {
    const width = rect.x1 - rect.x0 + 1;
    let bytes = 0;
    for (const band of splitBands(rect)) {
      const rows = band.rect.y1 - band.rect.y0 + 1;
      const header = cmdDisplayBitmap(band.rect);
      const body = rgb565ToBytes(pixels.subarray(band.offset, band.offset + rows * width));
      await this.write(header);
      await this.write(body);
      bytes += header.length + body.length;
    }
    return bytes;
  }

  async setBrightness(level: number): Promise<void> {
    await this.write(cmdBrightness(level));
  }

  async close(): Promise<void> {
    const port = this.port;
    this.port = null;
    this.model = '';
    if (port) await this.closePort(port);
  }

  /* ------------------------------ internals ------------------------------ */

  private open(path: string, options: LinkOptions): Promise<SerialPort> {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path, baudRate: TURING_BAUD_RATE, rtscts: options.flowControl, autoOpen: false });
      port.open(error => (error ? reject(error) : resolve(port)));
    });
  }

  private closePort(port: SerialPort): Promise<void> {
    return new Promise(resolve => {
      if (!port.isOpen) return resolve();
      port.close(error => {
        if (error) console.warn('[display] could not close the port:', error.message);
        resolve();
      });
    });
  }

  private async waitForDisplay(): Promise<string> {
    const deadline = Date.now() + RESET_GIVE_UP_MS;
    for (;;) {
      const path = await findDisplayPath();
      if (path) return path;
      if (Date.now() >= deadline) throw new Error('The display did not come back after the reset.');
      await sleep(250);
    }
  }

  private write(bytes: Uint8Array): Promise<void> {
    if (!this.port) return Promise.reject(new Error('Not connected.'));
    return this.writeTo(this.port, bytes);
  }

  /** Chunked write with a hard timeout: with flow control on, a display that stops accepting data blocks forever. */
  private async writeTo(port: SerialPort, bytes: Uint8Array): Promise<void> {
    for (let i = 0; i < bytes.length; i += WRITE_CHUNK_BYTES) {
      const part = bytes.subarray(i, i + WRITE_CHUNK_BYTES);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The display stopped responding.')), WRITE_TIMEOUT_MS);
        const done = (error?: Error | null) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        port.write(part, error => (error ? done(error) : port.drain(done)));
      });
    }
  }

  /** Reads up to n bytes, giving up after `ms` (the original Turing 3.5" never answers HELLO). */
  private async read(n: number, ms: number): Promise<Uint8Array> {
    const port = this.port;
    if (!port) return new Uint8Array();
    const out: number[] = [];
    const deadline = Date.now() + ms;
    while (out.length < n && Date.now() < deadline) {
      const chunk = port.read(n - out.length) as Buffer | null;
      if (chunk) out.push(...chunk);
      else await sleep(20);
    }
    return new Uint8Array(out);
  }
}
