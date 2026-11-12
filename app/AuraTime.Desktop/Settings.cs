using System.ComponentModel;
using System.Diagnostics;
using System.Security;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace AuraTime.Desktop;

/// <summary>
/// What the user chose, kept in %AppData%\AuraTime\settings.json. The display thread reads it while the window
/// changes it: lists are always replaced, never changed in place.
/// </summary>
public sealed class Settings
{
    public const int MinViewSeconds = 10;
    public const int MaxViewSeconds = 60;

    /// <summary>Views shown on the screen, taking turns: "clock", "system", "weather", "world".</summary>
    public List<string> Views { get; set; } = ["clock"];
    /// <summary>How long each view stays before the next one.</summary>
    public int ViewSeconds { get; set; } = 20;
    /// <summary>Where the weather view looks; null until the user picks a city.</summary>
    public WeatherCity? WeatherCity { get; set; }
    /// <summary>IANA time zones of the world clocks view (up to three).</summary>
    public List<string> WorldClocks { get; set; } = [.. Desktop.WorldClocks.Defaults];

    /// <summary>Before several views: "clock", "system" or "auto". Only read, to carry an old choice over.</summary>
    public string? View { get; set; }

    public string Theme { get; set; } = Render.Themes.DefaultId;
    public string Font { get; set; } = Render.ClockFonts.DefaultId;
    public int Brightness { get; set; } = 60;
    public bool Use24h { get; set; } = true;
    /// <summary>Hardware (RTS/CTS) flow control on the serial port, as in the web app.</summary>
    public bool FlowControl { get; set; } = true;
    /// <summary>Run with administrator rights, so the CPU's temperature can be read. Off by default.</summary>
    public bool RunAsAdmin { get; set; }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

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
                    loaded.Normalise();
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

    public static readonly string[] AllViews = ["clock", "system", "weather", "world"];

    /// <summary>Repairs whatever a hand-edited or older file got wrong.</summary>
    private void Normalise()
    {
        // The old single choice becomes the list of views.
        if (View is not null)
        {
            Views = View switch
            {
                "system" => ["system"],
                "auto" => ["clock", "system"],
                _ => ["clock"]
            };
            View = null;
        }
        Views = (Views ?? []).Where(AllViews.Contains).Distinct().ToList();
        if (Views.Count == 0) Views = ["clock"];
        WorldClocks = (WorldClocks ?? []).Where(id => Desktop.WorldClocks.Cities.Any(c => c.TimeZoneId == id)).Take(Desktop.WorldClocks.Max).ToList();
        ViewSeconds = Math.Clamp(ViewSeconds, MinViewSeconds, MaxViewSeconds);
        Brightness = Math.Clamp(Brightness, 0, 100);
        if (WeatherCity is { } city && (string.IsNullOrWhiteSpace(city.Name) || Math.Abs(city.Latitude) > 90 || Math.Abs(city.Longitude) > 180))
        {
            WeatherCity = null;
        }
    }
}

/// <summary>Administrator rights, which the CPU's temperature sensor needs.</summary>
public static class Elevation
{
    private const int ErrorCancelled = 1223;

    public static bool IsElevated
    {
        get
        {
            using WindowsIdentity identity = WindowsIdentity.GetCurrent();
            return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }
    }

    /// <summary>Starts this program again with administrator rights (Windows asks first). False when the user says no.</summary>
    public static bool Relaunch(string arguments)
    {
        try
        {
            Process.Start(new ProcessStartInfo(Environment.ProcessPath!, arguments) { UseShellExecute = true, Verb = "runas" })?.Dispose();
            return true;
        }
        catch (Win32Exception e) when (e.NativeErrorCode == ErrorCancelled)
        {
            return false;
        }
    }
}

/// <summary>
/// "Start with Windows". Normally the current user's Run key (no admin rights needed). With administrator mode on,
/// a scheduled task instead: it starts the app elevated at sign-in without a Windows prompt every time.
/// </summary>
public static class Autostart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Name = "AuraTime";

    /// <summary>Passed at sign-in so the app starts in the tray without opening its window.</summary>
    public const string TrayArgument = "--tray";

    private static string Command => $"\"{Environment.ProcessPath}\" {TrayArgument}";

    public static bool IsEnabled => RunValueIsSet || TaskExists();

    public static void Set(bool enabled, Settings settings)
    {
        // The task can only be created with administrator rights: without them, the Run key is the fallback.
        bool useTask = enabled && settings.RunAsAdmin && Elevation.IsElevated;
        if (useTask) CreateTask();
        else if (TaskExists()) DeleteTask();

        using RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled && !useTask) key.SetValue(Name, Command);
        else key.DeleteValue(Name, throwOnMissingValue: false);
    }

    /// <summary>Moves an existing "start with Windows" to the mechanism that fits the current mode.</summary>
    public static void Sync(Settings settings)
    {
        if (IsEnabled) Set(true, settings);
    }

    private static bool RunValueIsSet
    {
        get
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKey);
            return string.Equals(key?.GetValue(Name) as string, Command, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static bool TaskExists() => Schtasks($"/Query /TN \"{Name}\"") == 0;

    private static void DeleteTask() => Schtasks($"/Delete /TN \"{Name}\" /F");

    private static void CreateTask()
    {
        string user = SecurityElement.Escape(WindowsIdentity.GetCurrent().Name);
        string exe = SecurityElement.Escape(Environment.ProcessPath!);
        // Unlike `schtasks /Create /SC ONLOGON`, the XML lets the task start on battery power and run for ever.
        string xml = $"""
            <?xml version="1.0" encoding="UTF-16"?>
            <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
              <RegistrationInfo><Description>Starts AuraTime at sign-in, with administrator rights for the CPU temperature.</Description></RegistrationInfo>
              <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger></Triggers>
              <Principals>
                <Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal>
              </Principals>
              <Settings>
                <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                <Priority>7</Priority>
              </Settings>
              <Actions Context="Author"><Exec><Command>{exe}</Command><Arguments>{TrayArgument}</Arguments></Exec></Actions>
            </Task>
            """;
        string file = Path.Combine(Path.GetTempPath(), $"AuraTime-task-{Environment.ProcessId}.xml");
        try
        {
            File.WriteAllText(file, xml, Encoding.Unicode);
            if (Schtasks($"/Create /TN \"{Name}\" /XML \"{file}\" /F") != 0)
            {
                throw new InvalidOperationException("Windows did not accept the start-up task.");
            }
        }
        finally
        {
            File.Delete(file);
        }
    }

    private static int Schtasks(string arguments)
    {
        var info = new ProcessStartInfo("schtasks.exe", arguments)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        using Process process = Process.Start(info)!;
        process.StandardOutput.ReadToEnd();
        process.StandardError.ReadToEnd();
        process.WaitForExit();
        return process.ExitCode;
    }
}
