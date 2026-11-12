using System.Globalization;
using System.Text.Json;

namespace AuraTime.Desktop.Render;

/// <summary>
/// The texts the screen draws, in the user's Windows language. They come from the web app's own translation files
/// (public/assets/i18n/*.json, embedded at build time), so the two always say the same thing.
/// </summary>
public sealed class ScreenText
{
    private static readonly string[] Languages = ["en", "pt", "es", "fr", "de", "it"];

    private readonly JsonElement _root;

    private ScreenText(JsonElement root, string language)
    {
        _root = root;
        Language = language;
    }

    /// <summary>Two-letter code of the language in use ("pt", "en"...).</summary>
    public string Language { get; }

    public static ScreenText ForCurrentCulture()
    {
        string language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        if (!Languages.Contains(language)) language = "en";
        using Stream stream = typeof(ScreenText).Assembly.GetManifestResourceStream($"i18n.{language}.json")
            ?? throw new InvalidOperationException($"Missing translation file for '{language}'.");
        using JsonDocument document = JsonDocument.Parse(stream);
        return new ScreenText(document.RootElement.Clone(), language);
    }

    public string WorldClocks => Get("SCREEN.LABELS.WORLD_CLOCKS");

    /// <summary>"Clear sky", "Rain"... for a <see cref="WeatherNow.Condition"/>.</summary>
    public string WeatherCondition(string condition) => Get(condition switch
    {
        "clear-night" => "SCREEN.WEATHER.CLEAR_NIGHT",
        "cloudy" => "SCREEN.WEATHER.CLOUDY",
        "rainy" => "SCREEN.WEATHER.RAINY",
        "snowy" => "SCREEN.WEATHER.SNOWY",
        "stormy" => "SCREEN.WEATHER.STORMY",
        _ => "SCREEN.WEATHER.SUNNY"
    });

    /// <summary>The translation at a dotted path, or the path itself when it is missing (easy to spot).</summary>
    private string Get(string path)
    {
        JsonElement node = _root;
        foreach (string key in path.Split('.'))
        {
            if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(key, out node)) return path;
        }
        return node.ValueKind == JsonValueKind.String ? node.GetString()! : path;
    }
}

public sealed record Quote(string Text, string Author);

/// <summary>The quote of the day, from the same list as the web app's dashboard (dashboard.service.ts).</summary>
public static class Quotes
{
    private static readonly Quote[] All =
    [
        new("We suffer more often in imagination than in reality.", "Seneca"),
        new("You have power over your mind - not outside events. Realize this, and you will find strength.", "Marcus Aurelius"),
        new("Simplicity is the ultimate sophistication.", "Leonardo da Vinci"),
        new("Focus is a muscle. The more you protect it, the sharper it becomes.", "Anonymous"),
        new("Do not wait; the time will never be 'just right'.", "Napoleon Hill"),
        new("Deep work is the superpower of the 21st century.", "Cal Newport"),
        new("Waste no more time arguing what a good person should be. Be one.", "Marcus Aurelius"),
        new("It is not that we have a short time to live, but that we waste a lot of it.", "Seneca")
    ];

    public static Quote ForDay(DateTime day) => All[day.DayOfYear % All.Length];
}
