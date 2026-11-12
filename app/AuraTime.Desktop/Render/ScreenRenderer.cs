using System.Globalization;
using AuraTime.Desktop.Display;
using SkiaSharp;

namespace AuraTime.Desktop.Render;

public enum ScreenView
{
    Clock,
    System,
    Weather,
    World
}

public sealed record RenderOptions(Theme Theme, ClockFont Font, bool Use24h, CultureInfo Culture, ScreenText Text, SystemStyle System);

/// <summary>Everything the views show besides the time.</summary>
public sealed record ScreenData(SystemSnapshot System, WeatherNow? Weather, IReadOnlyList<WorldClockRow> WorldClocks)
{
    public static readonly ScreenData Empty = new(SystemSnapshot.Empty, null, []);
}

/// <summary>
/// Draws the 480x320 screen. Ported from the web app's canvas renderer (src/app/services/screen/screen-renderer.ts):
/// the clock, weather and world clock views come from there, the system view (PC sensors, five designs in SystemDesigns.cs) exists only here.
/// </summary>
public sealed partial class ScreenRenderer : IDisposable
{
    private const int W = TuringProtocol.ScreenWidth;
    private const int H = TuringProtocol.ScreenHeight;
    private const float CardInset = 20;
    private const float CardRadius = 28;

    private readonly SKBitmap _bitmap = new(new SKImageInfo(W, H, SKColorType.Rgba8888, SKAlphaType.Premul));
    private readonly SKCanvas _canvas;
    private readonly Dictionary<string, SKTypeface> _typefaces = [];

    public ScreenRenderer()
    {
        _canvas = new SKCanvas(_bitmap);
    }

    /// <summary>The last frame drawn. Owned by the renderer: copy it to keep it.</summary>
    public SKBitmap Bitmap => _bitmap;

    public void Draw(DateTime now, RenderOptions options, ScreenView view, ScreenData data)
    {
        Theme theme = options.Theme;
        DrawBackground(theme);

        _canvas.Save();
        (int shiftX, int shiftY) = PixelShift(now);
        _canvas.Translate(shiftX, shiftY);
        DrawCard(theme);
        // A view without its data falls back to the clock, as in the web app.
        switch (view)
        {
            case ScreenView.System:
                DrawSystem(data.System, options);
                break;
            case ScreenView.Weather when data.Weather is not null:
                DrawWeather(now, data.Weather, options);
                break;
            case ScreenView.World when data.WorldClocks.Count > 0:
                DrawWorld(data.WorldClocks, options);
                break;
            default:
                DrawClock(now, options);
                break;
        }
        _canvas.Restore();
    }

    /// <summary>The frame as RGB565, the display's pixel format.</summary>
    public void CopyRgb565(ushort[] output) => TuringProtocol.RgbaToRgb565(_bitmap.GetPixelSpan(), output);

    public void Dispose()
    {
        _canvas.Dispose();
        _bitmap.Dispose();
        foreach (SKTypeface typeface in _typefaces.Values) typeface.Dispose();
    }

    /// <summary>Small deterministic offset that changes every minute, so static pixels move (anti burn-in).</summary>
    public static (int X, int Y) PixelShift(DateTime now)
    {
        int minuteOfDay = now.Hour * 60 + now.Minute;
        return ((int)Math.Round(Math.Sin(minuteOfDay * 0.7) * 6), (int)Math.Round(Math.Cos(minuteOfDay * 0.5) * 5));
    }

    /* ------------------------------ views ------------------------------ */

    private void DrawClock(DateTime now, RenderOptions options)
    {
        Theme theme = options.Theme;
        const float cx = W / 2f;

        using var paint = new SKPaint { IsAntialias = true };
        using var labelFont = new SKFont(Typeface("inter-latin-500-normal.ttf"), 15);
        paint.Color = theme.Accent;
        DrawCentredText(DateLabel(now, options.Culture).ToUpper(options.Culture), cx, 70, labelFont, paint, 2);

        // Time (+ small AM/PM), centred together, shrunk to fit the card
        const float baseline = 190;
        string time = now.ToString(options.Use24h ? "HH:mm" : "hh:mm", CultureInfo.InvariantCulture);
        string suffix = options.Use24h ? "" : now.ToString("tt", CultureInfo.InvariantCulture);
        DrawTimeWithSuffix(theme, options.Font, time, suffix, cx, baseline, 360, 128);

        // Seconds progress line
        const float lineW = 300;
        float lx = cx - lineW / 2;
        float ly = baseline + 24;
        paint.Color = theme.Muted.WithAlpha(64);
        _canvas.DrawRect(lx, ly, lineW, 2, paint);
        paint.Color = theme.Accent;
        _canvas.DrawRect(lx, ly, MathF.Round(lineW * now.Second / 59), 2, paint);
    }

