import { Injectable, signal, inject, PLATFORM_ID, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { DESK_DISPLAY_EN } from '../i18n/desk-display.en';

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
  },
  "ALARM": {
    "TITLE": "Alarms",
    "RINGING": "Alarm!",
    "WAKE_UP": "Time to wake up!",
    "SNOOZE": "Snooze",
    "STOP": "Stop",
    "NONE_YET": "No alarms yet",
    "NONE_SET": "No alarms set",
    "NEW": "New",
    "MANAGE": "Manage Alarms",
    "EDIT": "Edit Alarm",
    "NEW_ALARM": "New Alarm",
    "LABEL": "Label",
    "LABEL_PLACEHOLDER": "Label (e.g. Wake up)",
    "REPEAT": "Repeat",
    "SNOOZE_MIN": "Snooze (min)",
    "ADD": "Add Alarm",
    "SAVED": "Saved Alarms",
    "SAVE": "Save",
    "CANCEL": "Cancel",
    "ONCE": "Once",
    "ONCE_TODAY": "Once (today)",
    "DAILY": "Daily",
    "WEEKDAYS": "Weekdays",
    "WEEKENDS": "Weekends",
    "SOUND_CHIME": "Chime",
    "SOUND_BELL": "Bell",
    "SOUND_DIGITAL": "Digital",
    "DAY_0": "SUN",
    "DAY_1": "MON",
    "DAY_2": "TUE",
    "DAY_3": "WED",
    "DAY_4": "THU",
    "DAY_5": "FRI",
    "DAY_6": "SAT"
  },
  "WORLD_CLOCK": {
    "UTC": "UTC",
    "SAME_TIME": "Same time"
  },
  "SOUNDSCAPE": {
    "TITLE": "Soundscapes & Focus",
    "SUBTITLE": "Real-time synthesized ambient audio mixer",
    "MASTER_VOLUME": "Master Volume",
    "PRESETS": "Atmospheric Presets",
    "PRESET_DEEP_WORK": "Deep Work",
    "PRESET_RAINY_EVENING": "Rainy Evening",
    "PRESET_FOCUS_BINAURAL": "Focus Binaural",
    "PRESET_ZEN_BREEZE": "Zen Breeze",
    "RAIN": "Gentle Rain",
    "THUNDER": "Distant Thunder",
    "FIRE": "Crackling Fireplace",
    "WIND": "Gentle Wind",
    "BROWN_NOISE": "Brown Noise",
    "PINK_NOISE": "Pink Noise",
    "BINAURAL": "Binaural Beats (Focus)",
    "STOP_ALL": "Mute All"
  },
  "TASKS": {
    "TITLE": "Today's Focus (Top 3)",
    "SUBTITLE": "Priorities aligned with Pomodoro",
    "INPUT_PLACEHOLDER": "Add a new priority...",
    "ACTIVE_FOCUS": "In Focus",
    "NO_TASKS": "No pending tasks. Set your daily goals!",
    "POMO_COUNT": "Pomodoro Sessions",
    "CLEAR_COMPLETED": "Clear Completed"
  },
  "NOTES": {
    "TITLE": "Quick Scratchpad",
    "SUBTITLE": "Instant thoughts saved locally",
    "PLACEHOLDER": "Type your focus thoughts here...",
    "SAVED_AT": "Saved at"
  },
  "ANALYTICS": {
    "TITLE": "Focus Analytics",
    "SUBTITLE": "Track consistency and momentum",
    "CURRENT_STREAK": "Day Streak",
    "BEST_STREAK": "Best Streak",
    "TODAY_FOCUS": "Today's Focus",
    "TOTAL_FOCUS": "Total Focus Time",
    "TOTAL_POMODOROS": "Pomodoros Done",
    "LAST_7_DAYS": "Last 7 Days"
  },
  "DASHBOARD": {
    "WEATHER": "Weather",
    "QUICK_LINKS": "Quick Links",
    "ADD_LINK": "Add Link",
    "NEW_TAB": "New Tab",
    "NEXT_EVENT": "Next Event"
  },
  "PIP": {
    "TOGGLE": "Mini Floating Display (Picture-in-Picture)"
  }
};

/** Adds the keys of `source` into `target` without replacing the ones that already exist. */
function mergeMissing(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object') {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      mergeMissing(target[key], value);
    } else if (target[key] === undefined) {
      target[key] = value;
    }
  }
}
mergeMissing(DEFAULT_EN, DESK_DISPLAY_EN);

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  currentLang = signal<string>('en');
  translations = signal<any>(DEFAULT_EN);

  constructor() {
    // Attempt to restore language from localStorage if in browser
    if (isPlatformBrowser(this.platformId)) {
      const savedLang = localStorage.getItem('auratime_lang');
      if (savedLang) {
        this.applyLanguage(savedLang);
      }

      // Another window (e.g. the clock while this is the Desk Display page) changed the language
      const onStorage = (event: StorageEvent) => {
        if (event.key === 'auratime_lang' && event.newValue && event.newValue !== this.currentLang()) {
          this.applyLanguage(event.newValue);
        }
      };
      window.addEventListener('storage', onStorage);
      this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  setLanguage(lang: string) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('auratime_lang', lang);
    }
    this.applyLanguage(lang);
  }

  private applyLanguage(lang: string) {
    this.currentLang.set(lang);

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

  /** Translates a path and fills {placeholders}, e.g. format('SCREEN.PAGE.S2.SENT', { images: 3, kb: 12 }). */
  format(path: string, params: Record<string, string | number>): string {
    return this.t(path).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
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
