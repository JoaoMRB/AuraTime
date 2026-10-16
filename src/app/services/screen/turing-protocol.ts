/**
 * Turing / UsbMonitor 3.5" "rev. A" serial protocol (USB 1A86:5722, 480x320).
 *
 * Pure functions only (no I/O) so the byte layout can be unit-tested without hardware.
 * Ported from the working prototype; the rev. B (XuanFang) variant is intentionally not
 * included: the target display is rev. A.
 */

export const TURING_USB_VENDOR_ID = 0x1a86;
export const TURING_USB_PRODUCT_ID = 0x5722;
export const TURING_BAUD_RATE = 115200;

export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 320;

/** Bytes per serial write (native portrait width x 8), as used by the reference library and the prototype. */
export const WRITE_CHUNK_BYTES = 320 * 8;

const CMD = {
  HELLO: 69,
  SCREEN_ON: 109,
  SET_BRIGHTNESS: 110,
  SET_ORIENTATION: 121,
  RESET: 101,
  DISPLAY_BITMAP: 197
} as const;

/** Orientation codes accepted by the display (>= 2 is landscape). */
export enum Orientation {
  Portrait = 0,
  Landscape = 2
}

export interface Rect {
  x0: number;
  y0: number;
  /** Inclusive. */
  x1: number;
  /** Inclusive. */
  y1: number;
}

/** Packs a command and up to two corner coordinates into the display's 6-byte header. */
export function packCommand(cmd: number, x: number, y: number, ex: number, ey: number): Uint8Array {
  return new Uint8Array([
    (x >> 2) & 255,
    (((x & 3) << 6) + (y >> 4)) & 255,
    (((y & 15) << 4) + (ex >> 6)) & 255,
    (((ex & 63) << 2) + (ey >> 8)) & 255,
    ey & 255,
    cmd
  ]);
}

export function cmdHello(): Uint8Array {
  return new Uint8Array(6).fill(CMD.HELLO);
}

/** Reboots the display: it drops off the USB bus and comes back after a few seconds (clears any half-sent bitmap). */
export function cmdReset(): Uint8Array {
  return packCommand(CMD.RESET, 0, 0, 0, 0);
}

export function cmdScreenOn(): Uint8Array {
  return packCommand(CMD.SCREEN_ON, 0, 0, 0, 0);
}

/** @param level backlight 0..100 (%). The display takes an inverted 0..255 value. */
export function cmdBrightness(level: number): Uint8Array {
  const clamped = Math.min(100, Math.max(0, level));
  return packCommand(CMD.SET_BRIGHTNESS, Math.round(255 - (clamped / 100) * 255), 0, 0, 0);
}

export function cmdOrientation(orientation: Orientation): Uint8Array {
  const landscape = orientation >= 2;
  const w = landscape ? SCREEN_WIDTH : SCREEN_HEIGHT;
  const h = landscape ? SCREEN_HEIGHT : SCREEN_WIDTH;
  const buf = new Uint8Array(16);
  buf.set(packCommand(CMD.SET_ORIENTATION, 0, 0, 0, 0));
  buf[6] = orientation + 100;
  buf[7] = w >> 8;
  buf[8] = w & 255;
  buf[9] = h >> 8;
  buf[10] = h & 255;
  return buf;
}

/** Header that announces a bitmap for the given (inclusive) rectangle; pixel bytes follow. */
export function cmdDisplayBitmap(rect: Rect): Uint8Array {
  return packCommand(CMD.DISPLAY_BITMAP, rect.x0, rect.y0, rect.x1, rect.y1);
}

/** True when a HELLO reply identifies a UsbMonitor 3.5" (6 bytes starting with 1). */
export function isUsbMonitorHelloReply(reply: Uint8Array): boolean {
  return reply.length === 6 && reply[0] === 1;
}

/** Converts canvas RGBA pixels to RGB565. */
export function rgbaToRgb565(rgba: Uint8ClampedArray | Uint8Array): Uint16Array {
  const out = new Uint16Array(rgba.length >> 2);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = ((rgba[i] & 0xf8) << 8) | ((rgba[i + 1] & 0xfc) << 3) | (rgba[i + 2] >> 3);
  }
  return out;
}

/** Rev. A expects each RGB565 pixel as little-endian bytes. */
export function rgb565ToBytes(pixels: Uint16Array): Uint8Array {
  const bytes = new Uint8Array(pixels.length * 2);
  for (let i = 0, k = 0; i < pixels.length; i++) {
    const v = pixels[i];
    bytes[k++] = v & 255;
    bytes[k++] = v >> 8;
  }
  return bytes;
}

/**
 * Smallest rectangle containing every pixel that differs between two frames.
 * Returns the full frame when there is no previous frame (or sizes differ) and
 * `null` when nothing changed.
 */
export function diffRect(prev: Uint16Array | null, cur: Uint16Array, width: number, height: number): Rect | null {
  if (!prev || prev.length !== cur.length) {
    return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  }
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (cur[row + x] !== prev[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Copies the pixels of `rect` out of a full frame into a tightly packed array. */
export function extractRect(frame: Uint16Array, width: number, rect: Rect): Uint16Array {
  const rw = rect.x1 - rect.x0 + 1;
  const rh = rect.y1 - rect.y0 + 1;
  const out = new Uint16Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    const start = (rect.y0 + y) * width + rect.x0;
    out.set(frame.subarray(start, start + rw), y * rw);
  }
  return out;
}

/** Tallest rectangle sent as one DISPLAY_BITMAP: a lost byte then spoils one band at most. */
export const MAX_BAND_ROWS = 40;

/** One horizontal band of a larger rectangle: its own rect, and where its pixels start in the parent's pixels. */
export interface Band {
  rect: Rect;
  /** Index (in pixels, not bytes) of the band's first pixel inside the parent rectangle's pixel array. */
  offset: number;
}

/** Splits a rectangle into horizontal bands of at most `maxRows` rows (one band when it is short enough). */
export function splitBands(rect: Rect, maxRows = MAX_BAND_ROWS): Band[] {
  const width = rect.x1 - rect.x0 + 1;
  const bands: Band[] = [];
  for (let y = rect.y0; y <= rect.y1; y += maxRows) {
    const y1 = Math.min(rect.y1, y + maxRows - 1);
    bands.push({ rect: { x0: rect.x0, y0: y, x1: rect.x1, y1 }, offset: (y - rect.y0) * width });
  }
  return bands;
}