    /// <summary>Weather icon and temperature, the condition and the city, then the quote of the day.</summary>
    private void DrawWeather(DateTime now, WeatherNow weather, RenderOptions options)
    {
        Theme theme = options.Theme;
        const float cx = W / 2f;
        using var paint = new SKPaint { IsAntialias = true };

        // Icon + temperature, centred together
        string temp = $"{Math.Round(weather.TempC).ToString(CultureInfo.InvariantCulture)}°";
        using var tempFont = new SKFont(Typeface(options.Font.File), 92);
        while (tempFont.Size > 12 && tempFont.MeasureText(temp) > 200) tempFont.Size -= 2;
        float tempWidth = tempFont.MeasureText(temp);
        const float iconSize = 58;
        const float gap = 18;
        float startX = cx - (tempWidth + gap + iconSize) / 2;
        DrawWeatherIcon(weather.Condition, startX + iconSize / 2, 106, iconSize, theme);
        FillText(theme.Primary, temp, startX + iconSize + gap, 128, tempWidth, tempFont, paint);

        using var conditionFont = new SKFont(Typeface("inter-latin-600-normal.ttf"), 16);
        using var cityFont = new SKFont(Typeface("inter-latin-500-normal.ttf"), 13);
        paint.Color = theme.Accent;
        DrawCentredText(options.Text.WeatherCondition(weather.Condition).ToUpper(options.Culture), cx, 160, conditionFont, paint, 2);
        paint.Color = theme.Muted;
        DrawCentredText(weather.City.ToUpper(options.Culture), cx, 182, cityFont, paint, 2);

        // Quote of the day
        paint.Color = theme.Muted.WithAlpha(64);
        _canvas.DrawRect(cx - 30, 200, 60, 1, paint);
        Quote quote = Quotes.ForDay(now);
        using var quoteFont = new SKFont(Typeface("inter-latin-400-italic.ttf"), 15);
        using var authorFont = new SKFont(Typeface("inter-latin-500-normal.ttf"), 12);
        paint.Color = theme.Muted;
        List<string> lines = WrapText($"“{quote.Text}”", quoteFont, 360, 2);
        for (int i = 0; i < lines.Count; i++) _canvas.DrawText(lines[i], cx, 226 + i * 21, SKTextAlign.Center, quoteFont, paint);
        paint.Color = theme.Accent;
        _canvas.DrawText($"— {quote.Author}", cx, 226 + lines.Count * 21 + 8, SKTextAlign.Center, authorFont, paint);
    }

    /// <summary>Up to three cities: name and UTC offset on the left, their time on the right.</summary>
    private void DrawWorld(IReadOnlyList<WorldClockRow> clocks, RenderOptions options)
    {
        Theme theme = options.Theme;
        using var paint = new SKPaint { IsAntialias = true };
        using var headerFont = new SKFont(Typeface("inter-latin-600-normal.ttf"), 15);
        using var nameFont = new SKFont(Typeface("inter-latin-600-normal.ttf"), 22);
        using var offsetFont = new SKFont(Typeface("inter-latin-500-normal.ttf"), 13);

        paint.Color = theme.Accent;
        DrawCentredText(options.Text.WorldClocks.ToUpper(options.Culture), W / 2f, 58, headerFont, paint, 3);

        const float left = 64;
        const float right = W - 64;
        const float pitch = 66;
        float top0 = 76 + (WorldClocks.Max - clocks.Count) * pitch / 2;

        for (int i = 0; i < clocks.Count; i++)
        {
            WorldClockRow clock = clocks[i];
            float top = top0 + i * pitch;
            if (i > 0)
            {
                paint.Color = theme.Muted.WithAlpha(51);
                _canvas.DrawRect(left, top, right - left, 1, paint);
            }

            paint.Color = StrongText(theme);
            _canvas.DrawText(Ellipsize(clock.Label, nameFont, 190), left, top + 31, SKTextAlign.Left, nameFont, paint);

            string day = clock.DayOffset == 0 ? "" : $"  ·  {(clock.DayOffset > 0 ? "+" : "")}{clock.DayOffset}d";
            paint.Color = theme.Muted;
            DrawSpacedText($"{clock.Utc}{day}", left, top + 52, offsetFont, paint, 1);

            DrawTimeWithSuffix(theme, options.Font, clock.Time, clock.AmPm, right, top + 48, 190, 46, 15, alignRight: true);
        }
    }

