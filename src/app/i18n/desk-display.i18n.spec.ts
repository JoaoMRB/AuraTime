import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { DESK_DISPLAY_EN } from './desk-display.en';
import { TranslationService } from '../services/translation.service';

const LANGUAGES = ['en', 'pt', 'es', 'fr', 'de', 'it'];

function leaves(obj: any, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' ? leaves(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

function lookup(tree: any, path: string): unknown {
  return path.split('.').reduce((node, key) => node?.[key], tree);
}

describe('Desk Display translations', () => {
  const keys = leaves(DESK_DISPLAY_EN);

  it('has a meaningful number of keys', () => {
    expect(keys.length).toBeGreaterThan(100);
  });

  for (const lang of LANGUAGES) {
    it(`${lang}.json contains every Desk Display key, with no empty text`, async () => {
      const response = await fetch(`/assets/i18n/${lang}.json`);
      expect(response.ok).withContext(`${lang}.json should be served`).toBeTrue();
      const tree = await response.json();

      const missing = keys.filter(k => {
        const v = lookup(tree, k);
        return typeof v !== 'string' || !v.trim();
      });
      expect(missing).withContext(`${lang}: missing or empty`).toEqual([]);

      // placeholders must survive translation, otherwise the numbers vanish from the sentence
      for (const k of keys) {
        const wanted = (String(lookup(DESK_DISPLAY_EN, k)).match(/\{\w+\}/g) ?? []).sort();
        const got = (String(lookup(tree, k)).match(/\{\w+\}/g) ?? []).sort();
        expect(got).withContext(`${lang}.${k} placeholders`).toEqual(wanted);
      }
    });
  }

  it('non-English files are really translated (not copies of the English text)', async () => {
    const english = await (await fetch('/assets/i18n/en.json')).json();
    for (const lang of LANGUAGES.filter(l => l !== 'en')) {
      const tree = await (await fetch(`/assets/i18n/${lang}.json`)).json();
      const sameAsEnglish = ['SCREEN.PAGE.S2.HINT', 'SCREEN.PAGE.UNSUPPORTED.TEXT', 'LANDING.DESK.SUBTITLE', 'SCREEN.SEO.DESCRIPTION']
        .filter(k => lookup(tree, k) === lookup(english, k));
      expect(sameAsEnglish).withContext(lang).toEqual([]);
    }
  });

  describe('TranslationService', () => {
    beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient()] }));

    it('falls back to the built-in English texts for the new keys', () => {
      const ts = TestBed.inject(TranslationService);
      expect(ts.t('SCREEN.PAGE.S2.CONNECT')).toBe('Connect display');
      expect(ts.t('LANDING.DESK.NAV')).toBe('Desk Display');
      expect(ts.t('LANDING.HERO.START_APP').length).toBeGreaterThan(0); // existing keys untouched
    });

    it('fills {placeholders}', () => {
      const ts = TestBed.inject(TranslationService);
      expect(ts.format('SCREEN.PAGE.S2.SENT', { images: 4, kb: 120 })).toBe('4 images · 120 KB sent');
      expect(ts.format('SCREEN.PAGE.S2.SENT', { images: 4 })).toBe('4 images · {kb} KB sent');
    });

    it('follows a language change made in another window', () => {
      localStorage.removeItem('auratime_lang');
      const ts = TestBed.inject(TranslationService);
      const http = TestBed.inject(TranslationService) as unknown as { http: { get: () => unknown } };
      spyOn(http.http, 'get').and.callFake(() => ({ subscribe: () => undefined }));

      window.dispatchEvent(new StorageEvent('storage', { key: 'auratime_lang', newValue: 'de', storageArea: localStorage }));
      expect(ts.currentLang()).toBe('de');
    });
  });
});
