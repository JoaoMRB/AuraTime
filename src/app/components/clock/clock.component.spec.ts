import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ClockComponent } from './clock.component';
import { WeatherService } from '../../services/weather.service';
import { DeskDisplayStatusService, DESK_STATUS_KEY } from '../../services/screen/desk-display-status.service';
import { TranslationService } from '../../services/translation.service';

/**
 * Regression tests for a template bug: the theme classes were set with ngClass maps whose entries shared
 * class names. Angular applies the entries in order, so a later entry that was false removed a class an
 * earlier true entry had just added. On the first render with a saved theme, light-glass and liquid-glass
 * lost their background gradient, emerald-gold (the default) its gold digits, most cards their border,
 * and several clock positions their alignment.
 *
 * These tests mount the component the way a visitor opens the app: with the theme/position already saved.
 */
describe('ClockComponent: themes and positions render completely', () => {
  let fixture: ComponentFixture<ClockComponent>;
  let el: HTMLElement;

  function configure(): void {
    TestBed.configureTestingModule({
      imports: [ClockComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WeatherService, useValue: weatherStub() }
      ]
    });
  }

  /** Opens the clock with these settings already saved (a fresh page load). */
  function mount(saved: Record<string, unknown> = {}): void {
    localStorage.setItem('auratime_settings', JSON.stringify({ mode: 'clock', font: 'outfit', ...saved }));
    fixture = TestBed.createComponent(ClockComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  /** Same, but as a brand new page load (new injector). */
  function remount(saved: Record<string, unknown>): void {
    fixture.destroy();
    TestBed.resetTestingModule();
    configure();
    mount(saved);
  }

  beforeEach(() => {
    localStorage.clear();
    configure();
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
  });

  const background = () => el.querySelector('div.fixed.inset-0.z-0') as HTMLElement;
  const card = () => el.querySelector('div.rounded-\\[2\\.5rem\\]') as HTMLElement;
  const digits = () => el.querySelector('div.select-all') as HTMLElement;
  const stage = () => el.querySelector('div.fixed.inset-0.z-10') as HTMLElement;
  const THEMES = ['emerald-gold', 'liquid-glass', 'light-glass', 'dark-glass', 'obsidian-platinum'];

  for (const theme of THEMES.filter(t => t !== 'obsidian-platinum')) {
    it(`${theme}: the page background is a real gradient`, () => {
      mount({ theme });
      expect(getComputedStyle(background()).backgroundImage).toContain('linear-gradient');
    });
  }

  it('obsidian-platinum: the page background is black', () => {
    mount({ theme: 'obsidian-platinum' });
    expect(getComputedStyle(background()).backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('light-glass really is a light theme (light background, dark digits)', () => {
    mount({ theme: 'light-glass' });
    expect(getComputedStyle(background()).backgroundImage).toMatch(/rgb\((229|241|209), /); // gray-200 / slate-100 / gray-300
    expect(getComputedStyle(digits()).color).toBe('rgb(30, 41, 59)'); // slate-800
  });

  for (const theme of THEMES) {
    it(`${theme}: the clock card keeps its border and blur`, () => {
      mount({ theme });
      expect(getComputedStyle(card()).borderTopWidth).toBe('1px');
      expect(getComputedStyle(card()).backdropFilter).toContain('blur');
    });
  }

  it('emerald-gold (the default): the digits keep the gold gradient', () => {
    mount({ theme: 'emerald-gold' });
    const style = getComputedStyle(digits());
    expect(style.backgroundImage).toContain('linear-gradient');
    expect(style.backgroundImage).toContain('rgb(212, 175, 55)'); // luxury gold
    expect(style.color).toBe('rgba(0, 0, 0, 0)'); // transparent: the gradient shows through the glyphs
  });

  it('a first visit with nothing saved gets the full default look', () => {
    localStorage.clear();
    fixture = TestBed.createComponent(ClockComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(getComputedStyle(background()).backgroundImage).toContain('linear-gradient');
    expect(getComputedStyle(digits()).backgroundImage).toContain('rgb(212, 175, 55)');
    expect(getComputedStyle(card()).borderTopWidth).toBe('1px');
  });

  it('obsidian-platinum: the digits keep the white-to-grey gradient', () => {
    mount({ theme: 'obsidian-platinum' });
    const style = getComputedStyle(digits());
    expect(style.backgroundImage).toContain('linear-gradient');
    expect(style.color).toBe('rgba(0, 0, 0, 0)');
  });

  it('plain-colour themes do not get the gradient text classes of the others', () => {
    for (const theme of ['liquid-glass', 'light-glass', 'dark-glass']) {
      remount({ theme });
      expect(digits().classList.contains('bg-clip-text')).withContext(theme).toBeFalse();
      expect(digits().classList.contains('text-transparent')).withContext(theme).toBeFalse();
    }
  });

  it('switching themes back and forth never loses a class (order independent)', () => {
    mount({ theme: 'obsidian-platinum' });
    for (const theme of ['emerald-gold', 'light-glass', 'liquid-glass', 'dark-glass', 'light-glass', 'emerald-gold']) {
      fixture.componentInstance.settings.theme.set(theme);
      fixture.detectChanges();
    }
    expect(getComputedStyle(background()).backgroundImage).toContain('linear-gradient');
    expect(getComputedStyle(card()).borderTopWidth).toBe('1px');
    expect(getComputedStyle(digits()).backgroundImage).toContain('rgb(212, 175, 55)');
  });

  const POSITIONS: Record<string, { has: string[]; not: string[] }> = {
    center: { has: ['justify-center', 'items-center'], not: ['justify-start', 'justify-end', 'items-start', 'items-end', 'p-10'] },
    'top-left': { has: ['justify-start', 'items-start', 'p-10'], not: ['justify-end', 'items-end', 'justify-center'] },
    'top-right': { has: ['justify-end', 'items-start', 'p-10'], not: ['justify-start', 'items-end', 'justify-center'] },
    'bottom-left': { has: ['justify-start', 'items-end', 'p-10'], not: ['justify-end', 'items-start', 'justify-center'] },
    'bottom-right': { has: ['justify-end', 'items-end', 'p-10'], not: ['justify-start', 'items-start', 'justify-center'] }
  };

  for (const [position, expected] of Object.entries(POSITIONS)) {
    it(`position ${position}: the clock sits in the right place`, () => {
      mount({ position });
      for (const cls of expected.has) expect(stage().classList.contains(cls)).withContext(cls).toBeTrue();
      for (const cls of expected.not) expect(stage().classList.contains(cls)).withContext('not ' + cls).toBeFalse();
    });
  }

  it('the closed drawers do not cast a shadow onto the screen edges (visible on light themes)', () => {
    mount({ theme: 'light-glass' });
    const drawers = Array.from(el.querySelectorAll('div.fixed.z-40, div.fixed.z-50')).filter(d =>
      d.classList.contains('-translate-x-full') || d.classList.contains('translate-x-full')
    ) as HTMLElement[];
    expect(drawers.length).toBe(2); // settings (left) and alarms (right)
    for (const drawer of drawers) expect(getComputedStyle(drawer).boxShadow).toBe('none');

    fixture.componentInstance.settingsOpen.set(true);
    fixture.detectChanges();
    const settings = el.querySelector('div.fixed.z-40.translate-x-0') as HTMLElement;
    expect(getComputedStyle(settings).boxShadow).not.toBe('none');
  });

  it('is not hydrated from the prerendered page (it would keep a frozen build-time clock on screen)', () => {
    mount({ mode: 'pomodoro', theme: 'obsidian-platinum' });
    expect(el.getAttribute('ngSkipHydration')).toBe('true');
    // only one clock face for the saved mode, no leftover default-mode clock
    expect(el.querySelectorAll('div.select-all').length).toBe(0);
  });

  it('moving between positions keeps the classes right', () => {
    mount({ position: 'center' });
    for (const position of ['bottom-right', 'top-left', 'center', 'top-right', 'bottom-left']) {
      fixture.componentInstance.settings.position.set(position);
      fixture.detectChanges();
    }
    const cls = stage().classList;
    expect(cls.contains('justify-start') && cls.contains('items-end') && cls.contains('p-10')).toBeTrue();
    expect(cls.contains('justify-end') || cls.contains('items-start') || cls.contains('justify-center')).toBeFalse();
  });
});

/** The parts of WeatherService the clock page uses: no geolocation prompt and no network in unit tests. */
function weatherStub() {
  return {
    weather: signal<unknown>(null),
    city: signal<unknown>(null),
    initWeather: () => Promise.resolve(),
    placeLabel: (w: { source: string; cityName: string }) =>
      w.source === 'user' ? w.cityName : w.source === 'geo' ? 'Your location' : 'Lisbon (default)',
    searchCities: jasmine.createSpy('searchCities').and.resolveTo([]),
    chooseCity: jasmine.createSpy('chooseCity').and.resolveTo(undefined),
    useMyLocation: jasmine.createSpy('useMyLocation').and.resolveTo(undefined)
  };
}

describe('ClockComponent: weather location', () => {
  let fixture: ComponentFixture<ClockComponent>;
  let el: HTMLElement;
  let weather: ReturnType<typeof weatherStub>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ClockComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: WeatherService, useValue: weatherStub() }]
    });
    weather = TestBed.inject(WeatherService) as unknown as ReturnType<typeof weatherStub>;
    fixture = TestBed.createComponent(ClockComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.clear();
  });

  const block = () => el.querySelector('[data-testid="weather-location"]') as HTMLElement;
  const WHITESPACE = new RegExp('[' + String.fromCharCode(9, 10, 13, 32) + ']+', 'g');
  const text = (e: Element) => (e.textContent ?? '').replace(WHITESPACE, ' ').trim();
  const reading = (source: string, cityName = '') => ({ temperature: 18, condition: 'sunny', description: 'x', icon: 'x', cityName, source });
  const type = (value: string) => {
    const input = block().querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  /** Lets pending promises finish and redraws (the clock page has timers that never stop, so whenStable() would hang). */
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const searchButton = () => block().querySelector('button') as HTMLButtonElement;

  it('is in the settings and names where the weather comes from, never "Local"', () => {
    expect(block()).toBeTruthy();
    expect(text(block())).toContain('Weather location');
    weather.weather.set(reading('geo'));
    fixture.detectChanges();
    expect(text(block())).toContain('Your location');
    expect(text(block())).not.toContain('Local');
  });

  it('says "Lisbon (default)" and explains how to change it when the location is not available', () => {
    weather.weather.set(reading('default'));
    fixture.detectChanges();
    expect(block().querySelector('[data-testid="weather-place"]')!.textContent).toContain('Lisbon (default)');
    expect(text(block())).toContain('Your location is not available, so the weather shows Lisbon');
  });

  it('shows no default-city hint for a located or chosen place', () => {
    weather.weather.set(reading('user', 'Porto'));
    fixture.detectChanges();
    expect(text(block())).toContain('Porto');
    expect(text(block())).not.toContain('Your location is not available');
  });

  it('searches, lists the cities and picks one', async () => {
    weather.searchCities.and.resolveTo([{ name: 'Porto', latitude: 41.15, longitude: -8.61, region: 'Porto, Portugal' }]);
    type('Porto');
    searchButton().click();
    await settle();
    expect(weather.searchCities).toHaveBeenCalledWith('Porto');
    const results = block().querySelectorAll('[data-testid="weather-results"] button');
    expect(results.length).toBe(1);
    expect(text(results[0])).toContain('Porto');
    expect(text(results[0])).toContain('Porto, Portugal');

    (results[0] as HTMLButtonElement).click();
    await settle();
    expect(weather.chooseCity).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Porto' }));
    expect(block().querySelector('[data-testid="weather-results"]')).toBeNull();
    expect((block().querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('does not search for fewer than two characters (the button stays disabled)', () => {
    type('P');
    expect(searchButton().disabled).toBeTrue();
    type('Po');
    expect(searchButton().disabled).toBeFalse();
  });

  it('says so when nothing is found, or when the search is unavailable', async () => {
    type('Zzzz');
    searchButton().click();
    await settle();
    expect(text(block())).toContain('No city found');

    weather.searchCities.and.rejectWith(new Error('offline'));
    searchButton().click();
    await settle();
    expect(text(block())).toContain('The search is not available right now');
    expect(text(block())).not.toContain('No city found');
  });

  it('offers "Use my location" only after a city was picked', async () => {
    expect(text(block())).not.toContain('Use my location');
    weather.city.set({ name: 'Porto', latitude: 41.15, longitude: -8.61 });
    fixture.detectChanges();
    const button = Array.from(block().querySelectorAll('button')).find(b => text(b).includes('Use my location'))!;
    expect(button).toBeTruthy();
    button.click();
    expect(weather.useMyLocation).toHaveBeenCalled();
  });

  it('puts the place in the tooltip of the weather chip in the top bar', () => {
    weather.weather.set(reading('geo'));
    fixture.detectChanges();
    const chip = el.querySelector('div[class*="rounded-full"][title]') as HTMLElement;
    const withTitle = Array.from(el.querySelectorAll('[title]')).find(e => (e.getAttribute('title') ?? '').includes('Your location'));
    expect(withTitle).toBeTruthy();
    expect(chip).toBeTruthy();
  });
});

describe('ClockComponent: Desk Display link', () => {
  let fixture: ComponentFixture<ClockComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ClockComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // no geolocation prompt or network request in unit tests
        { provide: WeatherService, useValue: weatherStub() }
      ]
    });
    fixture = TestBed.createComponent(ClockComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.clear();
  });

  const entry = () => el.querySelector('[data-testid="desk-display-setting"]') as HTMLElement;
  const shortcut = () => el.querySelector('[data-testid="desk-display-shortcut"]') as HTMLAnchorElement | null;
  const text = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();

  describe('settings', () => {
    it('has a "Desk Display" entry with a link to /screen that keeps the clock open', () => {
      expect(entry()).toBeTruthy();
      expect(text(entry())).toContain('Desk Display');
      const link = entry().querySelector('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/screen');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(text(link)).toContain('Open Desk Display');
    });

    it('says "Not connected" until the Desk Display page reports a connected screen', () => {
      expect(text(entry())).toContain('Not connected');
      expect(text(entry())).not.toContain('Connected');
      const dot = entry().querySelector('[role="status"] span')!;
      expect(dot.className).toContain('bg-gray-600');
    });

    it('turns to "Connected" (green) when the other window reports a connected screen', () => {
      TestBed.inject(DeskDisplayStatusService).publish(true);
      fixture.detectChanges();
      expect(text(entry())).toContain('Connected');
      expect(text(entry())).not.toContain('Not connected');
      expect(entry().querySelector('[role="status"]')!.className).toContain('text-emerald-300');
      expect(entry().querySelector('[role="status"] span')!.className).toContain('bg-emerald-400');
    });

    it('reacts live to the other window (storage event), and back to not connected', () => {
      const write = (connected: boolean) => {
        const raw = JSON.stringify({ connected, at: Date.now() });
        localStorage.setItem(DESK_STATUS_KEY, raw);
        window.dispatchEvent(new StorageEvent('storage', { key: DESK_STATUS_KEY, newValue: raw, storageArea: localStorage }));
        fixture.detectChanges();
      };
      write(true);
      expect(text(entry())).toContain('Connected');
      write(false);
      expect(text(entry())).toContain('Not connected');
    });

    it('is translated', () => {
      const ts = TestBed.inject(TranslationService);
      ts.currentLang.set('pt');
      ts.translations.set({ SCREEN: { APP: { TITLE: 'Desk Display', OFF: 'Desligado', OPEN: 'Abrir o Desk Display', HINT: 'Mostra o relógio num ecrã USB.' } } });
      fixture.detectChanges();
      expect(text(entry())).toContain('Desligado');
      expect(text(entry())).toContain('Abrir o Desk Display');
    });
  });

  describe('new tab shortcut', () => {
    it('is not shown on the website', () => {
      expect(shortcut()).toBeNull();
    });

    it('is shown in the browser extension, linking to /screen', () => {
      fixture.componentInstance.isExtension = true;
      fixture.detectChanges();
      const link = shortcut()!;
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/screen');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('aria-label')).toBe('Open Desk Display');
      expect(link.getAttribute('title')).toBe('Open Desk Display');
    });

    it('shows a small green dot when the screen is connected', () => {
      fixture.componentInstance.isExtension = true;
      fixture.detectChanges();
      expect(shortcut()!.querySelector('span')).toBeNull();
      TestBed.inject(DeskDisplayStatusService).publish(true);
      fixture.detectChanges();
      expect(shortcut()!.querySelector('span.bg-emerald-400')).toBeTruthy();
    });
  });
});
