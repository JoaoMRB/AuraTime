using System.Globalization;
using AuraTime.Desktop.Display;
using SkiaSharp;

namespace AuraTime.Desktop.Render;

public sealed record RenderOptions(Theme Theme, ClockFont Font, bool Use24h, CultureInfo Culture);

/// <summary>
/// Draws the 480x320 screen. Ported from the web app's canvas renderer (src/app/services/screen/screen-renderer.ts);
/// only the clock view exists here so far.
/// </summary>
public sealed class ScreenRenderer : IDisposable
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

    public void Draw(DateTime now, RenderOptions options)
    {
        Theme theme = options.Theme;
        DrawBackground(theme);

        _canvas.Save();
        (int shiftX, int shiftY) = PixelShift(now);
        _canvas.Translate(shiftX, shiftY);
        DrawCard(theme);
        DrawClock(now, options);
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

    private void DrawTimeWithSuffix(
        Theme theme, ClockFont clockFont, string text, string suffix, float cx, float baseline, float maxWidth, float maxSize)
    {
        using var paint = new SKPaint { IsAntialias = true };
        using var suffixFont = new SKFont(Typeface("inter-latin-600-normal.ttf"), 22);
        float suffixWidth = suffix.Length > 0 ? suffixFont.MeasureText(suffix) + 10 : 0;

        // Largest size (<= max) whose text fits
        using var font = new SKFont(Typeface(clockFont.File), maxSize);
        while (font.Size > 12 && font.MeasureText(text) > maxWidth - suffixWidth) font.Size -= 2;

        float textWidth = font.MeasureText(text);
        float startX = cx - (textWidth + suffixWidth) / 2;

        if (theme.Primary.Length == 1)
        {
            paint.Color = theme.Primary[0];
            _canvas.DrawText(text, startX, baseline, SKTextAlign.Left, font, paint);
        }
        else
        {
            using SKShader gradient = SKShader.CreateLinearGradient(
                new SKPoint(startX, 0), new SKPoint(startX + textWidth, 0), theme.Primary, SKShaderTileMode.Clamp);
            paint.Shader = gradient;
            _canvas.DrawText(text, startX, baseline, SKTextAlign.Left, font, paint);
            paint.Shader = null;
        }

        if (suffix.Length > 0)
        {
            paint.Color = theme.Accent;
            _canvas.DrawText(suffix, startX + textWidth + 10, baseline, SKTextAlign.Left, suffixFont, paint);
        }
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