    /// <summary>
    /// Big digits (shrunk to fit) with a small AM/PM after them, centred on <paramref name="anchorX"/> or, with
    /// <paramref name="alignRight"/>, ending there.
    /// </summary>
    private void DrawTimeWithSuffix(
        Theme theme, ClockFont clockFont, string text, string suffix, float anchorX, float baseline, float maxWidth, float maxSize,
        float suffixPx = 22, bool alignRight = false)
    {
        using var paint = new SKPaint { IsAntialias = true };
        using var suffixFont = new SKFont(Typeface("inter-latin-600-normal.ttf"), suffixPx);
        float suffixWidth = suffix.Length > 0 ? suffixFont.MeasureText(suffix) + 10 : 0;

        // Largest size (<= max) whose text fits
        using var font = new SKFont(Typeface(clockFont.File), maxSize);
        while (font.Size > 12 && font.MeasureText(text) > maxWidth - suffixWidth) font.Size -= 2;

        float textWidth = font.MeasureText(text);
        float total = textWidth + suffixWidth;
        float startX = alignRight ? anchorX - total : anchorX - total / 2;
        FillText(theme.Primary, text, startX, baseline, textWidth, font, paint);

        if (suffix.Length > 0)
        {
            paint.Color = theme.Accent;
            _canvas.DrawText(suffix, startX + textWidth + 10, baseline, SKTextAlign.Left, suffixFont, paint);
        }
    }

    /// <summary>Left-aligned text in the theme's primary colour, or its horizontal gradient when it has several.</summary>
    private void FillText(SKColor[] colors, string text, float x, float baseline, float width, SKFont font, SKPaint paint)
    {
        if (colors.Length == 1)
        {
            paint.Color = colors[0];
            _canvas.DrawText(text, x, baseline, SKTextAlign.Left, font, paint);
            return;
        }
        using SKShader gradient = SKShader.CreateLinearGradient(
            new SKPoint(x, 0), new SKPoint(x + width, 0), colors, SKShaderTileMode.Clamp);
        paint.Shader = gradient;
        _canvas.DrawText(text, x, baseline, SKTextAlign.Left, font, paint);
        paint.Shader = null;
    }

    /// <summary>
    /// Line icon for a weather condition, in the theme's accent colour, centred on (cx, cy) and about
    /// <paramref name="size"/> pixels wide.
    /// </summary>
    private void DrawWeatherIcon(string condition, float cx, float cy, float size, Theme theme)
    {
        float s = size;
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Style = SKPaintStyle.Stroke,
            StrokeWidth = MathF.Max(2, s * 0.06f),
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
            Color = theme.Accent
        };

        switch (condition)
        {
            case "sunny":
            {
                float r = s * 0.2f;
                _canvas.DrawCircle(cx, cy, r, paint);
                for (int i = 0; i < 8; i++)
                {
                    float a = i * MathF.PI / 4;
                    _canvas.DrawLine(cx + MathF.Cos(a) * r * 1.55f, cy + MathF.Sin(a) * r * 1.55f,
                        cx + MathF.Cos(a) * r * 2.2f, cy + MathF.Sin(a) * r * 2.2f, paint);
                }
                return;
            }
            case "clear-night":
            {
                using SKPath moon = Circle(cx, cy, s * 0.32f);
                using SKPath bite = Circle(cx + s * 0.18f, cy - s * 0.14f, s * 0.28f);
                using SKPath crescent = moon.Op(bite, SKPathOp.Difference);
                _canvas.DrawPath(crescent, paint);
                return;
            }
        }

