/**
 * Single source of truth for theme colours and fonts.
 *
 * Values are transcribed from the Tailwind classes used by the clock template
 * (hex equivalents of the Tailwind palette), so they can be consumed outside
 * the DOM, e.g. by the canvas renderer for the USB screen.
 */

export type ThemeId = 'emerald-gold' | 'liquid-glass' | 'obsidian-platinum' | 'dark-glass' | 'light-glass';

/** Order used when cycling themes with the keyboard. */
export const THEME_IDS: readonly ThemeId[] = [
  'emerald-gold',
  'liquid-glass',
  'obsidian-platinum',
  'dark-glass',
  'light-glass'
];

export const DEFAULT_THEME_ID: ThemeId = 'emerald-gold';

/** Legacy ids that older saved settings / links may still contain. */
const THEME_ALIASES: Record<string, ThemeId> = {
  'frosted-glass': 'light-glass'
};

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

/** Maps any stored theme string (including legacy aliases) to a valid ThemeId. */
export function resolveThemeId(value: string | null | undefined): ThemeId {
  if (!value) return DEFAULT_THEME_ID;
  if (isThemeId(value)) return value;
  return THEME_ALIASES[value] ?? DEFAULT_THEME_ID;
}

export interface RGBA {
  /** Hex colour, #RRGGBB. */
  color: string;
  /** 0..1 */
  alpha: number;
}

export interface ThemeTokens {
  id: ThemeId;
  isLight: boolean;
  background: {
    /** Gradient direction in degrees, CSS convention (90 = to right, 180 = to bottom). */
    angleDeg: number;
    /** from / via / to colours. */
    stops: [string, string, string];
    /** Soft blurred spheres drawn over the gradient (themes that have them). */
    glows: { color: string; alpha: number; position: 'top-left' | 'bottom-right' }[];
  };
  card: {
    fill: RGBA;
    border: RGBA;
  };
  text: {
    /** Main digits. One colour = solid; several = horizontal gradient. */
    primary: string[];
    /** Small caps labels (date, mode). */
    accent: string;
    /** Secondary text. */
    muted: string;
  };
}

export const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
  'emerald-gold': {
    id: 'emerald-gold',
    isLight: false,
    background: {
      angleDeg: 135, // to bottom right
      stops: ['#052211', '#000000', '#011409'],
      glows: [
        { color: '#0A3B1F', alpha: 0.2, position: 'top-left' },
        { color: '#D4AF37', alpha: 0.1, position: 'bottom-right' }
      ]
    },
    card: {
      fill: { color: '#07170d', alpha: 0.6 },
      border: { color: '#D4AF37', alpha: 0.25 }
    },
    text: {
      primary: ['#D4AF37', '#FFFFFF', '#E5E4E2'], // gold -> white -> platinum
      accent: '#D4AF37',
      muted: '#9ca3af'
    }
  },
  'liquid-glass': {
    id: 'liquid-glass',
    isLight: false,
    background: {
      angleDeg: 45, // to top right
      stops: ['#1e1b4b', '#020617', '#2e1065'], // indigo-950, slate-950, violet-950
      glows: [
        { color: '#0891b2', alpha: 0.2, position: 'top-left' }, // cyan-600
        { color: '#9333ea', alpha: 0.2, position: 'bottom-right' } // purple-600
      ]
    },
    card: {
      fill: { color: '#FFFFFF', alpha: 0.03 },
      border: { color: '#FFFFFF', alpha: 0.1 }
    },
    text: {
      primary: ['#FFFFFF'],
      accent: '#D4AF37',
      muted: '#9ca3af'
    }
  },
  'obsidian-platinum': {
    id: 'obsidian-platinum',
    isLight: false,
    background: {
      angleDeg: 180,
      stops: ['#000000', '#000000', '#000000'],
      glows: []
    },
    card: {
      fill: { color: '#09090b', alpha: 0.4 }, // zinc-950
      border: { color: '#18181b', alpha: 0.8 } // zinc-900
    },
    text: {
      primary: ['#FFFFFF', '#a1a1aa', '#52525b'], // white -> zinc-400 -> zinc-600
      accent: '#D4AF37',
      muted: '#9ca3af'
    }
  },
  'dark-glass': {
    id: 'dark-glass',
    isLight: false,
    background: {
      angleDeg: 45,
      stops: ['#18181b', '#0a0a0a', '#1c1917'], // zinc-900, neutral-950, stone-900
      glows: []
    },
    card: {
      fill: { color: '#FFFFFF', alpha: 0.02 },
      border: { color: '#FFFFFF', alpha: 0.05 }
    },
    text: {
      primary: ['#FFFFFF'], // text-white/95 in the template
      accent: '#D4AF37',
      muted: '#9ca3af'
    }
  },
  'light-glass': {
    id: 'light-glass',
    isLight: true,
    background: {
      angleDeg: 45,
      stops: ['#e5e7eb', '#f1f5f9', '#d1d5db'], // gray-200, slate-100, gray-300
      glows: []
    },
    card: {
      fill: { color: '#FFFFFF', alpha: 0.65 },
      border: { color: '#FFFFFF', alpha: 0.8 }
    },
    text: {
      primary: ['#1e293b'], // slate-800
      accent: '#64748b', // slate-500
      muted: '#64748b'
    }
  }
};

export type FontId = 'orbitron' | 'inter' | 'playfair' | 'outfit';

export interface FontTokens {
  id: FontId;
  /** CSS font-family for canvas `ctx.font` and CSS. */
  family: string;
  weight: number;
  italic: boolean;
}

/** Mirrors the font classes applied to the clock digits in the template. */
export const FONT_TOKENS: Record<FontId, FontTokens> = {
  orbitron: { id: 'orbitron', family: "'Orbitron', sans-serif", weight: 700, italic: false },
  inter: { id: 'inter', family: "'Inter', sans-serif", weight: 300, italic: false },
  playfair: { id: 'playfair', family: "'Playfair Display', serif", weight: 400, italic: true },
  outfit: { id: 'outfit', family: "'Outfit', sans-serif", weight: 500, italic: false }
};

export function resolveFont(value: string | null | undefined): FontTokens {
  return FONT_TOKENS[(value ?? 'outfit') as FontId] ?? FONT_TOKENS.outfit;
}

/** Builds a canvas/CSS font shorthand, e.g. "italic 400 48px 'Playfair Display', serif". */
export function fontShorthand(font: FontTokens, sizePx: number): string {
  return `${font.italic ? 'italic ' : ''}${font.weight} ${sizePx}px ${font.family}`;
}
