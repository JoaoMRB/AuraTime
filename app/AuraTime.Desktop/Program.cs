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
        // AuraTime.exe --png out.png [--system] : draw one frame to a file and exit (to check the renderer without a display).
        int png = Array.IndexOf(args, "--png");
        if (png >= 0 && png + 1 < args.Length) return WritePng(args[png + 1], args.Contains("--system"));

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

    private static int WritePng(string path, bool systemView)
    {
        using var renderer = new ScreenRenderer();
        using var sensors = new SystemSensors();
        SystemSnapshot? snapshot = systemView ? sensors.ReadOnce() : null;
        renderer.Draw(DateTime.Now, DisplayService.OptionsFrom(Settings.Load()), systemView ? ScreenView.System : ScreenView.Clock, snapshot);
        using SKData data = renderer.Bitmap.Encode(SKEncodedImageFormat.Png, 100);
        File.WriteAllBytes(path, data.ToArray());
        return 0;
    }
}
