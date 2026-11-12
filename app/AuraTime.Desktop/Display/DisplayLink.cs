using System.IO.Ports;
using Microsoft.Win32;

namespace AuraTime.Desktop.Display;

/// <summary>
/// The serial link to the display, on the operating system's own serial port. Same command sequence as the
/// web app's Web Serial link: RESET, wait for the display to come back, HELLO, screen on, orientation, brightness.
/// </summary>
public sealed class DisplayLink : IDisposable
{
    private const int WriteTimeoutMs = 4000;
    private const int HelloTimeoutMs = 1000;
    /// <summary>The display drops off the USB bus after a RESET and Windows enumerates it again.</summary>
    private const int ResetWaitMs = 5000;
    private const int ResetGiveUpMs = 15000;

    private SerialPort? _port;

    public string Model { get; private set; } = "";
    public string PortName { get; private set; } = "";

    /// <summary>The display's COM port, or null when it is not plugged in.</summary>
    public static string? FindPortName()
    {
        // The port name Windows gave the device is stored under its USB enumeration key; it only counts when
        // that port is present right now.
        string enumKey = $@"SYSTEM\CurrentControlSet\Enum\USB\VID_{TuringProtocol.UsbVendorId:X4}&PID_{TuringProtocol.UsbProductId:X4}";
        using RegistryKey? device = Registry.LocalMachine.OpenSubKey(enumKey);
        if (device is null) return null;
        string[] present = SerialPort.GetPortNames();
        foreach (string instance in device.GetSubKeyNames())
        {
            using RegistryKey? parameters = device.OpenSubKey($@"{instance}\Device Parameters");
            if (parameters?.GetValue("PortName") is string name && present.Contains(name, StringComparer.OrdinalIgnoreCase))
            {
                return name;
            }
        }
        return null;
    }

    /// <summary>Resets and initialises the display. Throws when it cannot (not plugged in, port in use...).</summary>
    public void Connect(int brightness, bool flowControl, CancellationToken cancel)
    {
        string name = FindPortName() ?? throw new IOException("The display is not plugged in.");

        using (SerialPort reset = Open(name, flowControl))
        {
            Write(reset, TuringProtocol.Reset());
        }
        cancel.WaitHandle.WaitOne(ResetWaitMs);
        name = WaitForDisplay(cancel);
        cancel.WaitHandle.WaitOne(500); // let it finish booting before the first command
        cancel.ThrowIfCancellationRequested();

        _port = Open(name, flowControl);
        PortName = name;
        try
        {
            Write(TuringProtocol.Hello());
            // The original Turing 3.5" never answers HELLO: silence is not an error.
            Model = TuringProtocol.IsUsbMonitorHelloReply(ReadReply(6)) ? "UsbMonitor 3.5" : "Turing 3.5";
            Write(TuringProtocol.ScreenOn());
            Write(TuringProtocol.LandscapeOrientation());
            Thread.Sleep(150);
            Write(TuringProtocol.Brightness(brightness));
        }
        catch
        {
            Close();
            throw;
        }
    }

    /// <summary>Sends the pixels of <paramref name="rect"/> out of a full frame, in bands.</summary>
    public void SendBitmap(ushort[] frame, Rect rect)
    {
        foreach (Rect band in TuringProtocol.SplitBands(rect))
        {
            Write(TuringProtocol.DisplayBitmap(band));
            Write(TuringProtocol.BandBytes(frame, TuringProtocol.ScreenWidth, band));
        }
    }

    public void SetBrightness(int level) => Write(TuringProtocol.Brightness(level));

    public void Close()
    {
        SerialPort? port = _port;
        _port = null;
        Model = "";
        PortName = "";
        try
        {
            port?.Dispose();
        }
        catch (IOException)
        {
            // The device was unplugged: the handle is already gone.
        }
    }

    public void Dispose() => Close();

    private static SerialPort Open(string name, bool flowControl)
    {
        var port = new SerialPort(name, TuringProtocol.BaudRate)
        {
            Handshake = flowControl ? Handshake.RequestToSend : Handshake.None,
            WriteTimeout = WriteTimeoutMs,
            ReadTimeout = HelloTimeoutMs,
            WriteBufferSize = 65536
        };
        port.Open();
        return port;
    }

    private static string WaitForDisplay(CancellationToken cancel)
    {
        long deadline = Environment.TickCount64 + ResetGiveUpMs;
        while (true)
        {
            cancel.ThrowIfCancellationRequested();
            if (FindPortName() is { } name) return name;
            if (Environment.TickCount64 >= deadline) throw new IOException("The display did not come back after the reset.");
            Thread.Sleep(250);
        }
    }

    private void Write(byte[] bytes) => Write(_port ?? throw new IOException("Not connected."), bytes);

    /// <summary>Chunked write. The port's write timeout turns a display that stopped accepting data into an error.</summary>
    private static void Write(SerialPort port, byte[] bytes)
    {
        for (int i = 0; i < bytes.Length; i += TuringProtocol.WriteChunkBytes)
        {
            port.Write(bytes, i, Math.Min(TuringProtocol.WriteChunkBytes, bytes.Length - i));
        }
    }

    private byte[] ReadReply(int count)
    {
        var buffer = new byte[count];
        int read = 0;
        try
        {
            while (read < count) read += _port!.Read(buffer, read, count - read);
        }
        catch (TimeoutException)
        {
        }
        return buffer[..read];
    }
}
