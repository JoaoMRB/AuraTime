using LibreHardwareMonitor.Hardware;

namespace AuraTime.Desktop;

/// <summary>Recent readings, oldest first, for the graph design. NaN means there was no reading at that moment.</summary>
public sealed record SystemHistory(float[] CpuLoad, float[] GpuLoad, float[] CpuTemp, float[] GpuTemp, float[] NetDown, float[] NetUp)
{
    public static readonly SystemHistory Empty = new([], [], [], [], [], []);
}

/// <summary>One reading of the PC's sensors. A null value means the sensor is not available on this machine.</summary>
public sealed record SystemSnapshot
{
    public string CpuName { get; init; } = "";
    public float? CpuTemp { get; init; }
    public float? CpuLoad { get; init; }
    public float? CpuClockMhz { get; init; }
    public float? CpuPowerW { get; init; }

    public string GpuName { get; init; } = "";
    public float? GpuTemp { get; init; }
    public float? GpuLoad { get; init; }
    public float? GpuClockMhz { get; init; }
    public float? GpuPowerW { get; init; }

    public float? RamUsedGb { get; init; }
    public float? RamTotalGb { get; init; }
    public float? VramUsedGb { get; init; }
    public float? VramTotalGb { get; init; }

    public string DiskName { get; init; } = "";
    public float? DiskUsedPct { get; init; }
    public float? DiskTemp { get; init; }

    /// <summary>Bytes per second of the busiest network adapter.</summary>
    public float? NetDownBps { get; init; }
    public float? NetUpBps { get; init; }

    public SystemHistory History { get; init; } = SystemHistory.Empty;

    public static readonly SystemSnapshot Empty = new();

    /// <summary>Made-up readings, so a design can be shown (previews, checks) without touching the sensors.</summary>
    public static SystemSnapshot Sample { get; } = CreateSample();

    private static SystemSnapshot CreateSample()
    {
        var random = new Random(7);
        float[] Wave(float middle, float swing, float noise, float min, float max)
        {
            var values = new float[SystemSensors.HistoryLength];
            for (int i = 0; i < values.Length; i++)
            {
                float v = middle + swing * MathF.Sin(i / 9f) + (random.NextSingle() - 0.5f) * 2 * noise;
                values[i] = Math.Clamp(v, min, max);
            }
            return values;
        }

        return new SystemSnapshot
        {
            CpuName = "Sample CPU", CpuTemp = 58, CpuLoad = 36, CpuClockMhz = 4200, CpuPowerW = 65,
            GpuName = "Sample GPU", GpuTemp = 52, GpuLoad = 24, GpuClockMhz = 1800, GpuPowerW = 120,
            RamUsedGb = 17.3f, RamTotalGb = 32, VramUsedGb = 3.2f, VramTotalGb = 8,
            DiskName = "Sample SSD", DiskUsedPct = 62, DiskTemp = 38,
            NetDownBps = 4_200_000, NetUpBps = 310_000,
            History = new SystemHistory(
                Wave(40, 25, 8, 2, 100), Wave(30, 20, 6, 0, 100), Wave(56, 8, 2, 30, 90), Wave(50, 6, 2, 30, 90),
                Wave(3_000_000, 2_500_000, 900_000, 0, 9_000_000), Wave(250_000, 150_000, 60_000, 0, 900_000))
        };
    }
}

/// <summary>
/// Reads CPU, GPU, memory, disk and network sensors through LibreHardwareMonitorLib on a background timer, and
/// keeps the last few minutes of some of them for the graph design. Without administrator rights the library
/// cannot reach the CPU's own sensors (temperature, clock, power): those values then stay null.
/// </summary>
public sealed class SystemSensors : IDisposable
{
    /// <summary>How many readings the history keeps (one every <see cref="IntervalMs"/>).</summary>
    public const int HistoryLength = 90;
    private const int IntervalMs = 2000;

