using System.Globalization;
using SkiaSharp;

namespace AuraTime.Desktop.Render;

public sealed record DesignInfo(string Id, string Name, string Description);

/// <summary>
/// The colours a system design draws with, after the theme's defaults and the user's choices are merged.
/// Accent is the main colour (CPU), Secondary the second one (GPU), Alert what a hot temperature turns into.
/// </summary>
public sealed record SystemStyle(string Design, SKColor Accent, SKColor Secondary, SKColor Alert, int AlertTemp);

public static class SystemDesigns
{
    public const string DefaultId = "dashboard";
    public const int DefaultAlertTemp = 80;
    public const int MinAlertTemp = 50;
    public const int MaxAlertTemp = 100;

    public static readonly DesignInfo[] Catalog =
    [
        new("minimal", "Minimal", "Three big numbers and nothing else."),
        new("panel", "Full panel", "Everything at once, neatly in a grid."),
        new("gauges", "Gauges", "Two big dials for the CPU and the GPU."),
        new("bars", "Bars", "A list of meters, one line each."),
        new("graphs", "Graphs", "The last few minutes of load and network."),
        new("dashboard", "Dashboard", "Everything in cards over the whole screen: CPU, GPU, network, volume, time, memory and disk.")
    ];

    public static bool IsKnown(string? id) => Catalog.Any(d => d.Id == id);

    /// <summary>Designs that draw their own cards over the whole screen, instead of sitting inside the theme's big card.</summary>
    public static bool UsesWholeScreen(string? id) => id == "dashboard";

    /// <summary>The colours a design starts with on this theme, as "#RRGGBB".</summary>
    public static (string Accent, string Secondary, string Alert) DefaultColors(Theme theme) =>
        (Hex(theme.Accent), Hex(DefaultSecondary(theme)), Hex(DefaultAlert(theme)));

    /// <summary>The theme's colours, with the user's choices for this design on top.</summary>
    public static SystemStyle Resolve(Theme theme, string design, DesignColors? own)
    {
        static SKColor Pick(string? hex, SKColor fallback) => hex is not null && SKColor.TryParse(hex, out SKColor c) ? c : fallback;
        return new SystemStyle(
            IsKnown(design) ? design : DefaultId,
            Pick(own?.Accent, theme.Accent),
            Pick(own?.Secondary, DefaultSecondary(theme)),
            Pick(own?.Alert, DefaultAlert(theme)),
            own?.AlertTemp ?? DefaultAlertTemp);
    }

    public static string Hex(SKColor c) => $"#{c.Red:X2}{c.Green:X2}{c.Blue:X2}";

    // A cool second colour next to the theme's warm gold, so the CPU and the GPU are told apart at a glance.
    private static SKColor DefaultSecondary(Theme theme) => theme.IsLight ? SKColor.Parse("#0284C7") : SKColor.Parse("#7DD3FC");

    private static SKColor DefaultAlert(Theme theme) => theme.IsLight ? SKColor.Parse("#DC2626") : SKColor.Parse("#F87171");
}

/// <summary>
/// The five designs of the system view. The screen is 480x320 and the card leaves about 48..432 by 46..274
/// free; the anti burn-in shift moves everything a few pixels, so nothing is placed closer to the card's edge.
/// </summary>
public sealed partial class ScreenRenderer
{
    private const string Semibold = "inter-latin-600-normal.ttf";
    private const string Medium = "inter-latin-500-normal.ttf";

    private void DrawSystem(SystemSnapshot s, RenderOptions options, DateTime now)
    {
        switch (options.System.Design)
        {
            case "dashboard": DrawDashboard(s, options, now); break;
            case "minimal": DrawMinimal(s, options); break;
            case "gauges": DrawGauges(s, options); break;
            case "bars": DrawBars(s, options); break;
            case "graphs": DrawGraphs(s, options); break;
            default: DrawPanel(s, options); break;
        }
    }

    /* ------------------------------ 1. minimal ------------------------------ */

    /// <summary>CPU, GPU and RAM: one big number each, a small caption, a lot of space.</summary>
    private void DrawMinimal(SystemSnapshot s, RenderOptions o)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;
        using SKFont label = Font(Semibold, 13);
        using SKFont sub = Font(Medium, 12);

