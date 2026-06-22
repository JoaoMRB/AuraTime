import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';

// Default fallback to ensure SSR loads instantly and safely without HTTP requests
const DEFAULT_EN: any = {
  "BRAND": "AuraTime",
  "SLOGAN": "The Art of Time in Space",
  "LANDING": {
    "HERO": {
      "TITLE": "Elegance in Every Second",
      "SUBTITLE": "A premium, distraction-free screen clock designed to enrich your space. Immerse yourself in obsidian gold and liquid glass aesthetics while you work, study, or relax.",
      "START_APP": "Enter App",
      "TRY_DEMO": "View Demo",
      "SEO_KEYWORDS": "Aesthetic Screen Clock • Minimalist Desk Clock • Glassmorphism Focus Tool • Premium Pomodoro Background"
    },
    "FEATURES": {
      "TITLE": "Designed for Discerning Spaces",
      "SUBTITLE": "Beyond a utility, AuraTime is a digital centerpiece. Custom-tailored to align with your setup.",
      "CARD_THEMES_TITLE": "Liquid Glass & Luxury Themes",
      "CARD_THEMES_DESC": "Immerse your screen in gold, obsidian, emerald, and liquid glass. Transitions are butter-smooth and light on system resources.",
      "CARD_FLEX_TITLE": "Perfect Integration",
      "CARD_FLEX_DESC": "Move the clock to any corner, tilt it up to 45 degrees, change fonts, and adjust the scale. Your screen is your canvas.",
      "CARD_FOCUS_TITLE": "Calibrated Focus",
      "CARD_FOCUS_DESC": "Toggle a minimalist Pomodoro cycle or ambient soundscapes (luxury watch ticks, soft rain) to anchor your concentration.",
      "CARD_SEO_TITLE": "No Databases. Instant Load.",
      "CARD_SEO_DESC": "Settings are saved client-side instantly. Zero friction. Fast load times guarantee perfect Vercel deployment speeds."
    },
    "THEMES_SHOWCASE": {
      "TITLE": "Curated Luxury Palettes",
      "SUBTITLE": "Selected colorways evoking high-end executive desk setups.",
      "LIQUID_GLASS": "Liquid Glass",
      "LIQUID_GLASS_DESC": "Flowing fluid backdrops with blurred glass overlays.",
      "EMERALD_GOLD": "Emerald Gold",
      "EMERALD_GOLD_DESC": "Deep money-emerald tones highlighted by metallic gold accents.",
      "OBSIDIAN_PLATINUM": "Obsidian Platinum",
      "OBSIDIAN_PLATINUM_DESC": "Piano black surfaces under cool, polished platinum light.",
      "FROSTED_GLASS": "Frosted Glass",
      "FROSTED_GLASS_DESC": "A classic glassmorphism effect that adopts any environment."
    },
    "CTA": {
      "TITLE": "Redefine Your Screen Aura",
      "SUBTITLE": "No ads. No clutter. Just a beautiful ticking companion for your workspace.",
      "BUTTON": "Launch Zenith Display Now"
    },
    "FOOTER": {
      "RIGHTS": "All rights reserved.",
      "TERMS": "Terms of Use",
      "PRIVACY": "Privacy Policy",
      "CONTACT": "Contact Setup"
    },
    "LABELS": {
      "HERO_ACCENT": "of Presence.",
      "PREVIEW": "Preview",
      "THE_CONCEPT": "The Concept",
      "ATMOSPHERES": "Atmospheres"
    }
  },
  "CLOCK": {
    "SETTINGS": "Clock Settings",
    "THEME": "Atmosphere Theme",
    "THEME_LIGHT_GLASS": "Frosted Light Glass",
    "THEME_DARK_GLASS": "Frosted Dark Glass",
    "THEME_LIQUID_GLASS": "Liquid Glass Flow",
    "THEME_EMERALD_GOLD": "Emerald Gold (Money)",
    "THEME_OBSIDIAN_PLATINUM": "Obsidian Platinum",
    "POSITION": "Screen Position",
    "POS_CENTER": "Center",
    "POS_TOP_LEFT": "Top Left",
    "POS_TOP_RIGHT": "Top Right",
    "POS_BOTTOM_LEFT": "Bottom Left",
    "POS_BOTTOM_RIGHT": "Bottom Right",
    "ANGLE": "Tilt Angle",
    "SCALE": "Clock Scale",
    "FONT": "Typography",
    "DISPLAY": "Display Configurations",
    "SHOW_SECONDS": "Show Seconds",
    "SHOW_DATE": "Show Date",
    "MILITARY_TIME": "24-Hour Format",
    "MODE": "Operation Mode",
    "MODE_CLOCK": "Clock",
    "MODE_POMODORO": "Pomodoro",
    "MODE_WORLDCLOCK": "World Clock",
    "MODE_STOPWATCH": "Stopwatch",
    "MODE_TIMER": "Timer",
    "MODE_ALARM": "Alarm",
    "LOCAL_TIME": "Local Time",
    "NEXT_ALARM": "Next Alarm",
    "ON": "On",
    "OFF": "Off",
    "ACTIVE": "Active",
    "SOUND": "Ambient Soundscape",
    "SOUND_NONE": "None (Silent)",
    "SOUND_TICK": "Luxury Watch Ticking",
    "SOUND_RAIN": "Calming Office Rain",
    "LANGUAGE": "Interface Language",
    "SUPPORT": "Join Founders Circle",
    "SUPPORT_DESC": "Keep AuraTime free & development ticking.",
    "BUY_COFFEE": "Buy me a Coffee",
    "CLOSE": "Apply & Close"
  },
  "POMODORO": {
    "WORK": "Focus Session",
    "BREAK": "Rest Interval",
    "START": "Start Focus",
    "PAUSE": "Pause Focus",
    "RESET": "Reset Cycle"
  }
};

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  
  currentLang = signal<string>('en');
  translations = signal<any>(DEFAULT_EN);

  constructor() {
    // Attempt to restore language from localStorage if in browser
    if (isPlatformBrowser(this.platformId)) {
      const savedLang = localStorage.getItem('auratime_lang');
      if (savedLang) {
        this.setLanguage(savedLang);
      }
    }
  }

  setLanguage(lang: string) {
    this.currentLang.set(lang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('auratime_lang', lang);
    }

    // Load translations from JSON
    const url = `/assets/i18n/${lang}.json`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.translations.set(res);
      },
      error: (err) => {
        console.warn(`Could not load translations for ${lang}, using defaults.`, err);
        // Default fallbacks if JSON request fails
        if (lang === 'en') {
          this.translations.set(DEFAULT_EN);
        }
      }
    });
  }

  // Get available languages
  getAvailableLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'pt', name: 'Português' },
      { code: 'es', name: 'Español' },
      { code: 'fr', name: 'Français' },
      { code: 'de', name: 'Deutsch' },
      { code: 'it', name: 'Italiano' }
    ];
  }

  // Translates a path string like 'LANDING.HERO.TITLE'
  t(path: string): string {
    const translated = this.resolvePath(this.translations(), path);
    if (translated !== undefined) {
      return translated;
    }

    const fallback = this.resolvePath(DEFAULT_EN, path);
    return fallback !== undefined ? fallback : path;
  }

  private resolvePath(source: any, path: string): string | undefined {
    const keys = path.split('.');
    let current = source;

    for (const key of keys) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return typeof current === 'string' ? current : undefined;
  }
}
