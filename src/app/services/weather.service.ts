import { DestroyRef, Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslationService } from './translation.service';
import { isFiniteNumber, isRecord, parseJson, readStorage, removeStorage, writeStorage } from './safe-storage';

/** Where the weather comes from. */
export type WeatherSource = 'geo' | 'user' | 'default';

export interface WeatherData {
  temperature: number; // Celsius
  condition: string; // 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'clear-night'
  description: string;
  icon: string;
  /** The city the user picked; empty for a located or default place (see WeatherService.placeLabel). */
  cityName: string;
  source: WeatherSource;
}

/** A city the user picked from the search (stored under auratime_weather_city). */
export interface WeatherCity {
  name: string;
  latitude: number;
  longitude: number;
  /** Region and country, to tell two cities with the same name apart. */
  region?: string;
}

export const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const CITY_KEY = 'auratime_weather_city';
const LISBON = { latitude: 38.72, longitude: -9.14 };
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** fetch(), injectable so tests never touch the network. */
export const WEATHER_FETCH = new InjectionToken<typeof fetch>('WEATHER_FETCH', {
  providedIn: 'root',
  factory: () => (typeof fetch === 'function' ? fetch.bind(globalThis) : (() => Promise.reject(new Error('no fetch'))) as typeof fetch)
});

/** navigator.geolocation, injectable for tests; null when the browser has none. */
export const GEOLOCATION = new InjectionToken<Geolocation | null>('GEOLOCATION', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.geolocation ? navigator.geolocation : null)
});

