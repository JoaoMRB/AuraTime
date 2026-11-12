using AuraTime.Desktop.Display;

namespace AuraTime.Desktop;

/// <summary>
/// The running app: a tray icon that owns the display service. The window is created when asked for and
/// destroyed when closed, so nothing of it stays in memory while the app sits in the tray.
/// </summary>
public sealed class TrayApp : ApplicationContext
{
    private const string ShowEventName = @"Local\AuraTime.Desktop.Show";

    private readonly Settings _settings = Settings.Load();
    private readonly DisplayService _display;
    private readonly NotifyIcon _tray;
    private readonly Icon _icon;
    private readonly ToolStripMenuItem _autostartItem;
    private readonly EventWaitHandle _showEvent = new(false, EventResetMode.AutoReset, ShowEventName);
    private readonly RegisteredWaitHandle _showWait;
    private readonly Control _ui = new();
    private MainForm? _window;

    public TrayApp(bool openWindow)
    {
        _ = _ui.Handle; // creates the handle on the UI thread, so other threads can call back into it

        using (Stream stream = typeof(TrayApp).Assembly.GetManifestResourceStream("app.ico")!)
        {
            _icon = new Icon(stream);
        }

        _display = new DisplayService(_settings);
        _display.StatusChanged += () => _ui.BeginInvoke(UpdateTooltip);

        _autostartItem = new ToolStripMenuItem("Start with Windows") { CheckOnClick = true };
        _autostartItem.Click += (_, _) => Autostart.Set(_autostartItem.Checked);

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open AuraTime", null, (_, _) => ShowWindow());
        menu.Items.Add(_autostartItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => ExitThread());
        menu.Opening += (_, _) => _autostartItem.Checked = Autostart.IsEnabled;

        _tray = new NotifyIcon { Icon = _icon, ContextMenuStrip = menu, Visible = true };
        _tray.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) ShowWindow();
        };
        UpdateTooltip();

        _showWait = ThreadPool.RegisterWaitForSingleObject(
            _showEvent, (_, _) => _ui.BeginInvoke(ShowWindow), null, Timeout.Infinite, executeOnlyOnce: false);

        _display.Start();
        if (openWindow) ShowWindow();
    }

    /// <summary>Called by a second instance: tells the running one to show its window.</summary>
    public static void SignalShowWindow()
    {
        if (EventWaitHandle.TryOpenExisting(ShowEventName, out EventWaitHandle? handle))
        {
            using (handle) handle.Set();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _showWait.Unregister(null);
            _showEvent.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _window?.Dispose();
            _display.Dispose();
            _icon.Dispose();
            _ui.Dispose();
        }
        base.Dispose(disposing);
    }

    private void ShowWindow()
    {
        if (_window is null)
        {
            _window = new MainForm(_settings, _display, _icon);
            _window.FormClosed += (_, _) =>
            {
                _window = null;
                GC.Collect(); // the window's bitmaps and renderer are garbage now: give the memory back promptly
            };
            _window.Show();
        }
        if (_window.WindowState == FormWindowState.Minimized) _window.WindowState = FormWindowState.Normal;
        _window.Activate();
    }

    private void UpdateTooltip()
    {
        _tray.Text = _display.Status switch
        {
            DisplayStatus.Connected => "AuraTime: connected",
            DisplayStatus.Connecting => "AuraTime: connecting...",
            DisplayStatus.Busy => "AuraTime: the display is in use by another program",
            DisplayStatus.Error => "AuraTime: display error, trying again",
            _ => "AuraTime: display not found"
        };
    }
}
