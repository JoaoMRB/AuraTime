import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { GEOLOCATION, WEATHER_FETCH, WEATHER_REFRESH_MS, WeatherService, toWeatherCity } from './weather.service';
import { TranslationService } from './translation.service';

type PositionHandler = (position: GeolocationPosition) => void;

describe('WeatherService', () => {
  let urls: string[];
  let geoCalls: number;
  let geoMode: 'granted' | 'denied' | 'absent';
  let fetchOk: boolean;
  let temperature: number;
  let geocodingResults: unknown;

  const fakeFetch = ((input: string) => {
    urls.push(String(input));
    if (!fetchOk) return Promise.resolve({ ok: false, json: async () => ({}) });
    if (String(input).includes('geocoding-api')) {
      return Promise.resolve({ ok: true, json: async () => ({ results: geocodingResults }) });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ current: { temperature_2m: temperature, weather_code: 0, is_day: 1 } })
    });
  }) as unknown as typeof fetch;

  const fakeGeolocation = {
    getCurrentPosition: (ok: PositionHandler, fail: () => void) => {
      geoCalls++;
      if (geoMode === 'granted') ok({ coords: { latitude: 41.157944, longitude: -8.629105 } } as GeolocationPosition);
      else fail();
    }
  } as unknown as Geolocation;

  function create(): WeatherService {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WEATHER_FETCH, useValue: fakeFetch },
        { provide: GEOLOCATION, useValue: geoMode === 'absent' ? null : fakeGeolocation }
      ]
    });
    return TestBed.inject(WeatherService);
  }

  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  beforeEach(() => {
    urls = [];
    geoCalls = 0;
    geoMode = 'granted';
    fetchOk = true;
    temperature = 18.4;
    geocodingResults = [];
    localStorage.clear();
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  describe('where the weather comes from', () => {
    it('uses the located position and labels it "Your location", never the literal "Local"', async () => {
      const service = create();
      await settle();
      const weather = service.weather()!;
      expect(weather.source).toBe('geo');
      expect(weather.temperature).toBe(18);
      expect(service.placeLabel(weather)).toBe('Your location');
      expect(service.placeLabel(weather)).not.toBe('Local');
    });

    it('rounds the located position to about 1 km before sending it', async () => {
      create();
      await settle();
      expect(urls[0]).toContain('latitude=41.16&longitude=-8.63');
      expect(urls[0]).not.toContain('41.157944');
    });

    it('falls back to Lisbon, labelled "Lisbon (default)", when the location is denied', async () => {
      geoMode = 'denied';
      const service = create();
      await settle();
      const weather = service.weather()!;
      expect(weather.source).toBe('default');
      expect(service.placeLabel(weather)).toBe('Lisbon (default)');
      expect(urls[0]).toContain('latitude=38.72&longitude=-9.14');
    });

    it('falls back to Lisbon when the browser has no geolocation at all', async () => {
      geoMode = 'absent';
      const service = create();
      await settle();
      expect(service.weather()!.source).toBe('default');
    });

    it('uses the city the user picked, without asking for the location', async () => {
      localStorage.setItem('auratime_weather_city', JSON.stringify({ name: 'Porto', latitude: 41.15, longitude: -8.61, region: 'Porto, Portugal' }));
      const service = create();
      await settle();
      const weather = service.weather()!;
      expect(weather.source).toBe('user');
      expect(service.placeLabel(weather)).toBe('Porto');
      expect(geoCalls).toBe(0);
      expect(urls[0]).toContain('latitude=41.15&longitude=-8.61');
    });

    it('labels follow the app language', async () => {
      geoMode = 'denied';
      const service = create();
      await settle();
      const ts = TestBed.inject(TranslationService);
      ts.translations.set({ WEATHER: { DEFAULT_CITY: 'Lisboa (predefinida)' } });
      expect(service.placeLabel(service.weather()!)).toBe('Lisboa (predefinida)');
    });

    it('ignores a damaged stored city', async () => {
      localStorage.setItem('auratime_weather_city', JSON.stringify({ name: 'Nowhere', latitude: 999, longitude: 0 }));
      const service = create();
      await settle();
      expect(service.city()).toBeNull();
      expect(service.weather()!.source).toBe('geo');
    });
  });

  describe('keeping it fresh', () => {
    it('refreshes every 30 minutes, not before, and without asking for the location again', async () => {
      const service = create();
      await settle();
      expect(urls.length).toBe(1);

      jasmine.clock().tick(WEATHER_REFRESH_MS - 1000);
      await settle();
      expect(urls.length).toBe(1);

      temperature = 22.6;
      jasmine.clock().tick(1000);
      await settle();
      expect(urls.length).toBe(2);
      expect(service.weather()!.temperature).toBe(23);
      expect(geoCalls).toBe(1);

      jasmine.clock().tick(WEATHER_REFRESH_MS);
      await settle();
      expect(urls.length).toBe(3);
    });

    it('keeps the last good reading when a refresh fails, and recovers on the next one', async () => {
      const service = create();
      await settle();
      expect(service.hasError()).toBeFalse();

      fetchOk = false;
      jasmine.clock().tick(WEATHER_REFRESH_MS);
      await settle();
      expect(service.hasError()).toBeTrue();
      expect(service.weather()!.temperature).toBe(18);
      expect(service.isLoading()).toBeFalse();

      fetchOk = true;
      temperature = 20;
      jasmine.clock().tick(WEATHER_REFRESH_MS);
      await settle();
      expect(service.hasError()).toBeFalse();
      expect(service.weather()!.temperature).toBe(20);
    });

    it('stops refreshing when the service is destroyed', async () => {
      create();
      await settle();
      TestBed.resetTestingModule();
      jasmine.clock().tick(WEATHER_REFRESH_MS * 3);
      await settle();
      expect(urls.length).toBe(1);
    });

    it('rejects a nonsense forecast instead of showing garbage', async () => {
      const original = fakeFetch;
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: WEATHER_FETCH, useValue: (() => Promise.resolve({ ok: true, json: async () => ({ current: { temperature_2m: 'hot' } }) })) as unknown as typeof fetch },
          { provide: GEOLOCATION, useValue: null }
        ]
      });
      const service = TestBed.inject(WeatherService);
      await settle();
      expect(service.weather()).toBeNull();
      expect(service.hasError()).toBeTrue();
      expect(original).toBeTruthy();
    });
  });

  describe('picking a city', () => {
    it('searches by name in the app language and ignores unusable results', async () => {
      const service = create();
      await settle();
      geocodingResults = [
        { name: 'Porto', latitude: 41.15, longitude: -8.61, admin1: 'Porto', country: 'Portugal' },
        { name: 'Porto Alegre', latitude: 999, longitude: 0 },
        { latitude: 1, longitude: 1 },
        'junk'
      ];
      const results = await service.searchCities('  Porto ');
      expect(results).toEqual([{ name: 'Porto', latitude: 41.15, longitude: -8.61, region: 'Porto, Portugal' }]);
      const search = urls.find(u => u.includes('geocoding-api'))!;
      expect(search).toContain('name=Porto&');
      expect(search).toContain('language=en');
    });

    it('does not search for less than two characters', async () => {
      const service = create();
      await settle();
      const before = urls.length;
      expect(await service.searchCities('P')).toEqual([]);
      expect(urls.length).toBe(before);
    });

    it('a failed search rejects, so the page can say so', async () => {
      const service = create();
      await settle();
      fetchOk = false;
      await expectAsync(service.searchCities('Porto')).toBeRejected();
    });

    it('remembers the chosen city and shows its weather', async () => {
      const service = create();
      await settle();
      await service.chooseCity({ name: 'Porto', latitude: 41.15, longitude: -8.61 });
      expect(service.weather()!.source).toBe('user');
      expect(service.placeLabel(service.weather()!)).toBe('Porto');
      expect(JSON.parse(localStorage.getItem('auratime_weather_city')!).name).toBe('Porto');
    });

    it('goes back to the located position when asked', async () => {
      localStorage.setItem('auratime_weather_city', JSON.stringify({ name: 'Porto', latitude: 41.15, longitude: -8.61 }));
      const service = create();
      await settle();
      await service.useMyLocation();
      expect(service.city()).toBeNull();
      expect(localStorage.getItem('auratime_weather_city')).toBeNull();
      expect(service.weather()!.source).toBe('geo');
    });

    it('refuses a city with impossible coordinates', async () => {
      const service = create();
      await settle();
      const before = urls.length;
      await service.chooseCity({ name: 'Atlantis', latitude: 200, longitude: 0 });
      expect(service.city()).toBeNull();
      expect(urls.length).toBe(before);
    });
  });

  it('toWeatherCity only accepts a complete, sane city', () => {
    expect(toWeatherCity({ name: 'Faro', latitude: 37, longitude: -7.9 })).toEqual({ name: 'Faro', latitude: 37, longitude: -7.9 });
    expect(toWeatherCity(null)).toBeNull();
    expect(toWeatherCity([])).toBeNull();
    expect(toWeatherCity({ name: '', latitude: 1, longitude: 1 })).toBeNull();
    expect(toWeatherCity({ name: 'x'.repeat(81), latitude: 1, longitude: 1 })).toBeNull();
    expect(toWeatherCity({ name: 'A', latitude: NaN, longitude: 1 })).toBeNull();
    expect(toWeatherCity({ name: 'A', latitude: 1, longitude: 181 })).toBeNull();
  });
});
