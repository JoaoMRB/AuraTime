import {
  THEME_IDS, THEME_TOKENS, FONT_TOKENS, resolveThemeId, resolveFont, fontShorthand, DEFAULT_THEME_ID
} from './theme-tokens';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('theme-tokens', () => {
  it('defines tokens for every theme id', () => {
    for (const id of THEME_IDS) {
      expect(THEME_TOKENS[id].id).toBe(id);
    }
    expect(Object.keys(THEME_TOKENS).length).toBe(THEME_IDS.length);
  });

  it('uses valid hex colours and alphas everywhere', () => {
    for (const id of THEME_IDS) {
      const t = THEME_TOKENS[id];
      const colors = [
        ...t.background.stops,
        ...t.background.glows.map(g => g.color),
        t.card.fill.color, t.card.border.color,
        ...t.text.primary, t.text.accent, t.text.muted
      ];
      for (const c of colors) expect(c).toMatch(HEX);
      const alphas = [t.card.fill.alpha, t.card.border.alpha, ...t.background.glows.map(g => g.alpha)];
      for (const a of alphas) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('resolves legacy and unknown ids', () => {
    expect(resolveThemeId('frosted-glass')).toBe('light-glass');
    expect(resolveThemeId('liquid-glass')).toBe('liquid-glass');
    expect(resolveThemeId('nope')).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID);
  });

  it('resolves fonts with an outfit fallback and builds a shorthand', () => {
    expect(resolveFont('playfair')).toBe(FONT_TOKENS.playfair);
    expect(resolveFont('???')).toBe(FONT_TOKENS.outfit);
    expect(fontShorthand(FONT_TOKENS.playfair, 48)).toBe("italic 400 48px 'Playfair Display', serif");
    expect(fontShorthand(FONT_TOKENS.orbitron, 20)).toBe("700 20px 'Orbitron', sans-serif");
  });
});