    private readonly object _lock = new();
    private readonly List<float> _cpuLoad = [], _gpuLoad = [], _cpuTemp = [], _gpuTemp = [], _netDown = [], _netUp = [];
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
                foreach (List<float> series in new[] { _cpuLoad, _gpuLoad, _cpuTemp, _gpuTemp, _netDown, _netUp }) series.Clear();
                Latest = SystemSnapshot.Empty;
            }
        }
    }

    public void Dispose() => SetEnabled(false);

    /// <summary>Reads the sensors once, right now (used by the command-line checks).</summary>
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
                _computer = new Computer
                {
                    IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true, IsStorageEnabled = true, IsNetworkEnabled = true
                };
                _computer.Open();
            }
            foreach (IHardware hardware in _computer.Hardware) hardware.Update();

            SystemSnapshot reading = Read(_computer);
            Push(_cpuLoad, reading.CpuLoad);
            Push(_gpuLoad, reading.GpuLoad);
            Push(_cpuTemp, reading.CpuTemp);
            Push(_gpuTemp, reading.GpuTemp);
            Push(_netDown, reading.NetDownBps);
            Push(_netUp, reading.NetUpBps);
            Latest = reading with
            {
                History = new SystemHistory(_cpuLoad.ToArray(), _gpuLoad.ToArray(), _cpuTemp.ToArray(), _gpuTemp.ToArray(), _netDown.ToArray(), _netUp.ToArray())
            };
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // This runs on a timer thread: an exception here would end the whole app. A sensor that fails to read
            // (a driver, a disk that is asleep) must not take the display down: keep the previous reading.
            System.Diagnostics.Debug.WriteLine($"[sensors] {e.GetType().Name}: {e.Message}");
        }
        finally
        {
            Monitor.Exit(_lock);
        }
    }

    private static void Push(List<float> series, float? value)
    {
        series.Add(value ?? float.NaN);
        if (series.Count > HistoryLength) series.RemoveAt(0);
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
        // The library only lists physical disks when it runs with administrator rights: their temperature comes from there.
        IHardware? disk = computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Storage && h.Sensors.Any(x => x.SensorType == SensorType.Temperature && x.Value is not null));
        (string diskName, float? diskUsed) = SystemDrive();
        List<IHardware> network = computer.Hardware.Where(h => h.HardwareType == HardwareType.Network).ToList();

        (float? Down, float? Up) busiest = BusiestAdapter(network);

        float? ramUsed = Value(memory, SensorType.Data, "Memory Used");
        float? ramFree = Value(memory, SensorType.Data, "Memory Available");
        float? vramUsed = Value(gpu, SensorType.SmallData, "GPU Memory Used");
        float? vramTotal = Value(gpu, SensorType.SmallData, "GPU Memory Total");

        return new SystemSnapshot
        {
            CpuName = ShortName(cpu?.Name),
            CpuTemp = Value(cpu, SensorType.Temperature, "CPU Package") ?? Value(cpu, SensorType.Temperature, "Core (Tctl/Tdie)") ?? Value(cpu, SensorType.Temperature, "Core Average"),
            CpuLoad = Value(cpu, SensorType.Load, "CPU Total"),
            CpuClockMhz = Average(cpu, SensorType.Clock, "CPU Core #"),
            CpuPowerW = NonZero(Value(cpu, SensorType.Power, "CPU Package")),

            GpuName = ShortName(gpu?.Name),
            GpuTemp = Value(gpu, SensorType.Temperature, "GPU Core"),
            GpuLoad = Value(gpu, SensorType.Load, "GPU Core"),
            GpuClockMhz = Value(gpu, SensorType.Clock, "GPU Core"),
            GpuPowerW = NonZero(Value(gpu, SensorType.Power, "GPU Package")),

            RamUsedGb = ramUsed,
            RamTotalGb = ramUsed + ramFree,
            VramUsedGb = vramUsed / 1024,
            VramTotalGb = vramTotal / 1024,

            DiskName = diskName,
            DiskUsedPct = diskUsed,
            DiskTemp = disk?.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Temperature && s.Value is not null)?.Value,

            NetDownBps = busiest.Down,
            NetUpBps = busiest.Up
        };
    }

    private static float? Value(IHardware? hardware, SensorType type, string name) =>
        hardware?.Sensors.FirstOrDefault(s => s.SensorType == type && s.Name == name)?.Value;

    /// <summary>Some sensors answer 0 when they cannot really be read (CPU power without a driver): that is "unknown".</summary>
    private static float? NonZero(float? value) => value is > 0 ? value : null;

    private static float? Average(IHardware? hardware, SensorType type, string namePrefix)
    {
        if (hardware is null) return null;
        List<float> values = hardware.Sensors
            .Where(s => s.SensorType == type && s.Name.StartsWith(namePrefix, StringComparison.Ordinal) && s.Value is > 0)
            .Select(s => s.Value!.Value)
            .ToList();
        return values.Count == 0 ? null : values.Average();
    }

    /// <summary>
    /// The library lists the filter layers of one network card (packet scheduler, WFP, kernel debugger...) as
    /// adapters of their own, all reporting the same traffic: adding them up would count it several times. The
    /// busiest adapter is the one that carries it.
    /// </summary>
    private static (float? Down, float? Up) BusiestAdapter(IEnumerable<IHardware> adapters)
    {
        (float? Down, float? Up) best = (null, null);
        float bestTotal = -1;
        foreach (IHardware adapter in adapters)
        {
            float? down = Value(adapter, SensorType.Throughput, "Download Speed");
            float? up = Value(adapter, SensorType.Throughput, "Upload Speed");
            if (down is null && up is null) continue;
            float total = (down ?? 0) + (up ?? 0);
            if (total <= bestTotal) continue;
            bestTotal = total;
            best = (down, up);
        }
        return best;
    }

    /// <summary>How full the drive Windows is installed on is, with the normal Windows API: no administrator rights needed.</summary>
    private static (string Name, float? UsedPct) SystemDrive()
    {
        try
        {
            string? root = Path.GetPathRoot(Environment.SystemDirectory);
            if (root is null) return ("", null);
            var drive = new DriveInfo(root);
            if (!drive.IsReady || drive.TotalSize <= 0) return ("", null);
            return (root.TrimEnd('\\'), (float)(100.0 * (drive.TotalSize - drive.AvailableFreeSpace) / drive.TotalSize));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return ("", null);
        }
    }

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
