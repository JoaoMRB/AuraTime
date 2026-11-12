using System.Text.Json;
using Microsoft.Win32;

namespace AuraTime.Desktop;

/// <summary>What the user chose, kept in %AppData%\AuraTime\settings.json.</summary>
public sealed class Settings
{
    /// <summary>"clock", "system" or "auto" (the two take turns).</summary>
    public string View { get; set; } = "clock";
    public string Theme { get; set; } = Render.Themes.DefaultId;
    public string Font { get; set; } = Render.ClockFonts.DefaultId;
    public int Brightness { get; set; } = 60;
    public bool Use24h { get; set; } = true;
    /// <summary>Hardware (RTS/CTS) flow control on the serial port, as in the web app.</summary>
    public bool FlowControl { get; set; } = true;

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private static string FilePath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AuraTime", "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                Settings? loaded = JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath));
                if (loaded is not null)
                {
                    loaded.Brightness = Math.Clamp(loaded.Brightness, 0, 100);
                    return loaded;
                }
            }
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            // A broken or unreadable file must not stop the app: start from the defaults.
        }
        return new Settings();
    }

    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(this, JsonOptions));
    }
}

/// <summary>"Start with Windows", through the current user's Run key (no admin rights needed).</summary>
public static class Autostart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "AuraTime";

    /// <summary>Passed at login so the app starts in the tray without opening its window.</summary>
    public const string TrayArgument = "--tray";

    private static string Command => $"\"{Environment.ProcessPath}\" {TrayArgument}";

    public static bool IsEnabled
    {
        get
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKey);
            return string.Equals(key?.GetValue(ValueName) as string, Command, StringComparison.OrdinalIgnoreCase);
        }
    }

    public static void Set(bool enabled)
    {
        using RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) key.SetValue(ValueName, Command);
        else key.DeleteValue(ValueName, throwOnMissingValue: false);
    }
}
