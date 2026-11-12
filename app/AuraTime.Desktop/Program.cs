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

        using var single = new Mutex(true, @"Local\AuraTime.Desktop", out bool first);
        if (!first)
        {
            // Already running: ask that instance to show its window instead of starting a second one.
            TrayApp.SignalShowWindow();
            return 0;
        }

        ApplicationConfiguration.Initialize();
        using var app = new TrayApp(openWindow: !args.Contains(Autostart.TrayArgument));
        Application.Run(app);
        return 0;
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
