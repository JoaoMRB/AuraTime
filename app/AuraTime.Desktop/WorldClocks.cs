using System.Globalization;

namespace AuraTime.Desktop;

public sealed record WorldCity(string Label, string TimeZoneId);

/// <summary>One row of the world clocks view.</summary>
public sealed record WorldClockRow(string Label, string Time, string AmPm, string Utc, int DayOffset);

public static class WorldClocks
{
    public const int Max = 3;

    /// <summary>The web app's popular time zones (world-clock.service.ts), plus Lisbon.</summary>
    public static readonly WorldCity[] Cities =
    [
        new("New York", "America/New_York"),
        new("Los Angeles", "America/Los_Angeles"),
        new("Chicago", "America/Chicago"),
        new("São Paulo", "America/Sao_Paulo"),
        new("London", "Europe/London"),
        new("Lisbon", "Europe/Lisbon"),
        new("Paris", "Europe/Paris"),
        new("Berlin", "Europe/Berlin"),
        new("Dubai", "Asia/Dubai"),
        new("Mumbai", "Asia/Kolkata"),
        new("Shanghai", "Asia/Shanghai"),
        new("Tokyo", "Asia/Tokyo"),
        new("Sydney", "Australia/Sydney")
    ];

    public static readonly string[] Defaults = ["America/New_York", "Europe/London", "Asia/Tokyo"];

    /// <summary>The rows to draw for the chosen time zones; unknown ones are skipped.</summary>
    public static IReadOnlyList<WorldClockRow> Rows(IEnumerable<string> timeZoneIds, DateTime now, bool use24h)
    {
        var rows = new List<WorldClockRow>();
        DateTime utcNow = now.ToUniversalTime();
        foreach (string id in timeZoneIds.Take(Max))
        {
            WorldCity? city = Cities.FirstOrDefault(c => c.TimeZoneId == id);
            if (city is null || !TryFind(id, out TimeZoneInfo zone)) continue;
            DateTime there = TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone);
            rows.Add(new WorldClockRow(
                city.Label,
                there.ToString(use24h ? "HH:mm" : "hh:mm", CultureInfo.InvariantCulture),
                use24h ? "" : there.ToString("tt", CultureInfo.InvariantCulture),
                UtcLabel(zone.GetUtcOffset(utcNow)),
                (there.Date - now.Date).Days));
        }
        return rows;
    }

    /// <summary>"UTC", "UTC+1", "UTC-4", "UTC+5:30".</summary>
    public static string UtcLabel(TimeSpan offset)
    {
        if (offset == TimeSpan.Zero) return "UTC";
        string sign = offset < TimeSpan.Zero ? "-" : "+";
        TimeSpan abs = offset.Duration();
        return abs.Minutes == 0 ? $"UTC{sign}{abs.Hours}" : $"UTC{sign}{abs.Hours}:{abs.Minutes:00}";
    }

    private static bool TryFind(string id, out TimeZoneInfo zone)
    {
        try
        {
            zone = TimeZoneInfo.FindSystemTimeZoneById(id);
            return true;
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            zone = TimeZoneInfo.Utc;
            return false;
        }
    }
}
