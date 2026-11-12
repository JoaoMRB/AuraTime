using LibreHardwareMonitor.Hardware;

namespace AuraTime.Desktop;

/// <summary>One reading of the PC's sensors. A null value means the sensor is not available on this machine.</summary>
public sealed record SystemSnapshot(
    string CpuName, float? CpuTemp, float? CpuLoad,
    string GpuName, float? GpuTemp, float? GpuLoad,
    float? RamUsedGb, float? RamTotalGb,
    float? VramUsedGb, float? VramTotalGb)
{
    public static readonly SystemSnapshot Empty = new("", null, null, "", null, null, null, null, null, null);
}

/// <summary>
/// Reads CPU, GPU and memory sensors through LibreHardwareMonitorLib on a background timer. Without administrator
/// rights the library cannot reach the CPU's temperature sensor: that value then stays null.
/// </summary>
public sealed class SystemSensors : IDisposable
{
    private const int IntervalMs = 2000;

    private readonly object _lock = new();
    private Computer? _computer;
    private System.Threading.Timer? _timer;

    public SystemSnapshot Latest { get; private set; } = SystemSnapshot.Empty;

    /// <summary>Starts or stops the polling. Stopped, the library is closed and its memory released.</summary>
    public void SetEnabled(bool enabled)
    {
        lock (_lock)
        {
            if (enabled && _timer is null)
            {
                _timer = new System.Threading.Timer(_ => Poll(), null, 0, IntervalMs);
            }
            else if (!enabled && _timer is not null)
            {
                _timer.Dispose();
                _timer = null;
                _computer?.Close();
                _computer = null;
                Latest = SystemSnapshot.Empty;
            }
        }
    }

    public void Dispose() => SetEnabled(false);

    /// <summary>Reads the sensors once, right now (used by the --sensors command).</summary>
    public SystemSnapshot ReadOnce()
    {
        Poll();
        return Latest;
    }

    /// <summary>Every hardware item and sensor the library sees, one per line.</summary>
    public IEnumerable<string> Describe()
    {
        Poll();
        lock (_lock)
        {
            foreach (IHardware hardware in _computer?.Hardware ?? [])
            {
                yield return $"{hardware.HardwareType}: {hardware.Name}";
                foreach (ISensor sensor in hardware.Sensors.OrderBy(s => s.SensorType).ThenBy(s => s.Index))
                {
                    yield return $"    {sensor.SensorType,-12} {sensor.Name,-28} {sensor.Value?.ToString("0.##") ?? "-"}";
                }
            }
        }
    }

    private void Poll()
    {
        // A slow poll must not pile up behind the next tick.
        if (!Monitor.TryEnter(_lock)) return;
        try
        {
            if (_computer is null)
            {
                _computer = new Computer { IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true };
                _computer.Open();
            }
            foreach (IHardware hardware in _computer.Hardware) hardware.Update();
            Latest = Read(_computer);
        }
        catch (Exception e) when (e is InvalidOperationException or IOException or UnauthorizedAccessException)
        {
            // A sensor that fails to read must not take the display down: keep the previous reading.
        }
        finally
        {
            Monitor.Exit(_lock);
        }
    }

    private static SystemSnapshot Read(Computer computer)
    {
        IHardware? cpu = computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
        // A discrete card wins over the integrated one.
        IHardware? gpu =
            computer.Hardware.FirstOrDefault(h => h.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd)
            ?? computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.GpuIntel);
        // The library lists "Virtual Memory" (with the page file) too: the physical one is what people mean by RAM.
        IHardware? memory = computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Memory && h.Name == "Total Memory")
            ?? computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Memory);

        float? ramUsed = Value(memory, SensorType.Data, "Memory Used");
        float? ramFree = Value(memory, SensorType.Data, "Memory Available");
        float? vramUsed = Value(gpu, SensorType.SmallData, "GPU Memory Used");
        float? vramTotal = Value(gpu, SensorType.SmallData, "GPU Memory Total");

        return new SystemSnapshot(
            ShortName(cpu?.Name),
            Value(cpu, SensorType.Temperature, "CPU Package") ?? Value(cpu, SensorType.Temperature, "Core (Tctl/Tdie)") ?? Value(cpu, SensorType.Temperature, "Core Average"),
            Value(cpu, SensorType.Load, "CPU Total"),
            ShortName(gpu?.Name),
            Value(gpu, SensorType.Temperature, "GPU Core"),
            Value(gpu, SensorType.Load, "GPU Core"),
            ramUsed,
            ramUsed + ramFree,
            vramUsed / 1024,
            vramTotal / 1024);
    }

    private static float? Value(IHardware? hardware, SensorType type, string name) =>
        hardware?.Sensors.FirstOrDefault(s => s.SensorType == type && s.Name == name)?.Value;

    /// <summary>Drops the vendor prefixes: "Intel Core i7-…" -> "Core i7-…", "NVIDIA GeForce RTX …" -> "RTX …".</summary>
    private static string ShortName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "";
        foreach (string prefix in new[] { "Intel ", "AMD ", "NVIDIA ", "GeForce ", "Radeon " })
        {
            if (name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) name = name[prefix.Length..];
        }
        return name.Trim();
    }
}
