import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ClockComponent } from './clock.component';
import { WeatherService } from '../../services/weather.service';
import { DeskDisplayStatusService, DESK_STATUS_KEY } from '../../services/screen/desk-display-status.service';
import { TranslationService } from '../../services/translation.service';

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
        { provide: WeatherService, useValue: { weather: signal(null), initWeather: () => undefined } }
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
