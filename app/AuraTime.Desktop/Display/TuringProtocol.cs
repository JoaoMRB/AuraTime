namespace AuraTime.Desktop.Display;

/// <summary>Inclusive rectangle on the display.</summary>
public readonly record struct Rect(int X0, int Y0, int X1, int Y1)
{
    public int Width => X1 - X0 + 1;
    public int Height => Y1 - Y0 + 1;
}

/// <summary>
/// Turing / UsbMonitor 3.5" "rev. A" serial protocol (USB 1A86:5722, 480x320).
/// Pure functions, ported from the web app (src/app/services/screen/turing-protocol.ts): keep the two in step.
/// </summary>
public static class TuringProtocol
{
    public const int UsbVendorId = 0x1A86;
    public const int UsbProductId = 0x5722;
    public const int BaudRate = 115200;
    public const int ScreenWidth = 480;
    public const int ScreenHeight = 320;

    /// <summary>Bytes per serial write (native portrait width x 8), as used by the reference library.</summary>
    public const int WriteChunkBytes = 320 * 8;

    /// <summary>Tallest rectangle sent as one bitmap: a lost byte then spoils one band at most.</summary>
    public const int MaxBandRows = 40;

    private const byte CmdHello = 69;
    private const byte CmdReset = 101;
    private const byte CmdScreenOn = 109;
    private const byte CmdSetBrightness = 110;
    private const byte CmdSetOrientation = 121;
    private const byte CmdDisplayBitmap = 197;

    private const int OrientationLandscape = 2;

    /// <summary>Packs a command and up to two corner coordinates into the display's 6-byte header.</summary>
    public static byte[] PackCommand(byte cmd, int x, int y, int ex, int ey) =>
    [
        (byte)((x >> 2) & 255),
        (byte)((((x & 3) << 6) + (y >> 4)) & 255),
        (byte)((((y & 15) << 4) + (ex >> 6)) & 255),
        (byte)((((ex & 63) << 2) + (ey >> 8)) & 255),
        (byte)(ey & 255),
        cmd
    ];

    public static byte[] Hello() => [CmdHello, CmdHello, CmdHello, CmdHello, CmdHello, CmdHello];

    /// <summary>Reboots the display: it drops off the USB bus and comes back after a few seconds.</summary>
    public static byte[] Reset() => PackCommand(CmdReset, 0, 0, 0, 0);

    public static byte[] ScreenOn() => PackCommand(CmdScreenOn, 0, 0, 0, 0);

    /// <param name="level">Backlight 0..100 (%). The display takes an inverted 0..255 value.</param>
    public static byte[] Brightness(int level)
    {
        int clamped = Math.Clamp(level, 0, 100);
        return PackCommand(CmdSetBrightness, (int)Math.Round(255 - clamped / 100.0 * 255), 0, 0, 0);
    }

    public static byte[] LandscapeOrientation()
    {
        var buf = new byte[16];
        PackCommand(CmdSetOrientation, 0, 0, 0, 0).CopyTo(buf, 0);
        buf[6] = OrientationLandscape + 100;
        buf[7] = ScreenWidth >> 8;
        buf[8] = ScreenWidth & 255;
        buf[9] = ScreenHeight >> 8;
        buf[10] = ScreenHeight & 255;
        return buf;
    }

    /// <summary>Header that announces a bitmap for the given rectangle; pixel bytes follow.</summary>
    public static byte[] DisplayBitmap(Rect rect) => PackCommand(CmdDisplayBitmap, rect.X0, rect.Y0, rect.X1, rect.Y1);

    /// <summary>True when a HELLO reply identifies a UsbMonitor 3.5" (6 bytes starting with 1).</summary>
    public static bool IsUsbMonitorHelloReply(ReadOnlySpan<byte> reply) => reply.Length == 6 && reply[0] == 1;

    /// <summary>Converts RGBA8888 pixels to RGB565.</summary>
    public static void RgbaToRgb565(ReadOnlySpan<byte> rgba, Span<ushort> output)
    {
        for (int i = 0, p = 0; p < output.Length; i += 4, p++)
        {
            output[p] = (ushort)(((rgba[i] & 0xF8) << 8) | ((rgba[i + 1] & 0xFC) << 3) | (rgba[i + 2] >> 3));
        }
    }

    /// <summary>
    /// Smallest rectangle containing every pixel that differs between two frames. The full frame when there is no
    /// previous frame, null when nothing changed.
    /// </summary>
    public static Rect? DiffRect(ushort[]? previous, ushort[] current, int width, int height)
    {
        if (previous is null || previous.Length != current.Length) return new Rect(0, 0, width - 1, height - 1);
        int x0 = width, y0 = height, x1 = -1, y1 = -1;
        for (int y = 0; y < height; y++)
        {
            int row = y * width;
            for (int x = 0; x < width; x++)
            {
                if (current[row + x] == previous[row + x]) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        return x1 < 0 ? null : new Rect(x0, y0, x1, y1);
    }

    /// <summary>The pixels of one band of <paramref name="rect"/>, as the little-endian bytes rev. A expects.</summary>
    public static byte[] BandBytes(ushort[] frame, int frameWidth, Rect band)
    {
        var bytes = new byte[band.Width * band.Height * 2];
        int k = 0;
        for (int y = band.Y0; y <= band.Y1; y++)
        {
            int start = y * frameWidth + band.X0;
            for (int x = 0; x < band.Width; x++)
            {
                ushort v = frame[start + x];
                bytes[k++] = (byte)(v & 255);
                bytes[k++] = (byte)(v >> 8);
            }
        }
        return bytes;
    }

    /// <summary>Splits a rectangle into horizontal bands of at most <paramref name="maxRows"/> rows.</summary>
    public static IEnumerable<Rect> SplitBands(Rect rect, int maxRows = MaxBandRows)
    {
        for (int y = rect.Y0; y <= rect.Y1; y += maxRows)
        {
            yield return new Rect(rect.X0, y, rect.X1, Math.Min(rect.Y1, y + maxRows - 1));
        }
    }
}
