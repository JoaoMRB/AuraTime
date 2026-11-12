using System.Diagnostics;
using AuraTime.Desktop.Display;
using AuraTime.Desktop.Render;
using SkiaSharp;

namespace AuraTime.Desktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // AuraTime.exe --png out.png [--view clock|system|weather|world] [--theme id] : draw one frame to a file and
        // exit (to check the renderer without a display). Reads the settings, never writes them.
        int png = Array.IndexOf(args, "--png");
        if (png >= 0 && png + 1 < args.Length) return WritePng(args[png + 1], Option(args, "--view") ?? "clock", Option(args, "--theme"), Option(args, "--condition"));

        // AuraTime.exe --window-png out.png : draw the settings window to a file and exit (layout checks).
        int windowPng = Array.IndexOf(args, "--window-png");
        if (windowPng >= 0 && windowPng + 1 < args.Length) return WriteWindowPng(args[windowPng + 1]);

        // AuraTime.exe --sensors out.txt : list every sensor the app can read on this PC and exit.
        int sensors = Array.IndexOf(args, "--sensors");
        if (sensors >= 0 && sensors + 1 < args.Length)
        {
            using var system = new SystemSensors();
            File.WriteAllLines(args[sensors + 1], [.. system.Describe(), "", system.ReadOnce().ToString()]);
            return 0;
        }

        // Restarted by an instance that is switching to administrator mode: let it finish quitting first.
        int waitFor = Array.IndexOf(args, WaitForArgument);
        if (waitFor >= 0 && waitFor + 1 < args.Length && int.TryParse(args[waitFor + 1], out int pid)) WaitForExit(pid);

        bool tray = args.Contains(Autostart.TrayArgument);
        Settings settings = Settings.Load();
        if (settings.RunAsAdmin && !Elevation.IsElevated && Elevation.Relaunch(tray ? Autostart.TrayArgument : ""))
        {
            return 0;
        }
        // (When the user says no to the Windows prompt, the app carries on without the CPU temperature.)

        Mutex single;
        bool first;
        try
        {
            single = new Mutex(true, @"Local\AuraTime.Desktop", out first);
        }
        catch (UnauthorizedAccessException)
        {
            // The running instance has administrator rights, so this one cannot even look at it.
            ApplicationConfiguration.Initialize();
            MessageBox.Show("AuraTime is already running. Open it from its icon in the taskbar's notification area.", "AuraTime",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        using (single)
        {
            if (!first)
            {
                // Already running: ask that instance to show its window instead of starting a second one.
                TrayApp.SignalShowWindow();
                return 0;
            }

            ApplicationConfiguration.Initialize();
            using var app = new TrayApp(settings, openWindow: !tray);
            Application.Run(app);
        }
        return 0;
    }

    /// <summary>Followed by a process id: wait for that process to quit before starting.</summary>
    public const string WaitForArgument = "--wait-for";

    private static void WaitForExit(int pid)
    {
        try
        {
            using Process process = Process.GetProcessById(pid);
            process.WaitForExit(10000);
        }
        catch (ArgumentException)
        {
            // Already gone.
        }
    }

    private static int WriteWindowPng(string path)
    {
        ApplicationConfiguration.Initialize();
        Settings settings = Settings.Load();
        using var display = new DisplayService(settings); // never started: no link to the screen
        using var icon = (Icon)SystemIcons.Application.Clone();
        // Off screen, so the check does not flash a window at the user.
        using var form = new MainForm(settings, display, icon) { StartPosition = FormStartPosition.Manual, Location = new Point(-4000, -4000) };
        // --tall : a window high enough to show every settings card at once.
        if (Environment.GetCommandLineArgs().Contains("--tall")) form.ClientSize = new Size(form.ClientSize.Width, 1500);
        form.Shown += async (_, _) =>
        {
            Task done = await Task.WhenAny(form.FirstFrameShown, Task.Delay(15000));
            if (done == form.FirstFrameShown)
            {
                // --bottom : capture the lower settings cards instead of the top ones.
                if (Environment.GetCommandLineArgs().Contains("--bottom")) await form.ScrollSettingsToEndAsync();
                await Task.Delay(600); // let the page paint the frame and the fonts
                await form.CapturePngAsync(path);
            }
            form.Close();
        };
        Application.Run(form);

        // --linger : stay alive a few seconds with the window gone, as the tray app does, to check that the
        // WebView2 processes end with the window.
        if (Environment.GetCommandLineArgs().Contains("--linger"))
        {
            form.Dispose();
            long until = Environment.TickCount64 + 6000;
            while (Environment.TickCount64 < until)
            {
                Application.DoEvents();
                Thread.Sleep(50);
            }
        }
        return File.Exists(path) ? 0 : 1;
    }

    private static string? Option(string[] args, string name)
    {
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    private static int WritePng(string path, string viewName, string? themeId, string? condition)
    {
        Settings settings = Settings.Load();
        DateTime now = DateTime.Now;
        ScreenView view = viewName switch
        {
            "system" => ScreenView.System,
            "weather" => ScreenView.Weather,
            "world" => ScreenView.World,
            _ => ScreenView.Clock
        };

        using var sensors = new SystemSensors();
        SystemSnapshot system = view == ScreenView.System ? sensors.ReadOnce() : SystemSnapshot.Empty;
        // Without a chosen city, a sample one, so the view can still be checked.
        WeatherNow? weather = view == ScreenView.Weather
            ? WeatherService.FetchAsync(settings.WeatherCity ?? new WeatherCity("Lisboa", "Portugal", 38.72, -9.14)).GetAwaiter().GetResult()
            : null;
        // --condition sunny|clear-night|cloudy|rainy|snowy|stormy : force the weather icon, to check each one.
        if (weather is not null && condition is not null) weather = weather with { Condition = condition };
        IReadOnlyList<WorldClockRow> world = view == ScreenView.World ? WorldClocks.Rows(settings.WorldClocks, now, settings.Use24h) : [];

        var options = new RenderOptions(
            Themes.Resolve(themeId ?? settings.Theme), ClockFonts.Resolve(settings.Font), settings.Use24h,
            System.Globalization.CultureInfo.CurrentCulture, ScreenText.ForCurrentCulture());
        using var renderer = new ScreenRenderer();
        renderer.Draw(now, options, view, new ScreenData(system, weather, world));
        using SKData data = renderer.Bitmap.Encode(SKEncodedImageFormat.Png, 100);
        File.WriteAllBytes(path, data.ToArray());
        return 0;
    }
}
