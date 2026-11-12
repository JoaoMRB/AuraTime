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
    private readonly ScreenText _text = ScreenText.ForCurrentCulture();
    private volatile bool _settingsChanged;

    public DisplayService(Settings settings)
    {
        _settings = settings;
        ConfigureSources();
        _thread = new Thread(Run) { IsBackground = true, Name = "Display" };
    }

    /// <summary>The PC's sensors. They are only polled while the system view is on.</summary>
    public SystemSensors Sensors { get; } = new();

    /// <summary>The weather. Only fetched while the weather view is on and a city is chosen.</summary>
    public WeatherService Weather { get; } = new();

    /// <summary>Language of the texts drawn on the screen.</summary>
    public string Language => _text.Language;

    public DisplayStatus Status { get; private set; } = DisplayStatus.NotFound;
    /// <summary>Detail for the status: the model and port when connected, the error text otherwise.</summary>
    public string Detail { get; private set; } = "";

    /// <summary>Raised on the display thread whenever <see cref="Status"/> changes.</summary>
    public event Action? StatusChanged;

    public void Start() => _thread.Start();

    /// <summary>Call after changing the settings: the next frame uses them.</summary>
    public void ApplySettings()
    {
        ConfigureSources();
        _settingsChanged = true;
    }

    public void Dispose()
    {
        _stop.Cancel();
        if (_thread.IsAlive) _thread.Join(3000);
        Sensors.Dispose();
        Weather.Dispose();
        _stop.Dispose();
    }

    /// <summary>What to draw now: the view whose turn it is, its options and its data.</summary>
    public (ScreenView View, RenderOptions Options, ScreenData Data) Frame(DateTime now)
    {
        Settings s = _settings;
        var data = new ScreenData(
            Sensors.Latest,
            Weather.Latest,
            s.Views.Contains("world") ? WorldClocks.Rows(s.WorldClocks, now, s.Use24h) : []);
        var options = new RenderOptions(Themes.Resolve(s.Theme), ClockFonts.Resolve(s.Font), s.Use24h, CultureInfo.CurrentCulture, _text);
        return (ViewFor(s, now, data), options, data);
    }

    /// <summary>
    /// The views take turns, each for <see cref="Settings.ViewSeconds"/>. A view with nothing to show yet (no
    /// weather reading, no world clock) is skipped.
    /// </summary>
    public static ScreenView ViewFor(Settings settings, DateTime now, ScreenData data)
    {
        var ready = new List<ScreenView>();
        foreach (string id in settings.Views)
        {
            switch (id)
            {
                case "clock": ready.Add(ScreenView.Clock); break;
                case "system": ready.Add(ScreenView.System); break;
                case "weather" when data.Weather is not null: ready.Add(ScreenView.Weather); break;
                case "world" when data.WorldClocks.Count > 0: ready.Add(ScreenView.World); break;
            }
        }
        if (ready.Count == 0) return ScreenView.Clock;
        long slot = (long)(now - DateTime.UnixEpoch).TotalSeconds / Math.Max(1, settings.ViewSeconds);
        return ready[(int)(slot % ready.Count)];
    }

    private void ConfigureSources()
    {
        Sensors.SetEnabled(_settings.Views.Contains("system"));
        Weather.Configure(_settings.Views.Contains("weather"), _settings.WeatherCity);
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

            DateTime now = DateTime.Now;
            (ScreenView view, RenderOptions options, ScreenData data) = Frame(now);
            renderer.Draw(now, options, view, data);
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

    private void SetStatus(DisplayStatus status, string detail)
    {
        if (Status == status && Detail == detail) return;
        Status = status;
        Detail = detail;
        StatusChanged?.Invoke();
    }
}
