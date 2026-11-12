using SkiaSharp;

namespace AuraTime.Desktop.Render;

public sealed record Glow(SKColor Color, float Alpha, bool TopLeft);

/// <summary>
/// Colours of one theme. Ported from the web app (src/app/services/screen/theme-tokens.ts): keep the two in step.
/// </summary>
public sealed record Theme(
    string Id,
    string Name,
    bool IsLight,
    float AngleDeg,
    SKColor[] BackgroundStops,
    Glow[] Glows,
    SKColor CardFill,
    float CardFillAlpha,
    SKColor CardBorder,
    float CardBorderAlpha,
    SKColor[] Primary,
    SKColor Accent,
    SKColor Muted);

public sealed record ClockFont(string Id, string Name, string File, bool Italic);

public static class Themes
{
    public const string DefaultId = "emerald-gold";

    private static SKColor C(string hex) => SKColor.Parse(hex);

    public static readonly Theme[] All =
    [
        new("emerald-gold", "Emerald Gold", false, 135,
            [C("#052211"), C("#000000"), C("#011409")],
            [new(C("#0A3B1F"), 0.2f, true), new(C("#D4AF37"), 0.1f, false)],
            C("#07170d"), 0.6f, C("#D4AF37"), 0.25f,
            [C("#D4AF37"), C("#FFFFFF"), C("#E5E4E2")], C("#D4AF37"), C("#9ca3af")),

        new("liquid-glass", "Liquid Glass", false, 45,
            [C("#1e1b4b"), C("#020617"), C("#2e1065")],
            [new(C("#0891b2"), 0.2f, true), new(C("#9333ea"), 0.2f, false)],
            C("#FFFFFF"), 0.03f, C("#FFFFFF"), 0.1f,
            [C("#FFFFFF")], C("#D4AF37"), C("#9ca3af")),

        new("obsidian-platinum", "Obsidian Platinum", false, 180,
            [C("#000000"), C("#000000"), C("#000000")],
            [],
            C("#09090b"), 0.4f, C("#18181b"), 0.8f,
            [C("#FFFFFF"), C("#a1a1aa"), C("#52525b")], C("#D4AF37"), C("#9ca3af")),

        new("dark-glass", "Dark Glass", false, 45,
            [C("#18181b"), C("#0a0a0a"), C("#1c1917")],
            [],
            C("#FFFFFF"), 0.02f, C("#FFFFFF"), 0.05f,
            [C("#FFFFFF")], C("#D4AF37"), C("#9ca3af")),

        new("light-glass", "Light Glass", true, 45,
            [C("#e5e7eb"), C("#f1f5f9"), C("#d1d5db")],
            [],
            C("#FFFFFF"), 0.65f, C("#FFFFFF"), 0.8f,
            [C("#1e293b")], C("#64748b"), C("#64748b"))
    ];

    public static Theme Resolve(string? id) => All.FirstOrDefault(t => t.Id == id) ?? All[0];
}

public static class ClockFonts
{
    public const string DefaultId = "outfit";

    public static readonly ClockFont[] All =
    [
        new("outfit", "Outfit", "outfit-latin-500-normal.ttf", false),
        new("orbitron", "Orbitron", "orbitron-latin-700-normal.ttf", false),
        new("inter", "Inter", "inter-latin-300-normal.ttf", false),
        new("playfair", "Playfair Display", "playfair-display-latin-400-italic.ttf", true)
    ];

    public static ClockFont Resolve(string? id) => All.FirstOrDefault(f => f.Id == id) ?? All[0];
}