        float[] centres = [120, 240, 360];
        Big[] numbers = [TempOrLoad(s.CpuTemp, s.CpuLoad, st), TempOrLoad(s.GpuTemp, s.GpuLoad, st), new(RoundText(Fraction(s.RamUsedGb, s.RamTotalGb) * 100), "%", false)];
        string[] labels = ["CPU", "GPU", "RAM"];
        SKColor[] units = [st.Accent, st.Secondary, st.Accent];
        string[] subs =
        [
            s.CpuTemp is not null ? $"{PercentText(s.CpuLoad)} load" : s.CpuName,
            s.GpuTemp is not null ? $"{PercentText(s.GpuLoad)} load" : s.GpuName,
            GbText(s.RamUsedGb, s.RamTotalGb)
        ];

        for (int i = 0; i < 3; i++)
        {
            Text(labels[i], centres[i], 106, label, theme.Muted, SKTextAlign.Center, 2);
            BigValue(o, numbers[i], centres[i], 190, 108, 74, units[i]);
            Text(Ellipsize(subs[i], sub, 108), centres[i], 222, sub, theme.Muted, SKTextAlign.Center);
        }
        Rule(180, 100, 130, theme);
        Rule(300, 100, 130, theme);
    }

    /* ------------------------------ 2. full panel ------------------------------ */

    /// <summary>CPU and GPU on top with their numbers, memory, disk and network in a grid underneath.</summary>
    private void DrawPanel(SystemSnapshot s, RenderOptions o)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;

        PanelColumn(o, 48, "CPU", s.CpuName, s.CpuTemp, s.CpuLoad, s.CpuClockMhz, s.CpuPowerW, st.Accent);
        PanelColumn(o, 252, "GPU", s.GpuName, s.GpuTemp, s.GpuLoad, s.GpuClockMhz, s.GpuPowerW, st.Secondary);
        Rule(240, 56, 116, theme);
        using (var p = new SKPaint { Color = theme.Muted.WithAlpha(40) }) _canvas.DrawRect(48, 180, 384, 1, p);

        using SKFont label = Font(Semibold, 11);
        using SKFont value = Font(Medium, 12);
        PanelCell(o, 48, 202, "RAM", GbText(s.RamUsedGb, s.RamTotalGb), Fraction(s.RamUsedGb, s.RamTotalGb), st.Accent, label, value);
        PanelCell(o, 252, 202, "VRAM", GbText(s.VramUsedGb, s.VramTotalGb), Fraction(s.VramUsedGb, s.VramTotalGb), st.Secondary, label, value);
        string disk = s.DiskUsedPct is null ? "–" : s.DiskTemp is null ? PercentText(s.DiskUsedPct) : $"{PercentText(s.DiskUsedPct)}  ·  {TempText(s.DiskTemp)}";
        PanelCell(o, 48, 246, "DISK", disk, (s.DiskUsedPct ?? 0) / 100, st.Accent, label, value);

        Text("NET", 252, 246, label, theme.Muted, SKTextAlign.Left, 1.5f);
        NetSpeeds(o, s, 432, 246, value);
    }

    private void PanelColumn(RenderOptions o, float x0, string label, string name, float? temp, float? load, float? clockMhz, float? powerW, SKColor color)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;
        using SKFont labelFont = Font(Semibold, 12);
        using SKFont small = Font(Medium, 11);
        using SKFont loadFont = Font(Semibold, 22);

        Text(label, x0, 64, labelFont, color, SKTextAlign.Left, 2);
        Text(Ellipsize(name, small, 110), x0 + 180, 64, small, theme.Muted, SKTextAlign.Right);

        Big big = TempOrLoad(temp, load, st);
        BigValue(o, big, x0, 118, 100, 52, color, SKTextAlign.Left);
        if (temp is not null)
        {
            Text("LOAD", x0 + 180, 96, small, theme.Muted, SKTextAlign.Right, 1);
            Text(PercentText(load), x0 + 180, 118, loadFont, StrongText(theme), SKTextAlign.Right);
        }

        Meter(x0, 134, 180, 5, (load ?? 0) / 100, color, theme);
        Text(GhzText(clockMhz), x0, 158, small, theme.Muted);
        Text(WattText(powerW), x0 + 180, 158, small, theme.Muted, SKTextAlign.Right);
    }

    /// <summary>A label on the left, a value on the right, a thin bar under both.</summary>
    private void PanelCell(RenderOptions o, float x, float y, string label, string value, float fraction, SKColor color, SKFont labelFont, SKFont valueFont)
    {
        Text(label, x, y, labelFont, o.Theme.Muted, SKTextAlign.Left, 1.5f);
        Text(value, x + 180, y, valueFont, StrongText(o.Theme), SKTextAlign.Right);
        Meter(x, y + 8, 180, 4, fraction, color, o.Theme);
    }

    /// <summary>A down arrow and the download rate, an up arrow and the upload rate, ending at <paramref name="right"/>. The arrows are drawn: the font has none.</summary>
    private void NetSpeeds(RenderOptions o, SystemSnapshot s, float right, float baseline, SKFont font)
    {
        SKColor strong = StrongText(o.Theme);
        string up = RateText(s.NetUpBps);
        string down = RateText(s.NetDownBps);

        Text(up, right, baseline, font, strong, SKTextAlign.Right);
        float upLeft = right - font.MeasureText(up);
        Arrow(upLeft - 7, baseline - 4, 8, true, o.System.Secondary);

        float downRight = upLeft - 25;
        Text(down, downRight, baseline, font, strong, SKTextAlign.Right);
        Arrow(downRight - font.MeasureText(down) - 7, baseline - 4, 8, false, o.System.Accent);
    }

    /* ------------------------------ 3. gauges ------------------------------ */

    /// <summary>Two big dials: the arc is the load, the number in the middle is the temperature.</summary>
    private void DrawGauges(SystemSnapshot s, RenderOptions o)
    {
        SystemStyle st = o.System;
        GaugeColumn(o, 132, "CPU", s.CpuName, s.CpuTemp, s.CpuLoad, st.Accent, "RAM", s.RamUsedGb, s.RamTotalGb);
        GaugeColumn(o, 348, "GPU", s.GpuName, s.GpuTemp, s.GpuLoad, st.Secondary, "VRAM", s.VramUsedGb, s.VramTotalGb);
    }

    private void GaugeColumn(RenderOptions o, float cx, string label, string name, float? temp, float? load, SKColor color,
        string memoryLabel, float? memoryUsed, float? memoryTotal)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;
        using SKFont labelFont = Font(Semibold, 13);
        using SKFont small = Font(Medium, 12);
        const float cy = 138;

        Big big = TempOrLoad(temp, load, st);
        Dial(cx, cy, 74, 10, (load ?? 0) / 100, big.Hot ? st.Alert : color, theme);
        BigValue(o, big, cx, cy + 16, 100, 48, color);
        Text(temp is not null ? $"{PercentText(load)} load" : "load", cx, cy + 38, small, theme.Muted, SKTextAlign.Center);

        Text(label, cx, 205, labelFont, color, SKTextAlign.Center, 2);
        Text(Ellipsize(name, small, 190), cx, 223, small, theme.Muted, SKTextAlign.Center);

        Text($"{memoryLabel}  {GbText(memoryUsed, memoryTotal)}", cx, 247, small, StrongText(theme), SKTextAlign.Center);
        Meter(cx - 60, 254, 120, 4, Fraction(memoryUsed, memoryTotal), color, theme);
    }

    /* ------------------------------ 4. bars ------------------------------ */

    /// <summary>Six meters, one per line: CPU, GPU, RAM, VRAM, disk, network.</summary>
    private void DrawBars(SystemSnapshot s, RenderOptions o)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;
        using SKFont label = Font(Semibold, 12);
        using SKFont value = Font(Medium, 12);

        BarRow(o, 64, "CPU", (s.CpuLoad ?? 0) / 100, st.Accent, PercentText(s.CpuLoad), TempText(s.CpuTemp), s.CpuTemp >= st.AlertTemp, label, value);
        BarRow(o, 100, "GPU", (s.GpuLoad ?? 0) / 100, st.Secondary, PercentText(s.GpuLoad), TempText(s.GpuTemp), s.GpuTemp >= st.AlertTemp, label, value);
        BarRow(o, 136, "RAM", Fraction(s.RamUsedGb, s.RamTotalGb), st.Accent, GbText(s.RamUsedGb, s.RamTotalGb), PercentText(Fraction(s.RamUsedGb, s.RamTotalGb) * 100), false, label, value);
        BarRow(o, 172, "VRAM", Fraction(s.VramUsedGb, s.VramTotalGb), st.Secondary, GbText(s.VramUsedGb, s.VramTotalGb), PercentText(Fraction(s.VramUsedGb, s.VramTotalGb) * 100), false, label, value);
        BarRow(o, 208, "DISK", (s.DiskUsedPct ?? 0) / 100, st.Accent, PercentText(s.DiskUsedPct), TempText(s.DiskTemp), s.DiskTemp >= st.AlertTemp, label, value);

        // The network has no "full": the bar is the download against the fastest the last minutes saw.
        float peak = MathF.Max(1_000_000, s.History.NetDown.Where(v => !float.IsNaN(v)).DefaultIfEmpty(0).Max());
        BarRow(o, 244, "NET", Math.Clamp((s.NetDownBps ?? 0) / peak, 0, 1), st.Secondary, "", "", false, label, value);
        NetSpeeds(o, s, 432, 248, value);
    }

    private void BarRow(RenderOptions o, float y, string label, float fraction, SKColor color, string a, string b, bool bHot, SKFont labelFont, SKFont valueFont)
    {
        Theme theme = o.Theme;
        Text(label, 48, y + 4, labelFont, theme.Muted, SKTextAlign.Left, 1.5f);
        Meter(104, y - 3, 154, 8, fraction, color, theme);
        Text(a, 350, y + 4, valueFont, StrongText(theme), SKTextAlign.Right);
        Text(b, 432, y + 4, valueFont, bHot ? o.System.Alert : StrongText(theme), SKTextAlign.Right);
    }

    /* ------------------------------ 5. graphs ------------------------------ */

    /// <summary>CPU load, GPU load and download speed, each with its own history chart.</summary>
    private void DrawGraphs(SystemSnapshot s, RenderOptions o)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;
        using SKFont label = Font(Semibold, 12);
        using SKFont sub = Font(Medium, 11);

        GraphRow(o, 50, "CPU", s.CpuTemp is not null ? $"{PercentText(s.CpuLoad)} load" : s.CpuName,
            TempOrLoad(s.CpuTemp, s.CpuLoad, st), s.History.CpuLoad, 100, st.Accent, label, sub);
        GraphRow(o, 126, "GPU", s.GpuTemp is not null ? $"{PercentText(s.GpuLoad)} load" : s.GpuName,
            TempOrLoad(s.GpuTemp, s.GpuLoad, st), s.History.GpuLoad, 100, st.Secondary, label, sub);

        (string value, string unit) = RateParts(s.NetDownBps);
        float peak = MathF.Max(1_000_000, s.History.NetDown.Where(v => !float.IsNaN(v)).DefaultIfEmpty(0).Max());
        GraphRow(o, 202, "NET", $"up {RateText(s.NetUpBps)}", new Big(value, unit, false), s.History.NetDown, peak, StrongText(theme), label, sub, size: 30, unitScale: 0.42f);
    }

    private void GraphRow(RenderOptions o, float top, string label, string sub, Big big, float[] series, float max, SKColor color,
        SKFont labelFont, SKFont subFont, float size = 38, float unitScale = 1)
    {
        Theme theme = o.Theme;
        Text(label, 48, top + 14, labelFont, color, SKTextAlign.Left, 2);
        BigValue(o, big, 48, top + 50, 112, size, color, SKTextAlign.Left, unitScale);
        Text(Ellipsize(sub, subFont, 112), 48, top + 66, subFont, theme.Muted);
        Chart(new SKRect(172, top + 2, 432, top + 66), series, max, color, theme);
    }

    /* ------------------------------ 6. dashboard ------------------------------ */

    /// <summary>
    /// The whole screen in cards. Top: CPU and GPU with a load ring. Middle: network, volume, date and time.
    /// Bottom: memory, the logo, the system drive. Everything stays 12 px inside the screen so the anti burn-in
    /// shift (up to 6 px) never pushes a card off it.
    /// Rows: cards 12..140, strip 148..184, cards 192..308. The bottom cards are wider than the logo between them:
    /// "17.8 GB" and "78%" need the room on a 3.5" screen.
    /// </summary>
    private void DrawDashboard(SystemSnapshot s, RenderOptions o, DateTime now)
    {
        SystemStyle st = o.System;
        Theme theme = o.Theme;

        string vram = s.VramUsedGb is { } gb ? Inv($"{gb:0.0} GB") : "–";
        Card(o, new SKRect(12, 12, 236, 140), "CPU", s.CpuName, s.CpuLoad, st.Accent, compact: false,
            ("TEMP", TempText(s.CpuTemp), s.CpuTemp >= st.AlertTemp), ("SPEED", GhzText(s.CpuClockMhz), false));
        Card(o, new SKRect(244, 12, 468, 140), "GPU", s.GpuName, s.GpuLoad, st.Secondary, compact: false,
            ("TEMP", TempText(s.GpuTemp), s.GpuTemp >= st.AlertTemp), ("VRAM", vram, false));

        // Network, volume, date and time on one strip
        var strip = new SKRect(12, 148, 468, 184);
        Panel(strip, theme.Muted, theme);
        using (SKFont rate = Font(Semibold, 13))
        using (SKFont small = Font(Medium, 12))
        {
            SKColor strong = StrongText(theme);
            float y = strip.Top + 23;
            string down = RateText(s.NetDownBps);
            Arrow(28, y - 4, 8, false, st.Accent);
            Text(down, 38, y, rate, strong);
            float upArrow = 38 + rate.MeasureText(down) + 20;
            Arrow(upArrow, y - 4, 8, true, st.Secondary);
            Text(RateText(s.NetUpBps), upArrow + 10, y, rate, strong);

            Speaker(228, strip.MidY, st.Accent, s.Muted);
            Text(s.VolumePct is null || s.Muted ? "–" : PercentText(s.VolumePct), 250, y, rate, strong);

            string suffix = o.Use24h ? "" : now.ToString("tt", CultureInfo.InvariantCulture);
            DrawTimeWithSuffix(theme, o.Font, now.ToString(o.Use24h ? "HH:mm" : "hh:mm", CultureInfo.InvariantCulture), suffix, 456, strip.Top + 27, 92, 24, 11, alignRight: true);
            Text(now.ToString("d", o.Culture), 360, y - 1, small, theme.Muted, SKTextAlign.Right);
        }

        // Memory, logo, system drive
        float ram = Fraction(s.RamUsedGb, s.RamTotalGb);
        Card(o, new SKRect(12, 192, 188, 308), "RAM", "", ram * 100, st.Accent, compact: true,
            ("USED", s.RamUsedGb is { } used ? Inv($"{used:0.0} GB") : "–", false),
            ("TOTAL", s.RamTotalGb is { } total ? Inv($"{MathF.Round(total)} GB") : "–", false));
        Logo(240, 240, 22, o);
        Card(o, new SKRect(292, 192, 468, 308), "DISK", s.DiskName, s.DiskUsedPct, st.Secondary, compact: true,
            ("TEMP", TempText(s.DiskTemp), s.DiskTemp >= st.AlertTemp),
            ("FREE", s.DiskUsedPct is { } du ? PercentText(100 - du) : "–", false));
    }

    /// <summary>
    /// One component's card: its name, a load ring with the percentage in the middle, and two labelled values beside
    /// it. Everything is placed from the ring's centre, which sits in the middle of the space under the title, so the
    /// values keep their distance from the card's edges whatever its height. <paramref name="compact"/> is the
    /// smaller ring and text of the bottom row.
    /// </summary>
    private void Card(RenderOptions o, SKRect r, string title, string name, float? load, SKColor color, bool compact,
        (string Label, string Value, bool Hot) first, (string Label, string Value, bool Hot) second)
    {
        Theme theme = o.Theme;
        Panel(r, color, theme);
        float radius = compact ? 28 : 36;
        float stroke = compact ? 7 : 9;
        using SKFont titleFont = Font(Semibold, 13);
        using SKFont small = Font(Medium, 12);
        using SKFont tiny = Font(Semibold, 11);
        using SKFont value = Font(Semibold, compact ? 16 : 18);

        Text(title, r.Left + 14, r.Top + 22, titleFont, color, SKTextAlign.Left, 2);
        float titleWidth = titleFont.MeasureText(title) + 2 * title.Length;
        if (name.Length > 0) Text(Ellipsize(name, small, r.Width - 28 - titleWidth - 12), r.Right - 14, r.Top + 22, small, theme.Muted, SKTextAlign.Right);

        float cx = r.Left + 14 + radius + 2;
        float cy = r.Top + 30 + (r.Height - 30) / 2;
        Ring(cx, cy, radius, stroke, (load ?? 0) / 100, color, theme);
        // The number fits inside the ring, the "%" smaller beside it, so neither touches the ring.
        var big = new Big(load is null ? "–" : RoundText(load.Value), load is null ? "" : "%", false);
        BigValue(o, big, cx, cy + (compact ? 7 : 5), 2 * (radius - stroke) - 6, compact ? 20 : 26, color, SKTextAlign.Center, 0.5f);
        if (!compact) Text("LOAD", cx, cy + 21, tiny, theme.Muted, SKTextAlign.Center, 1);

        float x = cx + radius + (compact ? 14 : 18);
        float width = r.Right - 12 - x;
        float labelY = cy - (compact ? 22 : 26);
        float valueStep = compact ? 17 : 20;
        float rowStep = compact ? 34 : 40;
        foreach ((string Label, string Value, bool Hot) item in new[] { first, second })
        {
            Text(item.Label, x, labelY, tiny, theme.Muted, SKTextAlign.Left, 1);
            Text(Ellipsize(item.Value, value, width), x, labelY + valueStep, value, item.Hot ? o.System.Alert : StrongText(theme));
            labelY += rowStep;
        }
    }

    /// <summary>A rounded card: a soft fill that keeps the text readable on any theme, and a coloured border.</summary>
    private void Panel(SKRect rect, SKColor border, Theme theme)
    {
        using var paint = new SKPaint { IsAntialias = true, Color = theme.IsLight ? SKColors.White.WithAlpha(140) : SKColors.Black.WithAlpha(70) };
        _canvas.DrawRoundRect(rect, 14, 14, paint);
        paint.Style = SKPaintStyle.Stroke;
        paint.StrokeWidth = 1.5f;
        paint.Color = border.WithAlpha(150);
        _canvas.DrawRoundRect(new SKRect(rect.Left + 0.75f, rect.Top + 0.75f, rect.Right - 0.75f, rect.Bottom - 0.75f), 14, 14, paint);
    }

    /// <summary>A full ring that starts at the top and fills clockwise.</summary>
    private void Ring(float cx, float cy, float radius, float stroke, float fraction, SKColor color, Theme theme)
    {
        using var paint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = stroke, Color = theme.Muted.WithAlpha(56) };
        _canvas.DrawCircle(cx, cy, radius, paint);
        float sweep = 360 * Math.Clamp(fraction, 0, 1);
        if (sweep < 1) return;
        paint.StrokeCap = SKStrokeCap.Round;
        paint.Color = color;
        _canvas.DrawArc(new SKRect(cx - radius, cy - radius, cx + radius, cy + radius), -90, sweep, false, paint);
    }

    /// <summary>The AuraTime clock mark (the site's icon) with its name under it.</summary>
    private void Logo(float cx, float cy, float radius, RenderOptions o)
    {
        float k = radius / 28f;
        using var paint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
        paint.StrokeWidth = 2.5f * k;
        paint.Color = o.System.Accent;
        _canvas.DrawCircle(cx, cy, radius, paint);
        paint.StrokeWidth = 3f * k;
        paint.Color = StrongText(o.Theme);
        _canvas.DrawLine(cx, cy, cx, cy - 14 * k, paint);
        paint.StrokeWidth = 2.5f * k;
        paint.Color = o.System.Accent;
        _canvas.DrawLine(cx, cy, cx + 12 * k, cy + 6 * k, paint);
        paint.Style = SKPaintStyle.Fill;
        _canvas.DrawCircle(cx, cy, 2.5f * k, paint);

        using SKFont name = Font(Semibold, 10);
        Text("AURATIME", cx, cy + radius + 22, name, o.Theme.Muted, SKTextAlign.Center, 2);
    }

    /// <summary>A small speaker with sound waves, or a cross when muted. The font has no such symbol.</summary>
    private void Speaker(float x, float cy, SKColor color, bool muted)
    {
        using var fill = new SKPaint { IsAntialias = true, Color = color };
        using var builder = new SKPathBuilder();
        builder.MoveTo(x, cy - 3.5f);
        builder.LineTo(x + 4, cy - 3.5f);
        builder.LineTo(x + 9, cy - 8);
        builder.LineTo(x + 9, cy + 8);
        builder.LineTo(x + 4, cy + 3.5f);
        builder.LineTo(x, cy + 3.5f);
        builder.Close();
        using SKPath body = builder.Detach();
        _canvas.DrawPath(body, fill);

        using var stroke = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 1.6f, StrokeCap = SKStrokeCap.Round, Color = color };
        if (muted)
        {
            _canvas.DrawLine(x + 13, cy - 4, x + 20, cy + 4, stroke);
            _canvas.DrawLine(x + 13, cy + 4, x + 20, cy - 4, stroke);
            return;
        }
        _canvas.DrawArc(new SKRect(x + 4, cy - 5, x + 14, cy + 5), -50, 100, false, stroke);
        _canvas.DrawArc(new SKRect(x + 1, cy - 9, x + 17, cy + 9), -50, 100, false, stroke);
    }

    /* ------------------------------ shared pieces ------------------------------ */

    /// <summary>A big reading: the temperature, or the load when the temperature cannot be read (CPU without admin rights).</summary>
    private readonly record struct Big(string Value, string Unit, bool Hot);

    private static Big TempOrLoad(float? temp, float? load, SystemStyle st) =>
        temp is { } t ? new Big(RoundText(t), "°", t >= st.AlertTemp)
        : load is { } l ? new Big(RoundText(l), "%", false)
        : new Big("–", "", false);

    private SKFont Font(string file, float size) => new(Typeface(file), size);

    /// <summary>Text with CSS-like letter spacing, positioned by its left edge, centre or right edge.</summary>
    private void Text(string text, float x, float baseline, SKFont font, SKColor color, SKTextAlign align = SKTextAlign.Left, float spacing = 0)
    {
        using var paint = new SKPaint { IsAntialias = true, Color = color };
        if (spacing == 0)
        {
            _canvas.DrawText(text, x, baseline, align, font, paint);
            return;
        }
        float total = font.MeasureText(text) + spacing * text.Length;
        float start = align == SKTextAlign.Center ? x - total / 2 : align == SKTextAlign.Right ? x - total : x;
        DrawSpacedText(text, start, baseline, font, paint, spacing);
    }

    /// <summary>
    /// A big number in the clock font with its unit in <paramref name="unitColor"/>, shrunk to fit. A hot temperature
    /// is drawn in the alert colour instead of the theme's. With <paramref name="unitScale"/> below 1 the unit is
    /// drawn smaller, in the body font, with a small gap (for units that are words: "MB/s").
    /// </summary>
    private void BigValue(RenderOptions o, Big big, float x, float baseline, float maxWidth, float size, SKColor unitColor,
        SKTextAlign align = SKTextAlign.Center, float unitScale = 1)
    {
        bool small = unitScale < 1;
        // A word ("MB/s") keeps a space from the number; a small "%" sits right against it.
        float gap = small ? (big.Unit == "%" ? 1.5f : 4) : 0;
        using SKFont font = Font(o.Font.File, size);
        using SKFont smallFont = Font(Semibold, size * unitScale);
        SKFont unitFont = small ? smallFont : font;
        float Total() => font.MeasureText(big.Value) + (big.Unit.Length > 0 ? gap + unitFont.MeasureText(big.Unit) : 0);
        while (font.Size > 12 && Total() > maxWidth)
        {
            font.Size -= 2;
            smallFont.Size = font.Size * unitScale;
        }
        float valueWidth = font.MeasureText(big.Value);
        float start = align == SKTextAlign.Center ? x - Total() / 2 : x;

        using var paint = new SKPaint { IsAntialias = true };
        FillText(big.Hot ? [o.System.Alert] : o.Theme.Primary, big.Value, start, baseline, valueWidth, font, paint);
        paint.Shader = null;
        paint.Color = big.Hot ? o.System.Alert : unitColor;
        _canvas.DrawText(big.Unit, start + valueWidth + gap, baseline, SKTextAlign.Left, unitFont, paint);
    }

    /// <summary>A thin vertical divider.</summary>
    private void Rule(float x, float y, float height, Theme theme)
    {
        using var paint = new SKPaint { Color = theme.Muted.WithAlpha(40) };
        _canvas.DrawRect(x, y, 1, height, paint);
    }

    /// <summary>Rounded track with a coloured fill for the given fraction (0..1).</summary>
    private void Meter(float x, float y, float width, float height, float fraction, SKColor color, Theme theme)
    {
        using var paint = new SKPaint { IsAntialias = true, Color = theme.Muted.WithAlpha(56) };
        _canvas.DrawRoundRect(new SKRect(x, y, x + width, y + height), height / 2, height / 2, paint);
        if (fraction <= 0.005f) return;
        float fill = MathF.Max(width * Math.Clamp(fraction, 0, 1), height); // never thinner than the bar is tall
        paint.Color = color;
        _canvas.DrawRoundRect(new SKRect(x, y, x + fill, y + height), height / 2, height / 2, paint);
    }

    /// <summary>A 270 degree dial open at the bottom, filled for the given fraction.</summary>
    private void Dial(float cx, float cy, float radius, float stroke, float fraction, SKColor color, Theme theme)
    {
        var box = new SKRect(cx - radius, cy - radius, cx + radius, cy + radius);
        using var paint = new SKPaint
        {
            IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = stroke, StrokeCap = SKStrokeCap.Round,
            Color = theme.Muted.WithAlpha(56)
        };
        _canvas.DrawArc(box, 135, 270, false, paint);
        float sweep = 270 * Math.Clamp(fraction, 0, 1);
        if (sweep < 1) sweep = 1; // an empty dial still shows where it starts
        paint.Color = color;
        _canvas.DrawArc(box, 135, sweep, false, paint);
    }

    /// <summary>A small filled triangle pointing up or down.</summary>
    private void Arrow(float cx, float cy, float size, bool up, SKColor color)
    {
        float h = size / 2;
        using var builder = new SKPathBuilder();
        if (up)
        {
            builder.MoveTo(cx, cy - h);
            builder.LineTo(cx + h, cy + h);
            builder.LineTo(cx - h, cy + h);
        }
        else
        {
            builder.MoveTo(cx, cy + h);
            builder.LineTo(cx + h, cy - h);
            builder.LineTo(cx - h, cy - h);
        }
        builder.Close();
        using SKPath path = builder.Detach();
        using var paint = new SKPaint { IsAntialias = true, Color = color };
        _canvas.DrawPath(path, paint);
    }

    /// <summary>
    /// A history chart: the newest reading at the right edge, a faint middle line, a filled area under the line.
    /// Missing readings (NaN) leave a gap in time but no jump in the line.
    /// </summary>
    private void Chart(SKRect box, float[] series, float max, SKColor color, Theme theme)
    {
        using var paint = new SKPaint { IsAntialias = true, Color = theme.Muted.WithAlpha(22) };
        _canvas.DrawRoundRect(box, 7, 7, paint);

        _canvas.Save();
        _canvas.ClipRoundRect(new SKRoundRect(box, 7, 7), SKClipOperation.Intersect, true);
        paint.Color = theme.Muted.WithAlpha(40);
        _canvas.DrawRect(box.Left, box.MidY, box.Width, 1, paint);

        float step = box.Width / (SystemSensors.HistoryLength - 1);
        var points = new List<SKPoint>();
        for (int i = 0; i < series.Length; i++)
        {
            if (float.IsNaN(series[i])) continue;
            float x = box.Right - (series.Length - 1 - i) * step;
            float y = box.Bottom - 3 - Math.Clamp(series[i] / MathF.Max(max, 1), 0, 1) * (box.Height - 8);
            points.Add(new SKPoint(x, y));
        }
        if (points.Count >= 2)
        {
            using var line = new SKPathBuilder();
            line.MoveTo(points[0]);
            for (int i = 1; i < points.Count; i++) line.LineTo(points[i]);
            using SKPath linePath = line.Detach();

            using var area = new SKPathBuilder();
            area.MoveTo(points[0].X, box.Bottom);
            foreach (SKPoint p in points) area.LineTo(p);
            area.LineTo(points[^1].X, box.Bottom);
            area.Close();
            using SKPath areaPath = area.Detach();

            using SKShader fade = SKShader.CreateLinearGradient(
                new SKPoint(0, box.Top), new SKPoint(0, box.Bottom), [color.WithAlpha(90), color.WithAlpha(0)], SKShaderTileMode.Clamp);
            paint.Shader = fade;
            _canvas.DrawPath(areaPath, paint);

            paint.Shader = null;
            paint.Style = SKPaintStyle.Stroke;
            paint.StrokeWidth = 2;
            paint.StrokeJoin = SKStrokeJoin.Round;
            paint.StrokeCap = SKStrokeCap.Round;
            paint.Color = color;
            _canvas.DrawPath(linePath, paint);
        }
        _canvas.Restore();
    }

    /* ------------------------------ number formatting ------------------------------ */

    private static string Inv(FormattableString text) => FormattableString.Invariant(text);

    private static string RoundText(float value) => Inv($"{MathF.Round(value)}");

    private static string PercentText(float? value) => value is null ? "–" : Inv($"{MathF.Round(value.Value)}%");

    private static string TempText(float? value) => value is null ? "–" : Inv($"{MathF.Round(value.Value)}°");

    private static string GhzText(float? mhz) => mhz is null ? "–" : Inv($"{mhz.Value / 1000:0.0} GHz");

    private static string WattText(float? watts) => watts is null ? "–" : Inv($"{MathF.Round(watts.Value)} W");

    private static string GbText(float? used, float? total) =>
        used is null || total is null ? "–" : total >= 10 ? Inv($"{used:0.0} / {total:0} GB") : Inv($"{used:0.0} / {total:0.0} GB");

    private static float Fraction(float? used, float? total) => used is null || total is not > 0 ? 0 : Math.Clamp(used.Value / total.Value, 0, 1);

    private static string RateText(float? bytesPerSecond)
    {
        (string value, string unit) = RateParts(bytesPerSecond);
        return unit.Length == 0 ? value : $"{value} {unit}";
    }

    /// <summary>"4.2" and "MB/s" for 4 200 000 bytes per second.</summary>
    private static (string Value, string Unit) RateParts(float? bytesPerSecond)
    {
        if (bytesPerSecond is not { } v) return ("–", "");
        if (v >= 1_000_000_000) return (Inv($"{v / 1_000_000_000:0.0}"), "GB/s");
        if (v >= 1_000_000) return (Inv($"{v / 1_000_000:0.0}"), "MB/s");
        if (v >= 1_000) return (Inv($"{v / 1_000:0}"), "KB/s");
        return (Inv($"{v:0}"), "B/s");
    }
}
