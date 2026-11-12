using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace AuraTime.Desktop;

/// <summary>A place to show the weather for, picked by the user from a search.</summary>
public sealed record WeatherCity(string Name, string Region, double Latitude, double Longitude)
{
    [JsonIgnore]
    public string Display => string.IsNullOrEmpty(Region) ? Name : $"{Name}, {Region}";
}

/// <summary>
/// Current weather. <see cref="Condition"/> is one of the web app's keys: sunny, clear-night, cloudy, rainy, snowy,
/// stormy.
/// </summary>
public sealed record WeatherNow(double TempC, string Condition, string City);

/// <summary>
/// The current weather from Open-Meteo (free, no account, no key), the same service the web app uses. Coordinates
/// are rounded to about 1 km before they are sent. Only runs while the weather view is on and a city is chosen.
/// </summary>
public sealed class WeatherService : IDisposable
{
    private static readonly TimeSpan RefreshEvery = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan RetryAfterError = TimeSpan.FromMinutes(5);
    private const string ForecastUrl = "https://api.open-meteo.com/v1/forecast";
    private const string GeocodingUrl = "https://geocoding-api.open-meteo.com/v1/search";

    private static readonly HttpClient Http = CreateClient();

    private readonly object _lock = new();
    private System.Threading.Timer? _timer;
    private WeatherCity? _city;

    public WeatherNow? Latest { get; private set; }

    /// <summary>Starts, stops or re-targets the refreshes. Changing the city drops the old reading at once.</summary>
    public void Configure(bool enabled, WeatherCity? city)
    {
        lock (_lock)
        {
            bool active = enabled && city is not null;
            if (!active)
            {
                _timer?.Dispose();
                _timer = null;
                _city = null;
                Latest = null;
                return;
            }
            if (_timer is not null && city == _city) return;
            _city = city;
            Latest = null;
            _timer?.Dispose();
            _timer = new System.Threading.Timer(_ => _ = RefreshAsync(), null, TimeSpan.Zero, RefreshEvery);
        }
    }

    public void Dispose() => Configure(false, null);

    /// <summary>Reads the weather once (used by the --png command).</summary>
    public static async Task<WeatherNow?> FetchAsync(WeatherCity city, CancellationToken cancel = default)
    {
        string url = string.Create(CultureInfo.InvariantCulture,
            $"{ForecastUrl}?latitude={Round(city.Latitude)}&longitude={Round(city.Longitude)}&current=temperature_2m,weather_code,is_day&timezone=auto");
        ForecastResponse? response = await Http.GetFromJsonAsync<ForecastResponse>(url, cancel);
        if (response?.Current is not { } current) return null;
        return new WeatherNow(current.Temperature, ConditionFor(current.WeatherCode, current.IsDay == 1), city.Name);
    }

    /// <summary>Cities matching a name, best match first, with their region and country to tell them apart.</summary>
    public static async Task<IReadOnlyList<WeatherCity>> SearchAsync(string name, string language, CancellationToken cancel = default)
    {
        string url = $"{GeocodingUrl}?name={Uri.EscapeDataString(name.Trim())}&count=6&language={language}&format=json";
        GeocodingResponse? response = await Http.GetFromJsonAsync<GeocodingResponse>(url, cancel);
        return (response?.Results ?? [])
            .Where(r => !string.IsNullOrWhiteSpace(r.Name))
            .Select(r => new WeatherCity(
                r.Name!,
                string.Join(", ", new[] { r.Admin1, r.Country }.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct()),
                Math.Round(r.Latitude, 2),
                Math.Round(r.Longitude, 2)))
            .ToList();
    }

    /// <summary>WMO weather code to the web app's condition keys (weather.service.ts).</summary>
    public static string ConditionFor(int code, bool isDay) => code switch
    {
        0 => isDay ? "sunny" : "clear-night",
        1 or 2 or 3 or 45 or 48 => "cloudy",
        51 or 53 or 55 or 56 or 57 or 61 or 63 or 65 or 66 or 67 or 80 or 81 or 82 => "rainy",
        71 or 73 or 75 or 77 or 85 or 86 => "snowy",
        95 or 96 or 99 => "stormy",
        _ => isDay ? "sunny" : "clear-night"
    };

    private async Task RefreshAsync()
    {
        WeatherCity? city = _city;
        if (city is null) return;
        try
        {
            WeatherNow? now = await FetchAsync(city);
            lock (_lock)
            {
                if (city == _city) Latest = now;
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
        {
            // Offline or the service is down: keep the last reading and try again a little sooner.
            lock (_lock)
            {
                if (city == _city) _timer?.Change(RetryAfterError, RefreshEvery);
            }
        }
    }

    /// <summary>About 1 km: enough for the weather, and it does not tell the service exactly where you are.</summary>
    private static double Round(double coordinate) => Math.Round(coordinate, 2);

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("AuraTime-Desktop");
        return client;
    }

    private sealed class ForecastResponse
    {
        [JsonPropertyName("current")] public CurrentWeather? Current { get; set; }
    }

    private sealed class CurrentWeather
    {
        [JsonPropertyName("temperature_2m")] public double Temperature { get; set; }
        [JsonPropertyName("weather_code")] public int WeatherCode { get; set; }
        [JsonPropertyName("is_day")] public int IsDay { get; set; }
    }

    private sealed class GeocodingResponse
    {
        [JsonPropertyName("results")] public List<GeocodingResult>? Results { get; set; }
    }

    private sealed class GeocodingResult
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("latitude")] public double Latitude { get; set; }
        [JsonPropertyName("longitude")] public double Longitude { get; set; }
        [JsonPropertyName("admin1")] public string? Admin1 { get; set; }
        [JsonPropertyName("country")] public string? Country { get; set; }
    }
}
