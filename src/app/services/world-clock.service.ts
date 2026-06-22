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
    const newClock: WorldClock = {
      ...clock,
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

  // Calculate time difference from local
  getTimeDifference(timezone: string): string {
    try {
      const now = new Date();
      const localOffset = now.getTimezoneOffset() / -60;
      
      const targetTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const localTime = new Date();
      
      const diffHours = Math.round((targetTime.getTime() - localTime.getTime()) / (1000 * 60 * 60));
      
      if (diffHours === 0) return 'Same time';
      if (diffHours > 0) return `+${diffHours}h`;
      return `${diffHours}h`;
    } catch (e) {
      return '';
    }
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
    this.saveToStorage();
  }
}
