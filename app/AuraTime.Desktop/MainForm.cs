using System.Runtime.InteropServices;
using System.Text.Json;
using AuraTime.Desktop.Display;
using AuraTime.Desktop.Render;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using SkiaSharp;

namespace AuraTime.Desktop;

/// <summary>
/// The app's window: a page (Ui/index.html) shown in WebView2. The page only displays; this class owns the
/// settings, checks every value the page sends, and pushes the live preview, the link status and the settings
/// back. The WebView2 browser processes exist only while the window is open.
/// </summary>
public sealed class MainForm : Form
{
    private const string Host = "app.auratime";
    private static readonly string Origin = $"https://{Host}/";
    private static readonly Color Back = Color.FromArgb(10, 10, 10);
    private static readonly int[] SecondsChoices = [10, 15, 20, 30, 60];

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static readonly (string Id, string Name, string Short, string Description)[] Views =
    [
        ("clock", "Clock", "Clock", "Time and date."),
        ("system", "System", "System", "CPU and GPU temperature and load, memory in use."),
        ("weather", "Weather and quote", "Weather", "Current weather for your city and the quote of the day."),
        ("world", "World clocks", "World", "The time in up to three other cities.")
    ];

    private readonly Settings _settings;
    private readonly DisplayService _display;
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Back };
    private readonly ScreenRenderer _renderer = new();
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };
    private readonly TaskCompletionSource _firstFrame = new();
    private bool _ready;

    public MainForm(Settings settings, DisplayService display, Icon icon)
    {
        _settings = settings;
        _display = display;

        Text = "AuraTime";
        Icon = icon;
        BackColor = Back;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(1080, 720);
        MinimumSize = new Size(640, 560);
        Controls.Add(_web);

        _display.StatusChanged += OnStatusChanged;
        _timer.Tick += (_, _) => SendFrame();
        _ = InitialiseAsync();
    }

    /// <summary>Completes once the page has drawn its first preview (used by the --window-png check).</summary>
    public Task FirstFrameShown => _firstFrame.Task;

    /// <summary>Scrolls the settings column to its end (layout checks of the lower cards).</summary>
    public Task ScrollSettingsToEndAsync() =>
        _web.CoreWebView2.ExecuteScriptAsync("document.querySelector('.panel').scrollTop = 1e6");

    /// <summary>Saves what the page currently shows as a PNG.</summary>
    public async Task CapturePngAsync(string path)
    {
        await using FileStream file = File.Create(path);
        await _web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, file);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _display.StatusChanged -= OnStatusChanged;
            _timer.Dispose();
            _web.Dispose(); // the browser processes end with the last WebView2 that uses them
            _renderer.Dispose();
        }
        base.Dispose(disposing);
    }

    private async Task InitialiseAsync()
    {
        try
        {
            string dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraTime", "WebView2");
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, dataFolder);
            await _web.EnsureCoreWebView2Async(environment);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowMissingRuntime();
            return;
        }
        if (IsDisposed) return;

        CoreWebView2 core = _web.CoreWebView2;
        CoreWebView2Settings s = core.Settings;
#if !DEBUG
        s.AreDevToolsEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false; // no reload, find, print...
