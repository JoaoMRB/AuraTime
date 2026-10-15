import {
  Orientation, cmdBrightness, cmdDisplayBitmap, cmdHello, cmdOrientation, cmdScreenOn,
  diffRect, extractRect, isUsbMonitorHelloReply, packCommand, rgb565ToBytes, rgbaToRgb565
} from './turing-protocol';

const arr = (u: Uint8Array) => Array.from(u);
/** Reads back the 10-bit `x` field of a packed command header. */
const fieldX = (u: Uint8Array) => (u[0] << 2) | (u[1] >> 6);

describe('turing-protocol (rev. A)', () => {
  it('packs a full-screen bitmap header', () => {
    // 479 = 0b111011111, 319 = 0b100111111
    expect(arr(cmdDisplayBitmap({ x0: 0, y0: 0, x1: 479, y1: 319 }))).toEqual([0, 0, 7, 125, 63, 197]);
  });

  it('packs coordinates across byte boundaries', () => {
    expect(arr(packCommand(197, 100, 200, 300, 250))).toEqual([25, 12, 132, 176, 250, 197]);
  });

  it('builds the simple commands', () => {
    expect(arr(cmdScreenOn())).toEqual([0, 0, 0, 0, 0, 109]);
    expect(arr(cmdHello())).toEqual([69, 69, 69, 69, 69, 69]);
  });

  it('inverts and clamps brightness', () => {
    expect(fieldX(cmdBrightness(60))).toBe(102); // 255 - 153
    expect(fieldX(cmdBrightness(100))).toBe(0);
    expect(fieldX(cmdBrightness(0))).toBe(255);
    expect(fieldX(cmdBrightness(250))).toBe(0);
    expect(cmdBrightness(60)[5]).toBe(110);
  });

  it('builds the landscape orientation command (16 bytes, 480x320)', () => {
    expect(arr(cmdOrientation(Orientation.Landscape))).toEqual([
      0, 0, 0, 0, 0, 121, 102, 1, 224, 1, 64, 0, 0, 0, 0, 0
    ]);
  });

  it('builds the portrait orientation command (320x480)', () => {
    const c = cmdOrientation(Orientation.Portrait);
    expect(c[6]).toBe(100);
    expect([c[7], c[8], c[9], c[10]]).toEqual([1, 64, 1, 224]);
  });

  it('recognises a UsbMonitor HELLO reply', () => {
    expect(isUsbMonitorHelloReply(new Uint8Array([1, 1, 1, 1, 1, 1]))).toBeTrue();
    expect(isUsbMonitorHelloReply(new Uint8Array([0, 0, 0, 0, 0, 0]))).toBeFalse();
    expect(isUsbMonitorHelloReply(new Uint8Array(0))).toBeFalse();
  });

  it('converts RGBA to RGB565 and to little-endian bytes', () => {
    const px = rgbaToRgb565(new Uint8ClampedArray([
      255, 0, 0, 255, // red
      0, 255, 0, 255, // green
      0, 0, 255, 255, // blue
      255, 255, 255, 255 // white
    ]));
    expect(Array.from(px)).toEqual([0xf800, 0x07e0, 0x001f, 0xffff]);
    expect(arr(rgb565ToBytes(px.subarray(0, 1)))).toEqual([0x00, 0xf8]);
    expect(arr(rgb565ToBytes(px.subarray(1, 2)))).toEqual([0xe0, 0x07]);
  });

  describe('diffRect / extractRect', () => {
    const W = 8;
    const H = 6;
    const blank = () => new Uint16Array(W * H);

    it('returns the full frame when there is no previous frame', () => {
      expect(diffRect(null, blank(), W, H)).toEqual({ x0: 0, y0: 0, x1: 7, y1: 5 });
    });

    it('returns null when nothing changed', () => {
      expect(diffRect(blank(), blank(), W, H)).toBeNull();
    });

    it('returns the bounding box of the changed pixels', () => {
      const cur = blank();
      cur[1 * W + 2] = 5;
      cur[4 * W + 6] = 9;
      expect(diffRect(blank(), cur, W, H)).toEqual({ x0: 2, y0: 1, x1: 6, y1: 4 });
    });

    it('extracts a rectangle row by row', () => {
      const frame = blank();
      for (let i = 0; i < frame.length; i++) frame[i] = i;
      const out = extractRect(frame, W, { x0: 2, y0: 1, x1: 3, y1: 2 });
      expect(Array.from(out)).toEqual([10, 11, 18, 19]);
    });
  });
});
