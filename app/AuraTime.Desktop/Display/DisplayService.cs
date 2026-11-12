using System.Globalization;
using AuraTime.Desktop.Render;

namespace AuraTime.Desktop.Display;

public enum DisplayStatus
{
    /// <summary>The display is not plugged in.</summary>
    NotFound,
    Connecting,
    Connected,
    /// <summary>Another program has the display's port open.</summary>
    Busy,
    Error
}

/// <summary>
/// Background loop that owns the display: finds it, connects, draws one frame per second and sends only the
/// pixels that changed, and reconnects by itself after any failure.
/// </summary>
public sealed class DisplayService : IDisposable
{
    private const int RetryMs = 5000;

    private readonly Settings _settings;
    private readonly CancellationTokenSource _stop = new();
    private readonly Thread _thread;
    private volatile bool _settingsChanged;

    public DisplayService(Settings settings)
    {
        _settings = settings;
        _thread = new Thread(Run) { IsBackground = true, Name = "Display" };
    }

    public DisplayStatus Status { get; private set; } = DisplayStatus.NotFound;
    /// <summary>Detail for the status: the model and port when connected, the error text otherwise.</summary>
    public string Detail { get; private set; } = "";

    /// <summary>Raised on the display thread whenever <see cref="Status"/> changes.</summary>
    public event Action? StatusChanged;

    public void Start() => _thread.Start();

    /// <summary>Call after changing the settings: the next frame uses them.</summary>
    public void ApplySettings() => _settingsChanged = true;

    public void Dispose()
    {
        _stop.Cancel();
        if (_thread.IsAlive) _thread.Join(3000);
        _stop.Dispose();
    }

    private void Run()
    {
        CancellationToken cancel = _stop.Token;
        using var renderer = new ScreenRenderer();
        using var link = new DisplayLink();

        while (!cancel.IsCancellationRequested)
        {
            if (DisplayLink.FindPortName() is null)
            {
                SetStatus(DisplayStatus.NotFound, "");
            }
            else
            {
                try
                {
                    SetStatus(DisplayStatus.Connecting, "");
                    link.Connect(_settings.Brightness, _settings.FlowControl, cancel);
                    SetStatus(DisplayStatus.Connected, $"{link.Model} ({link.PortName})");
                    SendLoop(renderer, link, cancel);
                }
                catch (OperationCanceledException)
                {
                }
                catch (UnauthorizedAccessException e)
                {
                    SetStatus(DisplayStatus.Busy, e.Message);
                }
                catch (Exception e) when (e is IOException or TimeoutException or InvalidOperationException)
                {
                    SetStatus(DisplayStatus.Error, e.Message);
                }
                link.Close();
            }
            cancel.WaitHandle.WaitOne(RetryMs);
        }
    }

    /// <summary>One frame per second, aligned to the clock.</summary>
    private void SendLoop(ScreenRenderer renderer, DisplayLink link, CancellationToken cancel)
    {
        const int pixels = TuringProtocol.ScreenWidth * TuringProtocol.ScreenHeight;
        var current = new ushort[pixels];
        ushort[]? previous = null;
        int brightness = _settings.Brightness;

        while (!cancel.IsCancellationRequested)
        {
            if (_settingsChanged)
            {
                _settingsChanged = false;
                if (brightness != _settings.Brightness)
                {
                    brightness = _settings.Brightness;
                    link.SetBrightness(brightness);
                }
            }

            renderer.Draw(DateTime.Now, OptionsFrom(_settings));
            renderer.CopyRgb565(current);
            if (TuringProtocol.DiffRect(previous, current, TuringProtocol.ScreenWidth, TuringProtocol.ScreenHeight) is { } rect)
            {
                link.SendBitmap(current, rect);
            }
            previous ??= new ushort[pixels];
            current.CopyTo(previous, 0);

            cancel.WaitHandle.WaitOne(1000 - DateTime.Now.Millisecond);
        }
    }

    public static RenderOptions OptionsFrom(Settings settings) =>
        new(Themes.Resolve(settings.Theme), ClockFonts.Resolve(settings.Font), settings.Use24h, CultureInfo.CurrentCulture);

    private void SetStatus(DisplayStatus status, string detail)
    {
        if (Status == status && Detail == detail) return;
        Status = status;
        Detail = detail;
        StatusChanged?.Invoke();
    }
}
