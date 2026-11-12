using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using AuraTime.Desktop.Display;
using AuraTime.Desktop.Render;
using SkiaSharp;

namespace AuraTime.Desktop;

/// <summary>The app's window: a live preview of the screen, the link status and the settings.</summary>
public sealed class MainForm : Form
{
    private static readonly Color Back = Color.FromArgb(10, 10, 10);
    private static readonly Color Panel = Color.FromArgb(23, 23, 23);
    private static readonly Color Fore = Color.FromArgb(237, 237, 237);
    private static readonly Color Muted = Color.FromArgb(136, 136, 136);

    private readonly Settings _settings;
    private readonly DisplayService _display;
    private readonly ScreenRenderer _renderer = new();
    private readonly Bitmap _previewBitmap = new(TuringProtocol.ScreenWidth, TuringProtocol.ScreenHeight, PixelFormat.Format32bppPArgb);
    private readonly PictureBox _preview;
    private readonly Label _status;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };

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
        ClientSize = new Size(528, 610);

        _preview = new PictureBox
        {
            Location = new Point(24, 24),
            Size = new Size(TuringProtocol.ScreenWidth, TuringProtocol.ScreenHeight),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = _previewBitmap
        };
        _status = new Label { Location = new Point(24, 356), Size = new Size(480, 22), ForeColor = Muted, AutoEllipsis = true };
        Controls.Add(_preview);
        Controls.Add(_status);

        int y = 396;
        ComboBox theme = AddCombo("Theme", ref y, Themes.All.Select(t => t.Name), Array.FindIndex(Themes.All, t => t.Id == Themes.Resolve(settings.Theme).Id));
        theme.SelectedIndexChanged += (_, _) => Change(() => _settings.Theme = Themes.All[theme.SelectedIndex].Id);

        ComboBox font = AddCombo("Clock font", ref y, ClockFonts.All.Select(f => f.Name), Array.FindIndex(ClockFonts.All, f => f.Id == ClockFonts.Resolve(settings.Font).Id));
        font.SelectedIndexChanged += (_, _) => Change(() => _settings.Font = ClockFonts.All[font.SelectedIndex].Id);

        AddLabel("Brightness", y);
        var brightness = new TrackBar
        {
            Location = new Point(176, y - 4), Size = new Size(328, 32), Minimum = 0, Maximum = 100,
            TickStyle = TickStyle.None, Value = settings.Brightness, BackColor = Back
        };
        brightness.ValueChanged += (_, _) => Change(() => _settings.Brightness = brightness.Value);
        Controls.Add(brightness);
        y += 40;

        CheckBox use24h = AddCheck("24-hour clock", ref y, settings.Use24h);
        use24h.CheckedChanged += (_, _) => Change(() => _settings.Use24h = use24h.Checked);

        CheckBox autostart = AddCheck("Start with Windows", ref y, Autostart.IsEnabled);
        autostart.CheckedChanged += (_, _) => Autostart.Set(autostart.Checked);

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
        _renderer.Draw(DateTime.Now, DisplayService.OptionsFrom(_settings));
        var area = new Rectangle(0, 0, _previewBitmap.Width, _previewBitmap.Height);
        BitmapData data = _previewBitmap.LockBits(area, ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
        try
        {
            // GDI+ wants BGRA; the renderer's bitmap is RGBA (the order the display conversion expects).
            var info = new SKImageInfo(area.Width, area.Height, SKColorType.Bgra8888, SKAlphaType.Premul);
            using SKPixmap pixels = _renderer.Bitmap.PeekPixels();
            pixels.ReadPixels(info, data.Scan0, data.Stride);
        }
        finally
        {
            _previewBitmap.UnlockBits(data);
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

    private void AddLabel(string text, int y) =>
        Controls.Add(new Label { Text = text, Location = new Point(24, y + 3), Size = new Size(150, 22), ForeColor = Muted });

    private ComboBox AddCombo(string label, ref int y, IEnumerable<string> items, int selected)
    {
        AddLabel(label, y);
        var combo = new ComboBox
        {
            Location = new Point(176, y), Size = new Size(328, 26), DropDownStyle = ComboBoxStyle.DropDownList,
            FlatStyle = FlatStyle.Flat, BackColor = Panel, ForeColor = Fore
        };
        combo.Items.AddRange([.. items]);
        combo.SelectedIndex = Math.Max(0, selected);
        Controls.Add(combo);
        y += 40;
        return combo;
    }

    private CheckBox AddCheck(string text, ref int y, bool value)
    {
        var check = new CheckBox { Text = text, Location = new Point(24, y), Size = new Size(480, 26), Checked = value, ForeColor = Fore };
        Controls.Add(check);
        y += 32;
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
