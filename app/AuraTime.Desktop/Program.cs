using AuraTime.Desktop.Display;
using AuraTime.Desktop.Render;
using SkiaSharp;

namespace AuraTime.Desktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // AuraTime.exe --png out.png : draw one frame to a file and exit (to check the renderer without a display).
        int png = Array.IndexOf(args, "--png");
        if (png >= 0 && png + 1 < args.Length) return WritePng(args[png + 1]);

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

    private static int WritePng(string path)
    {
        using var renderer = new ScreenRenderer();
        renderer.Draw(DateTime.Now, DisplayService.OptionsFrom(Settings.Load()));
        using SKData data = renderer.Bitmap.Encode(SKEncodedImageFormat.Png, 100);
        File.WriteAllBytes(path, data.ToArray());
        return 0;
    }
}