        // Every other condition is a cloud, raised a little when something falls from it.
        bool falls = condition is "rainy" or "snowy" or "stormy";
        float cloudY = falls ? cy - s * 0.12f : cy;
        using (SKPath cloud = CloudPath(cx, cloudY, s))
        {
            _canvas.DrawPath(cloud, paint);
        }
        float below = cloudY + s * 0.32f;

        switch (condition)
        {
            case "rainy":
                for (int i = -1; i <= 1; i++)
                {
                    float x = cx + i * s * 0.2f;
                    _canvas.DrawLine(x + s * 0.04f, below, x - s * 0.04f, below + s * 0.18f, paint);
                }
                break;
            case "snowy":
                paint.Style = SKPaintStyle.Fill;
                for (int i = -1; i <= 1; i++) _canvas.DrawCircle(cx + i * s * 0.2f, below + s * 0.1f + (i == 0 ? s * 0.06f : 0), s * 0.045f, paint);
                break;
            case "stormy":
            {
                using var builder = new SKPathBuilder();
                builder.MoveTo(cx + s * 0.04f, below - s * 0.02f);
                builder.LineTo(cx - s * 0.08f, below + s * 0.14f);
                builder.LineTo(cx + s * 0.04f, below + s * 0.14f);
                builder.LineTo(cx - s * 0.06f, below + s * 0.3f);
                using SKPath bolt = builder.Detach();
                _canvas.DrawPath(bolt, paint);
                break;
            }
        }
    }

    /// <summary>Outline of a cloud: three bumps on a flat base, merged into one shape.</summary>
    private static SKPath CloudPath(float cx, float cy, float s)
    {
        using var builder = new SKPathBuilder();
        builder.AddCircle(cx - s * 0.2f, cy + s * 0.06f, s * 0.17f, SKPathDirection.Clockwise);
        builder.AddCircle(cx + s * 0.02f, cy - s * 0.06f, s * 0.24f, SKPathDirection.Clockwise);
        builder.AddCircle(cx + s * 0.24f, cy + s * 0.07f, s * 0.16f, SKPathDirection.Clockwise);
        builder.AddRoundRect(new SKRect(cx - s * 0.37f, cy + s * 0.04f, cx + s * 0.4f, cy + s * 0.23f), s * 0.095f, s * 0.095f, SKPathDirection.Clockwise);
        using SKPath shape = builder.Detach();
        return shape.Simplify() ?? new SKPath(shape);
    }

    private static SKPath Circle(float cx, float cy, float r)
    {
        using var builder = new SKPathBuilder();
        builder.AddCircle(cx, cy, r, SKPathDirection.Clockwise);
        return builder.Detach();
    }

    private void DrawBackground(Theme theme)
    {
        // Start/end points of a CSS-style linear gradient with the theme's angle
        double a = theme.AngleDeg * Math.PI / 180;
        float dx = (float)Math.Sin(a);
        float dy = (float)-Math.Cos(a);
        float half = (Math.Abs(W * dx) + Math.Abs(H * dy)) / 2;
        var start = new SKPoint(W / 2f - dx * half, H / 2f - dy * half);
        var end = new SKPoint(W / 2f + dx * half, H / 2f + dy * half);

        using var paint = new SKPaint { IsDither = true };
        using (SKShader linear = SKShader.CreateLinearGradient(start, end, theme.BackgroundStops, SKShaderTileMode.Clamp))
        {
            paint.Shader = linear;
            _canvas.DrawRect(0, 0, W, H, paint);
        }

        // Blurred "spheres": radial gradients fading to transparent
        foreach (Glow glow in theme.Glows)
        {
            var centre = glow.TopLeft ? new SKPoint(40, 20) : new SKPoint(W - 40, H - 20);
            SKColor[] colors = [WithAlpha(glow.Color, glow.Alpha * 2), WithAlpha(glow.Color, 0)];
            using SKShader radial = SKShader.CreateRadialGradient(centre, 240, colors, SKShaderTileMode.Clamp);
            paint.Shader = radial;
            _canvas.DrawRect(0, 0, W, H, paint);
        }
    }

    private void DrawCard(Theme theme)
    {
        var rect = new SKRect(CardInset + 0.5f, CardInset + 0.5f, W - CardInset - 0.5f, H - CardInset - 0.5f);
        using var paint = new SKPaint { IsAntialias = true, Color = WithAlpha(theme.CardFill, theme.CardFillAlpha) };
        _canvas.DrawRoundRect(rect, CardRadius, CardRadius, paint);
        paint.Style = SKPaintStyle.Stroke;
        paint.StrokeWidth = 1;
        paint.Color = WithAlpha(theme.CardBorder, theme.CardBorderAlpha);
        _canvas.DrawRoundRect(rect, CardRadius, CardRadius, paint);
    }

    /* ------------------------------ helpers ------------------------------ */

    /// <summary>Centred text with CSS-like letter spacing (Skia has none): every character is placed by hand.</summary>
    private void DrawCentredText(string text, float cx, float baseline, SKFont font, SKPaint paint, float letterSpacing)
    {
        float total = font.MeasureText(text) + letterSpacing * text.Length;
        float x = cx - total / 2;
        foreach (char c in text)
        {
            string glyph = c.ToString();
            _canvas.DrawText(glyph, x, baseline, SKTextAlign.Left, font, paint);
            x += font.MeasureText(glyph) + letterSpacing;
        }
    }

    /// <summary>Left-aligned text with CSS-like letter spacing.</summary>
    private void DrawSpacedText(string text, float x, float baseline, SKFont font, SKPaint paint, float letterSpacing)
    {
        foreach (char c in text)
        {
            string glyph = c.ToString();
            _canvas.DrawText(glyph, x, baseline, SKTextAlign.Left, font, paint);
            x += font.MeasureText(glyph) + letterSpacing;
        }
    }

    /// <summary>Greedy word wrap into at most <paramref name="maxLines"/> lines; the last one is ellipsized.</summary>
    private static List<string> WrapText(string text, SKFont font, float maxWidth, int maxLines)
    {
        string[] words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lines = new List<string>();
        string line = "";
        for (int i = 0; i < words.Length; i++)
        {
            string candidate = line.Length == 0 ? words[i] : $"{line} {words[i]}";
            if (font.MeasureText(candidate) <= maxWidth || line.Length == 0)
            {
                line = candidate;
                continue;
            }
            lines.Add(line);
            line = words[i];
            if (lines.Count == maxLines - 1)
            {
                line = string.Join(' ', words[i..]);
                break;
            }
        }
        if (line.Length > 0) lines.Add(Ellipsize(line, font, maxWidth));
        return lines.Take(maxLines).ToList();
    }

    /// <summary>High-contrast text colour for labels that must stand out on the card.</summary>
    private static SKColor StrongText(Theme theme) => theme.IsLight ? theme.Primary[0] : SKColors.White;

    private static string Ellipsize(string text, SKFont font, float maxWidth)
    {
        if (font.MeasureText(text) <= maxWidth) return text;
        while (text.Length > 1 && font.MeasureText(text + "…") > maxWidth) text = text[..^1];
        return text.TrimEnd() + "…";
    }

    /// <summary>"Thursday, November 12" in the given language.</summary>
    private static string DateLabel(DateTime now, CultureInfo culture) =>
        $"{now.ToString("dddd", culture)}, {now.ToString(culture.DateTimeFormat.MonthDayPattern, culture)}";

    private static SKColor WithAlpha(SKColor color, float alpha) =>
        color.WithAlpha((byte)Math.Round(Math.Clamp(alpha, 0, 1) * 255));

    private SKTypeface Typeface(string file)
    {
        if (_typefaces.TryGetValue(file, out SKTypeface? cached)) return cached;
        using Stream? stream = typeof(ScreenRenderer).Assembly.GetManifestResourceStream($"Fonts.{file}");
        SKTypeface typeface = (stream is null ? null : SKTypeface.FromStream(stream)) ?? SKTypeface.Default;
        _typefaces[file] = typeface;
        return typeface;
    }
}
