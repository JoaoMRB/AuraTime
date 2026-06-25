import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface WorldClock {
  id: string;
  label: string;
  timezone: string;
  offset: number;
}

@Injectable({
  providedIn: 'root'
})
export class WorldClockService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private clocks = signal<WorldClock[]>([
    {
      id: '1',
      label: 'New York',
      timezone: 'America/New_York',
      offset: -5
    },
    {
      id: '2',
      label: 'London',
      timezone: 'Europe/London',
      offset: 0
    },
    {
      id: '3',
      label: 'Tokyo',
      timezone: 'Asia/Tokyo',
      offset: 9
    }
  ]);

  allClocks = computed(() => this.clocks());

  constructor() {
    if (this.isBrowser) {
      this.loadFromStorage();
      this.refreshOffsets();
    }
  }

  // Get time for a specific timezone
  getTime(timezone: string): string {
    try {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      return new Intl.DateTimeFormat('en-US', options).format(now);
    } catch (e) {
      return '--:--';
    }
  }

  // Get date for a specific timezone
  getDate(timezone: string): string {
    try {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      };
      return new Intl.DateTimeFormat('en-US', options).format(now);
    } catch (e) {
      return '';
    }
  }

  // Add a new clock
  addClock(clock: Omit<WorldClock, 'id'>): void {
    const offsetHours = this.getTimezoneOffsetMinutes(clock.timezone) / 60;
    const newClock: WorldClock = {
      ...clock,
      offset: offsetHours,
      id: Date.now().toString()
    };
    this.clocks.update(clocks => [...clocks, newClock]);
    this.saveToStorage();
  }

  // Remove a clock
  removeClock(id: string): void {
    this.clocks.update(clocks => clocks.filter(c => c.id !== id));
    this.saveToStorage();
  }

  // Update clock label
  updateClockLabel(id: string, label: string): void {
    this.clocks.update(clocks =>
      clocks.map(c => c.id === id ? { ...c, label } : c)
    );
    this.saveToStorage();
  }

  // Get popular timezones
  getPopularTimezones(): Array<{ timezone: string; label: string; offset: number }> {
    return [
      { timezone: 'America/New_York', label: 'New York', offset: -5 },
      { timezone: 'America/Los_Angeles', label: 'Los Angeles', offset: -8 },
      { timezone: 'America/Chicago', label: 'Chicago', offset: -6 },
      { timezone: 'Europe/London', label: 'London', offset: 0 },
      { timezone: 'Europe/Paris', label: 'Paris', offset: 1 },
      { timezone: 'Europe/Berlin', label: 'Berlin', offset: 1 },
      { timezone: 'Asia/Tokyo', label: 'Tokyo', offset: 9 },
      { timezone: 'Asia/Shanghai', label: 'Shanghai', offset: 8 },
      { timezone: 'Asia/Dubai', label: 'Dubai', offset: 4 },
      { timezone: 'Australia/Sydney', label: 'Sydney', offset: 11 },
      { timezone: 'America/Sao_Paulo', label: 'São Paulo', offset: -3 },
      { timezone: 'Asia/Mumbai', label: 'Mumbai', offset: 5.5 }
    ];
  }

  getTimezoneOffsetMinutes(timezone: string, date = new Date()): number {
    try {
      const getParts = (tz: string) => {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const parts = fmt.formatToParts(date);
        const value = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
        return {
          y: value('year'),
          m: value('month'),
          d: value('day'),
          h: value('hour'),
          min: value('minute'),
          s: value('second')
        };
      };

      const utcParts = getParts('UTC');
      const tzParts = getParts(timezone);
      const utcMs = Date.UTC(utcParts.y, utcParts.m - 1, utcParts.d, utcParts.h, utcParts.min, utcParts.s);
      const tzMs = Date.UTC(tzParts.y, tzParts.m - 1, tzParts.d, tzParts.h, tzParts.min, tzParts.s);
      return (tzMs - utcMs) / 60000;
    } catch {
      return 0;
    }
  }

  formatOffsetMinutes(minutes: number): string {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    if (m === 0) {
      return `${sign}${h}`;
    }
    return `${sign}${h}:${String(m).padStart(2, '0')}`;
  }

  getUtcOffsetLabel(timezone: string): string {
    return this.formatOffsetMinutes(this.getTimezoneOffsetMinutes(timezone));
  }

  getHoursFromLocal(timezone: string): number {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localOffset = this.getTimezoneOffsetMinutes(localTz);
    const targetOffset = this.getTimezoneOffsetMinutes(timezone);
    return Math.round((targetOffset - localOffset) / 60);
  }

  // Calculate time difference from local (hours, rounded)
  getTimeDifference(timezone: string): number {
    return this.getHoursFromLocal(timezone);
  }

  private refreshOffsets(): void {
    this.clocks.update(clocks =>
      clocks.map(c => ({
        ...c,
        offset: this.getTimezoneOffsetMinutes(c.timezone) / 60
      }))
    );
    this.saveToStorage();
  }

  // Persistence
  private saveToStorage(): void {
    try {
      localStorage.setItem('auratime_worldclocks', JSON.stringify(this.clocks()));
    } catch (e) {
      console.warn('Could not save world clocks to localStorage', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('auratime_worldclocks');
      if (data) {
        const parsed = JSON.parse(data) as WorldClock[];
        if (parsed.length > 0) {
          this.clocks.set(parsed);
        }
      }
    } catch (e) {
      console.warn('Could not load world clocks from localStorage', e);
    }
  }

  // Reset to default
  resetToDefaults(): void {
    this.clocks.set([
      {
        id: '1',
        label: 'New York',
        timezone: 'America/New_York',
        offset: -5
      },
      {
        id: '2',
        label: 'London',
        timezone: 'Europe/London',
        offset: 0
      },
      {
        id: '3',
        label: 'Tokyo',
        timezone: 'Asia/Tokyo',
        offset: 9
      }
    ]);
    this.refreshOffsets();
  }
}