/** About 1 km: enough for the weather, and it does not tell Open-Meteo exactly where you are. */
function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A city read back from storage (or a search result): drops anything that is not a usable city. */
export function toWeatherCity(value: unknown): WeatherCity | null {
  if (!isRecord(value)) return null;
  const { name, latitude, longitude, region } = value;
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return null;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return null;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return null;
  return {
    name: name.trim(),
    latitude,
    longitude,
    ...(typeof region === 'string' && region.length <= 120 ? { region } : {})
  };
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private translation = inject(TranslationService);
  private fetchFn = inject(WEATHER_FETCH);
  private geolocation = inject(GEOLOCATION);
  private destroyRef = inject(DestroyRef);

  weather = signal<WeatherData | null>(null);
  isLoading = signal<boolean>(false);
  hasError = signal<boolean>(false);
  /** The city the user chose in the settings, or null to use their location. */
  city = signal<WeatherCity | null>(null);

  /** Where the next refresh looks up the weather (so refreshing never asks for the location again). */
  private target: { latitude: number; longitude: number; source: WeatherSource; name: string } | null = null;

  constructor() {
    if (!this.isBrowser) return;
    this.city.set(toWeatherCity(parseJson(readStorage(CITY_KEY))));
    void this.initWeather();

    // The weather changes slowly, but a clock left on for days must not show yesterday's weather.
    const timer = setInterval(() => void this.refresh(), WEATHER_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** Looks up the weather for the chosen city, else for the user's location, else for Lisbon. */
  async initWeather(): Promise<void> {
    this.isLoading.set(true);
    this.hasError.set(false);

    const chosen = this.city();
    if (chosen) {
      return this.fetchWeather(chosen.latitude, chosen.longitude, 'user', chosen.name);
    }

    if (!this.geolocation) {
      return this.fetchWeather(LISBON.latitude, LISBON.longitude, 'default', '');
    }
    return new Promise<void>(resolve => {
      this.geolocation!.getCurrentPosition(
        pos => resolve(this.fetchWeather(pos.coords.latitude, pos.coords.longitude, 'geo', '')),
        () => resolve(this.fetchWeather(LISBON.latitude, LISBON.longitude, 'default', '')),
        { timeout: 5000 }
      );
    });
  }

  /** Same place as last time, no location prompt: used by the 30 minute timer. */
  async refresh(): Promise<void> {
    if (!this.target) return this.initWeather();
    const { latitude, longitude, source, name } = this.target;
    return this.fetchWeather(latitude, longitude, source, name);
  }

  async fetchWeather(latitude: number, longitude: number, source: WeatherSource, cityName: string): Promise<void> {
    // A located position is rounded before it leaves the browser; a picked city or Lisbon is public anyway.
    const lat = source === 'geo' ? roundCoordinate(latitude) : latitude;
    const lon = source === 'geo' ? roundCoordinate(longitude) : longitude;
    this.target = { latitude: lat, longitude: lon, source, name: cityName };

    try {
      const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
      const res = await this.fetchFn(url);
      if (!res.ok) throw new Error('Weather fetch failed');
      const data = await res.json();

      const current = data?.current;
      if (!current || !isFiniteNumber(current.temperature_2m) || !isFiniteNumber(current.weather_code)) {
        throw new Error('Unexpected weather response');
      }
      const { condition, description, icon } = this.interpretWeatherCode(current.weather_code, current.is_day === 1);

      this.weather.set({
        temperature: Math.round(current.temperature_2m),
        condition,
        description,
        icon,
        cityName,
        source
      });
      this.hasError.set(false);
    } catch {
      // Keep showing the last good reading; just remember that this refresh failed.
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /** The place to show next to the weather, in the app language. Never a raw technical word. */
  placeLabel(weather: Pick<WeatherData, 'source' | 'cityName'>): string {
    if (weather.source === 'user' && weather.cityName) return weather.cityName;
    return this.translation.t(weather.source === 'geo' ? 'WEATHER.YOUR_LOCATION' : 'WEATHER.DEFAULT_CITY');
  }

  /** Searches cities by name (Open-Meteo geocoding). Rejects when the search itself fails. */
  async searchCities(query: string): Promise<WeatherCity[]> {
    const name = query.trim();
    if (name.length < 2) return [];
    const language = this.translation.currentLang();
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=6&language=${encodeURIComponent(language)}&format=json`;
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error('City search failed');
    const data = await res.json();
    const results: unknown[] = Array.isArray(data?.results) ? data.results : [];
    return results
      .map(r => {
        if (!isRecord(r)) return null;
        const region = [r['admin1'], r['country']].filter(x => typeof x === 'string' && x).join(', ');
        return toWeatherCity({ name: r['name'], latitude: r['latitude'], longitude: r['longitude'], region });
      })
      .filter((c): c is WeatherCity => c !== null);
  }

  /** Pins the weather to a city the user picked. */
  chooseCity(city: WeatherCity): Promise<void> {
    const valid = toWeatherCity(city);
    if (!valid) return Promise.resolve();
    this.city.set(valid);
    writeStorage(CITY_KEY, JSON.stringify(valid));
    return this.initWeather();
  }

  /** Forgets the picked city and goes back to the user's location. */
  useMyLocation(): Promise<void> {
    this.city.set(null);
    removeStorage(CITY_KEY);
    return this.initWeather();
  }

  private interpretWeatherCode(code: number, isDay: boolean): { condition: string; description: string; icon: string } {
    // WMO Weather interpretation codes (WW)
    if (code === 0) {
      return isDay
        ? { condition: 'sunny', description: 'Céu Limpo', icon: '☀️' }
        : { condition: 'clear-night', description: 'Noite Estrelada', icon: '🌙' };
    }
    if ([1, 2, 3].includes(code)) {
      return isDay
        ? { condition: 'cloudy', description: 'Parcialmente Nublado', icon: '⛅' }
        : { condition: 'cloudy', description: 'Céu Nublado', icon: '☁️' };
    }
    if ([45, 48].includes(code)) {
      return { condition: 'cloudy', description: 'Nevoeiro', icon: '🌫️' };
    }
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
      return { condition: 'rainy', description: 'Chuva', icon: '🌧️' };
    }
    if ([71, 73, 75, 85, 86].includes(code)) {
      return { condition: 'snowy', description: 'Neve', icon: '❄️' };
    }
    if ([95, 96, 99].includes(code)) {
      return { condition: 'stormy', description: 'Trovoada', icon: '⛈️' };
    }

    return { condition: 'sunny', description: 'Ameno', icon: '🌤️' };
  }
}
