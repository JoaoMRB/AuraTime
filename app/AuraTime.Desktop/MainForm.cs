using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using AuraTime.Desktop.Display;
using AuraTime.Desktop.Render;
using SkiaSharp;

namespace AuraTime.Desktop;

/// <summary>
/// The app's window. Left: a live preview of the screen, the link status and how the screen looks. Right: which
/// views take turns, and what the weather and world clock views show.
/// </summary>
public sealed class MainForm : Form
{
    private static readonly Color Back = Color.FromArgb(10, 10, 10);
    private static readonly Color Panel = Color.FromArgb(23, 23, 23);
    private static readonly Color Fore = Color.FromArgb(237, 237, 237);
    private static readonly Color Muted = Color.FromArgb(136, 136, 136);

    private const int LeftX = 24;
    private const int RightX = 536;
    private const int RightWidth = 320;

    private static readonly (string Id, string Name)[] ViewNames =
    [
        ("clock", "Clock"),
        ("system", "System (CPU, GPU, memory)"),
        ("weather", "Weather and quote"),
        ("world", "World clocks")
    ];

    private readonly Settings _settings;
    private readonly DisplayService _display;
    private readonly ScreenRenderer _renderer = new();
    private readonly Bitmap _previewBitmap = new(TuringProtocol.ScreenWidth, TuringProtocol.ScreenHeight, PixelFormat.Format32bppPArgb);
    private readonly PictureBox _preview;
    private readonly Label _status;
    private readonly Label _cityLabel;
    private readonly TextBox _citySearch;
    private readonly Button _citySearchButton;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };
    private bool _revertingAdmin;

    public MainForm(Settings settings, DisplayService display, Icon icon)
    {
        _settings = settings;
        _display = display;

        Text = "AuraTime";
        Icon = icon;
        BackColor = Back;
        ForeColor = Fore;
        Font = new Font("Segoe UI", 9.5f);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(RightX + RightWidth + 24, 620);

        /* ---------- left: preview, status, appearance ---------- */

        _preview = new PictureBox
        {
            Location = new Point(LeftX, 24),
            Size = new Size(TuringProtocol.ScreenWidth, TuringProtocol.ScreenHeight),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = _previewBitmap
        };
        _status = new Label { Location = new Point(LeftX, 356), Size = new Size(480, 22), ForeColor = Muted, AutoEllipsis = true };
        Controls.Add(_preview);
        Controls.Add(_status);

        int y = 396;
        ComboBox theme = AddCombo(LeftX, "Theme", ref y, Themes.All.Select(t => t.Name), Array.FindIndex(Themes.All, t => t.Id == Themes.Resolve(settings.Theme).Id));
        theme.SelectedIndexChanged += (_, _) => Change(() => _settings.Theme = Themes.All[theme.SelectedIndex].Id);

        ComboBox font = AddCombo(LeftX, "Clock font", ref y, ClockFonts.All.Select(f => f.Name), Array.FindIndex(ClockFonts.All, f => f.Id == ClockFonts.Resolve(settings.Font).Id));
        font.SelectedIndexChanged += (_, _) => Change(() => _settings.Font = ClockFonts.All[font.SelectedIndex].Id);

        AddLabel(LeftX, "Brightness", y);
        var brightness = new TrackBar
        {
            Location = new Point(LeftX + 128, y - 4), Size = new Size(352, 32), Minimum = 0, Maximum = 100,
            TickStyle = TickStyle.None, Value = settings.Brightness, BackColor = Back
        };
        brightness.ValueChanged += (_, _) => Change(() => _settings.Brightness = brightness.Value);
        Controls.Add(brightness);
        y += 40;

        CheckBox use24h = AddCheck(LeftX, "24-hour clock", ref y, settings.Use24h);
        use24h.CheckedChanged += (_, _) => Change(() => _settings.Use24h = use24h.Checked);

        CheckBox autostart = AddCheck(LeftX, "Start with Windows", ref y, Autostart.IsEnabled);
        autostart.CheckedChanged += (_, _) => Autostart.Set(autostart.Checked, _settings);

        CheckBox admin = AddCheck(LeftX, "CPU temperature (runs AuraTime as administrator)", ref y, settings.RunAsAdmin);
        admin.CheckedChanged += (_, _) => OnAdminChanged(admin);

        /* ---------- right: views, weather, world clocks ---------- */

        y = 24;
        AddHeader("Screen views", ref y);
        foreach ((string id, string name) in ViewNames)
        {
            CheckBox box = AddCheck(RightX, name, ref y, settings.Views.Contains(id));
            box.CheckedChanged += (_, _) => Change(() =>
            {
                List<string> views = Settings.AllViews.Where(v => v == id ? box.Checked : _settings.Views.Contains(v)).ToList();
                _settings.Views = views.Count > 0 ? views : ["clock"];
            });
        }
        AddLabel(RightX, "Seconds per view", y);
        var seconds = new NumericUpDown
        {
            Location = new Point(RightX + 160, y), Size = new Size(80, 26), Minimum = Settings.MinViewSeconds,
            Maximum = Settings.MaxViewSeconds, Value = settings.ViewSeconds, BackColor = Panel, ForeColor = Fore,
            BorderStyle = BorderStyle.FixedSingle
        };
        seconds.ValueChanged += (_, _) => Change(() => _settings.ViewSeconds = (int)seconds.Value);
        Controls.Add(seconds);
        y += 48;

        AddHeader("Weather", ref y);
        _citySearch = new TextBox
        {
            Location = new Point(RightX, y), Size = new Size(RightWidth - 96, 26), BackColor = Panel, ForeColor = Fore,
            BorderStyle = BorderStyle.FixedSingle, PlaceholderText = "City"
        };
        _citySearchButton = new Button
        {
            Text = "Search", Location = new Point(RightX + RightWidth - 88, y - 1), Size = new Size(88, 28),
            FlatStyle = FlatStyle.Flat, BackColor = Panel, ForeColor = Fore
        };
        _citySearchButton.FlatAppearance.BorderColor = Color.FromArgb(51, 51, 51);
        _citySearchButton.Click += async (_, _) => await SearchCityAsync();
        _citySearch.KeyDown += async (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            await SearchCityAsync();
        };
        Controls.Add(_citySearch);
        Controls.Add(_citySearchButton);
        y += 34;
        _cityLabel = new Label { Location = new Point(RightX, y), Size = new Size(RightWidth, 22), ForeColor = Muted, AutoEllipsis = true };
        Controls.Add(_cityLabel);
        ShowCity();
        y += 40;

        AddHeader("World clocks", ref y);
        string[] cityNames = ["(none)", .. WorldClocks.Cities.Select(c => c.Label)];
        for (int i = 0; i < WorldClocks.Max; i++)
        {
            int slot = i;
            int selected = slot < settings.WorldClocks.Count
                ? Array.FindIndex(WorldClocks.Cities, c => c.TimeZoneId == settings.WorldClocks[slot]) + 1
                : 0;
            var combo = new ComboBox
            {
                Location = new Point(RightX, y), Size = new Size(RightWidth, 26), DropDownStyle = ComboBoxStyle.DropDownList,
                FlatStyle = FlatStyle.Flat, BackColor = Panel, ForeColor = Fore
            };
            combo.Items.AddRange(cityNames);
            combo.SelectedIndex = Math.Max(0, selected);
            combo.Tag = slot;
            combo.SelectedIndexChanged += (_, _) => Change(() => _settings.WorldClocks = WorldClockChoices());
            Controls.Add(combo);
            y += 36;
        }

        _display.StatusChanged += OnStatusChanged;
        _timer.Tick += (_, _) => DrawPreview();
        _timer.Start();
        DrawPreview();
        ShowStatus();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _display.StatusChanged -= OnStatusChanged;
            _timer.Dispose();
            _renderer.Dispose();
            _previewBitmap.Dispose();
        }
        base.Dispose(disposing);
    }

    /// <summary>The three world clock boxes, top to bottom, without the empty ones.</summary>
    private List<string> WorldClockChoices() =>
        Controls.OfType<ComboBox>()
            .Where(c => c.Tag is int)
            .OrderBy(c => (int)c.Tag!)
            .Where(c => c.SelectedIndex > 0)
            .Select(c => WorldClocks.Cities[c.SelectedIndex - 1].TimeZoneId)
            .ToList();

    /// <summary>Looks the typed name up and offers the matches in a menu under the search box.</summary>
    private async Task SearchCityAsync()
    {
        string name = _citySearch.Text.Trim();
        if (name.Length < 2) return;
        _citySearchButton.Enabled = false;
        try
        {
            IReadOnlyList<WeatherCity> cities = await WeatherService.SearchAsync(name, _display.Language);
            if (IsDisposed) return;
            if (cities.Count == 0)
            {
                _cityLabel.Text = $"No place called \"{name}\".";
                return;
            }
            var menu = new ContextMenuStrip();
            foreach (WeatherCity city in cities)
            {
                menu.Items.Add(city.Display, null, (_, _) =>
                {
                    Change(() => _settings.WeatherCity = city);
                    _citySearch.Text = "";
                    ShowCity();
                });
            }
            menu.Closed += (_, _) => BeginInvoke(menu.Dispose);
            menu.Show(_citySearch, new Point(0, _citySearch.Height));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
        {
            if (!IsDisposed) _cityLabel.Text = "Could not search: check the internet connection.";
        }
        finally
        {
            if (!IsDisposed) _citySearchButton.Enabled = true;
        }
    }

    private void ShowCity() =>
        _cityLabel.Text = _settings.WeatherCity is { } city ? $"Showing the weather for {city.Display}" : "No city chosen yet.";

    /// <summary>
    /// Turning administrator mode on restarts the app with administrator rights (Windows asks first); if the user
    /// says no, the box unticks itself. Turning it off takes effect the next time the app starts.
    /// </summary>
    private void OnAdminChanged(CheckBox box)
    {
        if (_revertingAdmin) return;
        _settings.RunAsAdmin = box.Checked;
        _settings.Save();

        if (box.Checked && !Elevation.IsElevated)
        {
            if (Elevation.Relaunch($"{Program.WaitForArgument} {Environment.ProcessId}"))
            {
                Application.Exit(); // the elevated copy waits for this one to quit, then takes over
                return;
            }
            _settings.RunAsAdmin = false;
            _settings.Save();
            _revertingAdmin = true;
            box.Checked = false;
            _revertingAdmin = false;
            return;
        }

        try
        {
            Autostart.Sync(_settings);
        }
        catch (Exception e) when (e is InvalidOperationException or UnauthorizedAccessException or IOException)
        {
            MessageBox.Show(this, $"Could not update the start-up entry: {e.Message}", "AuraTime", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        if (!box.Checked && Elevation.IsElevated)
        {
            MessageBox.Show(this, "AuraTime will run without administrator rights the next time it starts.", "AuraTime",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private void Change(Action apply)
    {
        apply();
        _settings.Save();
        _display.ApplySettings();
        DrawPreview();
    }

    /// <summary>Draws the same frame the display gets and copies it into the picture box.</summary>
    private void DrawPreview()
    {
        DateTime now = DateTime.Now;
        (ScreenView view, RenderOptions options, ScreenData data) = _display.Frame(now);
        _renderer.Draw(now, options, view, data);
        var area = new Rectangle(0, 0, _previewBitmap.Width, _previewBitmap.Height);
        BitmapData bits = _previewBitmap.LockBits(area, ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
        try
        {
            // GDI+ wants BGRA; the renderer's bitmap is RGBA (the order the display conversion expects).
            var info = new SKImageInfo(area.Width, area.Height, SKColorType.Bgra8888, SKAlphaType.Premul);
            using SKPixmap pixels = _renderer.Bitmap.PeekPixels();
            pixels.ReadPixels(info, bits.Scan0, bits.Stride);
        }
        finally
        {
            _previewBitmap.UnlockBits(bits);
        }
        _preview.Invalidate();
    }

    private void OnStatusChanged()
    {
        if (IsHandleCreated && !IsDisposed) BeginInvoke(ShowStatus);
    }

    private void ShowStatus()
    {
        (string text, Color color) = _display.Status switch
        {
            DisplayStatus.Connected => ($"●  Connected: {_display.Detail}", Color.FromArgb(80, 200, 120)),
            DisplayStatus.Connecting => ("●  Connecting to the display...", Muted),
            DisplayStatus.Busy => ("●  Display in use by another program. Close it and AuraTime connects.", Color.FromArgb(240, 180, 60)),
            DisplayStatus.Error => ($"●  {_display.Detail} Trying again...", Color.FromArgb(240, 100, 100)),
            _ => ("●  Display not found. Plug it in and AuraTime connects.", Muted)
        };
        _status.Text = text;
        _status.ForeColor = color;
    }

    private void AddHeader(string text, ref int y)
    {
        Controls.Add(new Label
        {
            Text = text.ToUpperInvariant(), Location = new Point(RightX, y), Size = new Size(RightWidth, 20),
            ForeColor = Muted, Font = new Font("Segoe UI Semibold", 8.5f)
        });
        y += 28;
    }

    private void AddLabel(int x, string text, int y) =>
        Controls.Add(new Label { Text = text, Location = new Point(x, y + 3), Size = new Size(124, 22), ForeColor = Muted });

    private ComboBox AddCombo(int x, string label, ref int y, IEnumerable<string> items, int selected)
    {
        AddLabel(x, label, y);
        var combo = new ComboBox
        {
            Location = new Point(x + 128, y), Size = new Size(352, 26), DropDownStyle = ComboBoxStyle.DropDownList,
            FlatStyle = FlatStyle.Flat, BackColor = Panel, ForeColor = Fore
        };
        combo.Items.AddRange([.. items]);
        combo.SelectedIndex = Math.Max(0, selected);
        Controls.Add(combo);
        y += 40;
        return combo;
    }

    private CheckBox AddCheck(int x, string text, ref int y, bool value)
    {
        var check = new CheckBox { Text = text, Location = new Point(x, y), Size = new Size(x == RightX ? RightWidth : 480, 26), Checked = value, ForeColor = Fore };
        Controls.Add(check);
        y += 30;
        return check;
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