#endif
        s.AreDefaultContextMenusEnabled = false;
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsGeneralAutofillEnabled = false;

        core.SetVirtualHostNameToFolderMapping(Host, Path.Combine(AppContext.BaseDirectory, "Ui"), CoreWebView2HostResourceAccessKind.DenyCors);
        // The page never goes anywhere else, and never opens windows.
        core.NavigationStarting += (_, e) => e.Cancel = !e.Uri.StartsWith(Origin, StringComparison.Ordinal);
        core.NewWindowRequested += (_, e) => e.Handled = true;
        core.WebMessageReceived += OnMessage;
        core.Navigate($"{Origin}index.html");
    }

    /* ------------------------------ page -> app ------------------------------ */

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Origin, StringComparison.Ordinal)) return;
        try
        {
            using JsonDocument document = JsonDocument.Parse(e.WebMessageAsJson);
            JsonElement message = document.RootElement;
            switch (message.GetProperty("type").GetString())
            {
                case "ready":
                    _ready = true;
                    Post(InitMessage());
                    ShowStatus();
                    SendFrame();
                    _timer.Start();
                    break;
                case "set":
                    ApplySetting(message.GetProperty("key").GetString() ?? "", message.GetProperty("value"));
                    break;
                case "autostart":
                    SetAutostart(message.GetProperty("value").GetBoolean());
                    break;
                case "admin":
                    SetAdmin(message.GetProperty("value").GetBoolean());
                    break;
                case "searchCity":
                    _ = SearchCityAsync(message.GetProperty("id").GetInt32(), message.GetProperty("name").GetString() ?? "");
                    break;
            }
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            // A malformed message is ignored; the page gets the real settings back so it cannot drift.
            PostSettings();
        }
    }

    /// <summary>Applies one value from the page, then repairs anything out of range and echoes the result.</summary>
    private void ApplySetting(string key, JsonElement value)
    {
        Settings s = _settings;
        switch (key)
        {
            case "theme": s.Theme = Themes.Resolve(value.GetString()).Id; break;
            case "font": s.Font = ClockFonts.Resolve(value.GetString()).Id; break;
            case "brightness": s.Brightness = value.GetInt32(); break;
            case "use24h": s.Use24h = value.GetBoolean(); break;
            case "viewSeconds": s.ViewSeconds = value.GetInt32(); break;
            case "views": s.Views = Strings(value); break;
            case "worldClocks": s.WorldClocks = Strings(value); break;
            case "weatherCity":
                s.WeatherCity = value.ValueKind == JsonValueKind.Null
                    ? null
                    : new WeatherCity(
                        value.GetProperty("name").GetString() ?? "",
                        value.TryGetProperty("region", out JsonElement region) ? region.GetString() ?? "" : "",
                        Math.Round(value.GetProperty("latitude").GetDouble(), 2),
                        Math.Round(value.GetProperty("longitude").GetDouble(), 2));
                break;
            default:
                return;
        }
        s.Normalise();
        s.Save();
        _display.ApplySettings();
        PostSettings();
        SendFrame();
    }

    private static List<string> Strings(JsonElement array) =>
        array.EnumerateArray().Select(e => e.GetString()).OfType<string>().ToList();

    private void SetAutostart(bool enabled)
    {
        try
        {
            Autostart.Set(enabled, _settings);
        }
        catch (Exception e) when (e is InvalidOperationException or UnauthorizedAccessException or IOException)
        {
            MessageBox.Show(this, $"Could not change the start-up entry: {e.Message}", "AuraTime", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        PostSystem();
    }

    /// <summary>
    /// Turning administrator mode on restarts the app with administrator rights (Windows asks first); if the user
    /// says no, it switches itself off again. Turning it off takes effect the next time the app starts.
    /// </summary>
    private void SetAdmin(bool enabled)
    {
        _settings.RunAsAdmin = enabled;
        _settings.Save();

        if (enabled && !Elevation.IsElevated)
        {
            if (Elevation.Relaunch($"{Program.WaitForArgument} {Environment.ProcessId}"))
            {
                Application.Exit(); // the elevated copy waits for this one to quit, then takes over
                return;
            }
            _settings.RunAsAdmin = false;
            _settings.Save();
        }
        else
        {
            try
            {
                Autostart.Sync(_settings);
            }
            catch (Exception e) when (e is InvalidOperationException or UnauthorizedAccessException or IOException)
            {
                MessageBox.Show(this, $"Could not update the start-up entry: {e.Message}", "AuraTime", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        PostSystem();
    }

    private async Task SearchCityAsync(int id, string name)
    {
        object reply;
        try
        {
            IReadOnlyList<WeatherCity> cities = name.Trim().Length < 2 ? [] : await WeatherService.SearchAsync(name, _display.Language);
            reply = new { type = "cityResults", id, cities };
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
        {
            reply = new { type = "cityResults", id, cities = Array.Empty<WeatherCity>(), error = "Could not search. Check the internet connection." };
        }
        if (!IsDisposed) Post(reply);
    }

    /* ------------------------------ app -> page ------------------------------ */

    private object InitMessage() => new
    {
        type = "init",
        settings = SettingsDto(),
        system = SystemDto(),
        views = Views.Select(v => new { id = v.Id, name = v.Name, @short = v.Short, description = v.Description }),
        secondsChoices = SecondsChoices,
        themes = Themes.All.Select(t => new
        {
            id = t.Id,
            name = t.Name,
            angle = t.AngleDeg,
            stops = t.BackgroundStops.Select(Hex),
            accent = Hex(t.Accent)
        }),
        fonts = ClockFonts.All.Select(f => new
        {
            id = f.Id,
            name = f.Name,
            family = f.Name,
            italic = f.Italic,
            weight = f.Id switch { "orbitron" => 700, "inter" => 300, "outfit" => 500, _ => 400 }
        }),
        worldCities = WorldClocks.Cities,
        worldMax = WorldClocks.Max
    };

    private object SettingsDto() => new
    {
        views = _settings.Views,
        viewSeconds = _settings.ViewSeconds,
        theme = _settings.Theme,
        font = _settings.Font,
        brightness = _settings.Brightness,
        use24h = _settings.Use24h,
        worldClocks = _settings.WorldClocks,
        weatherCity = _settings.WeatherCity
    };

    private object SystemDto() => new
    {
        type = "system",
        autostart = Autostart.IsEnabled,
        admin = _settings.RunAsAdmin,
        elevated = Elevation.IsElevated
    };

    private void PostSettings() => Post(new { type = "settings", settings = SettingsDto() });

    private void PostSystem() => Post(SystemDto());

    /// <summary>Draws the frame the display gets and hands it to the page as a PNG.</summary>
    private void SendFrame()
    {
        if (!_ready || IsDisposed) return;
        DateTime now = DateTime.Now;
        (ScreenView view, RenderOptions options, ScreenData data) = _display.Frame(now);
        _renderer.Draw(now, options, view, data);
        using SKData png = _renderer.Bitmap.Encode(SKEncodedImageFormat.Png, 100);
        Post(new { type = "frame", png = "data:image/png;base64," + Convert.ToBase64String(png.AsSpan()), view = view.ToString().ToLowerInvariant() });
        _firstFrame.TrySetResult();
    }

    private void OnStatusChanged()
    {
        if (IsHandleCreated && !IsDisposed) BeginInvoke(ShowStatus);
    }

    private void ShowStatus()
    {
        if (!_ready) return;
        (string state, string text) = _display.Status switch
        {
            DisplayStatus.Connected => ("connected", $"Connected · {_display.Detail}"),
            DisplayStatus.Connecting => ("connecting", "Connecting to the display…"),
            DisplayStatus.Busy => ("busy", "Display in use by another program"),
            DisplayStatus.Error => ("error", "Display error · trying again"),
            _ => ("idle", "Display not found")
        };
        Post(new { type = "status", state, text });
    }

    private void Post(object message)
    {
        if (_web.CoreWebView2 is null || IsDisposed) return;
        _web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message, Json));
    }

    private static string Hex(SKColor c) => $"#{c.Red:X2}{c.Green:X2}{c.Blue:X2}";

    private void ShowMissingRuntime()
    {
        Controls.Remove(_web);
        Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.FromArgb(237, 237, 237),
            Text = "AuraTime's window needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.\n" +
                   "Install it from microsoft.com/edge/webview2. The display keeps working meanwhile."
        });
    }

    /* Dark title bar, so the window does not open with a white strip on top of a dark page. */
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int dark = 1;
        _ = DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref dark, sizeof(int));
    }
}
