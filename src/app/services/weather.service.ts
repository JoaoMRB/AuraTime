import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface WeatherData {
  temperature: number; // Celsius
  condition: string; // 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'clear-night'
  description: string;
  icon: string;
  cityName: string;
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  weather = signal<WeatherData | null>(null);
  isLoading = signal<boolean>(false);
  hasError = signal<boolean>(false);

  constructor() {
    if (this.isBrowser) {
      this.initWeather();
    }
  }

  async initWeather(): Promise<void> {
    this.isLoading.set(true);
    this.hasError.set(false);

    // Try geolocation first, or fallback to IP/default
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          this.fetchWeather(pos.coords.latitude, pos.coords.longitude, 'Local');
        },
        () => {
          // Fallback to default (Lisbon: lat 38.72, lon -9.14)
          this.fetchWeather(38.72, -9.14, 'Lisboa');
        },
        { timeout: 5000 }
      );
    } else {
      this.fetchWeather(38.72, -9.14, 'Lisboa');
    }
  }

  async fetchWeather(lat: number, lon: number, defaultCityName: string): Promise<void> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather fetch failed');
      const data = await res.json();

      const current = data.current;
      const code = current.weather_code;
      const isDay = current.is_day === 1;

      const { condition, description, icon } = this.interpretWeatherCode(code, isDay);

      this.weather.set({
        temperature: Math.round(current.temperature_2m),
        condition,
        description,
        icon,
        cityName: defaultCityName
      });
      this.isLoading.set(false);
    } catch (e) {
      this.hasError.set(true);
      this.isLoading.set(false);
    }
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
