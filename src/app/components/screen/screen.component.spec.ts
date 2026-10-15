import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ScreenComponent } from './screen.component';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { SERIAL_API } from '../../services/screen/serial-link.service';
import { TranslationService } from '../../services/translation.service';
import { FakePort, FakeSerial } from '../../services/screen/testing/fake-serial';
import { REQUIRED_FONT_SHORTHANDS } from '../../services/screen/screen-renderer';
import { AlarmService } from '../../services/alarm.service';

describe('ScreenComponent (Desk Display page)', () => {
  let serial: FakeSerial | null;

  async function render(withSerial = true): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    serial = withSerial ? new FakeSerial() : null;
    if (serial) {
      serial.picked = new FakePort();
      serial.ports = [];
    }
    TestBed.configureTestingModule({
      imports: [ScreenComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SERIAL_API, useValue: serial }
      ]
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick(); // runs afterNextRender: the page leaves its "first render" state
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
  const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button')).map(b => (b.textContent ?? '').trim());

  beforeEach(async () => {
    localStorage.clear();
    await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
  });
  afterEach(() => localStorage.clear());

  describe('in a browser with Web Serial', () => {
    it('shows the 3-step wizard in order, with the browser step already done', async () => {
      const { el } = await render();
      const headings = Array.from(el.querySelectorAll('article h2')).map(h => (h.textContent ?? '').trim());
      expect(headings).toEqual(['Check your browser', 'Connect your display', 'Choose what to show']);
      expect(text(el)).toContain('Great: this browser can talk to USB displays.');
      expect(text(el)).not.toContain('needs Chrome or Edge');
    });

    it('starts in demo mode: the preview is labelled and the canvas is in the page', async () => {
      const { el } = await render();
      expect(text(el)).toContain('Demo preview');
      expect(text(el)).toContain('Sample data. Connect a display to show your own.');
      const canvas = el.querySelector('canvas')!;
      expect(canvas).toBeTruthy();
      expect(canvas.width).toBe(480);
      expect(canvas.height).toBe(320);
    });

    it('offers to connect, and does so through the output service', async () => {
      const { el, fixture } = await render();
      const connect = spyOn(TestBed.inject(ScreenOutputService), 'connect').and.resolveTo(false);
      const button = Array.from(el.querySelectorAll('button')).find(b => (b.textContent ?? '').includes('Connect display'))!;
      expect(button).toBeTruthy();
      button.click();
      fixture.detectChanges();
      expect(connect).toHaveBeenCalledTimes(1);
      expect(text(el)).toContain('Status: not connected');
    });

    it('keeps the diagnostics inside a collapsed "Advanced" section', async () => {
      const { el } = await render();
      const details = el.querySelector('details')!;
      expect(details).toBeTruthy();
      expect(details.open).toBeFalse();
      expect(details.querySelector('summary')!.textContent).toContain('Advanced');
      const advancedText = text(details);
      expect(advancedText).toContain('Always send the full screen');
      expect(advancedText).toContain('Slow send');
      expect(advancedText).toContain('Flow control (RTS/CTS)');
      // none of the diagnostics leaks into the main steps
      const steps = Array.from(el.querySelectorAll('article')).map(a => text(a)).join(' ');
      expect(steps).not.toContain('Always send the full screen');
    });

    it('wires the Advanced options to the output service', async () => {
      const { el, fixture } = await render();
      const output = TestBed.inject(ScreenOutputService);
      const box = (label: string) =>
        Array.from(el.querySelectorAll('details label')).find(l => (l.textContent ?? '').includes(label))!
          .querySelector('input') as HTMLInputElement;

      const full = box('Always send the full screen');
      full.checked = true;
      full.dispatchEvent(new Event('change'));
      expect(output.alwaysFullFrame()).toBeTrue();

      const slow = box('Slow send');
      slow.checked = true;
      slow.dispatchEvent(new Event('change'));
      expect(output.slowSend()).toBeTrue();

      const demo = box('sample data');
      demo.checked = false;
      demo.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(output.demoEnabled()).toBeFalse();
    });

    it('lets the user pin the theme and font, and follow the app again', async () => {
      const { el, fixture } = await render();
      const output = TestBed.inject(ScreenOutputService);
      const theme = el.querySelector('#theme') as HTMLSelectElement;
      const font = el.querySelector('#font') as HTMLSelectElement;
      expect(theme.value).toBe(''); // follows the app by default
      expect(font.value).toBe('');

      theme.value = 'obsidian-platinum';
      theme.dispatchEvent(new Event('change'));
      font.value = 'orbitron';
      font.dispatchEvent(new Event('change'));
      expect(output.themePin()).toBe('obsidian-platinum');
      expect(output.fontPin()).toBe('orbitron');

      theme.value = '';
      theme.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(output.themePin()).toBeNull();
    });

    it('shows the saved choices in the controls (not the defaults)', async () => {
      localStorage.setItem('auratime_screen', JSON.stringify({
        themePin: 'dark-glass', fontPin: 'playfair', viewMode: 'week',
        brightness: { base: 30, nightEnabled: true, nightFromHour: 22, nightToHour: 6, nightLevel: 5, nightBlack: false }
      }));
      const { el } = await render();
      expect((el.querySelector('#theme') as HTMLSelectElement).value).toBe('dark-glass');
      expect((el.querySelector('#font') as HTMLSelectElement).value).toBe('playfair');
      expect((el.querySelector('#view') as HTMLSelectElement).value).toBe('week');
      expect((el.querySelector('#from') as HTMLSelectElement).value).toBe('22');
      expect((el.querySelector('#to') as HTMLSelectElement).value).toBe('6');
    });

    it('lists every view in the rotation with a checkbox', async () => {
      const { el } = await render();
      const items = Array.from(el.querySelectorAll('fieldset label')).map(l => text(l as HTMLElement));
      expect(items.length).toBe(6);
      expect(items.join(' ')).toContain('World clocks');
      const output = TestBed.inject(ScreenOutputService);
      const worldBox = (Array.from(el.querySelectorAll('fieldset label')).find(l => (l.textContent ?? '').includes('World clocks'))!
        .querySelector('input') as HTMLInputElement);
      worldBox.checked = false;
      worldBox.dispatchEvent(new Event('change'));
      expect(output.rotation()).not.toContain('world');
    });

    it('follows the app language', async () => {
      const { el, fixture } = await render();
      const ts = TestBed.inject(TranslationService);
      ts.currentLang.set('de');
      ts.translations.set({
        SCREEN: { PAGE: { S1: { TITLE: 'Browser prüfen' }, S2: { TITLE: 'Bildschirm verbinden' } } }
      });
      fixture.detectChanges();
      const headings = Array.from(el.querySelectorAll('article h2')).map(h => (h.textContent ?? '').trim());
      expect(headings.slice(0, 2)).toEqual(['Browser prüfen', 'Bildschirm verbinden']);
      expect(headings[2]).toBe('Choose what to show'); // missing key falls back to English, never to a raw key
      expect((el.querySelector('#lang') as HTMLSelectElement).value).toBe('de');
    });

    it('sets its own title and description for search engines', async () => {
      await render();
      expect(document.title).toBe('Desk Display | USB screen for AuraTime');
      const description = document.querySelector('meta[name="description"]')!.getAttribute('content')!;
      expect(description).toContain('USB screen');
      expect(description).toContain('Chrome or Edge');
    });

    it('states the compatibility without suggesting a partnership', async () => {
      const { el } = await render();
      expect(text(el)).toContain('Compatible with Turing Smart Screen 3.5" (USB) displays.');
      expect(text(el)).toContain('not affiliated with any display manufacturer');
    });

    it('never shows a raw translation key', async () => {
      const { el } = await render();
      expect(text(el)).not.toMatch(/SCREEN\.[A-Z_]+\./);
    });
  });

  describe('alarms', () => {
    it('stay silent while the page is open and work again as soon as the visitor leaves it', async () => {
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(2026, 0, 15, 7, 29, 50));
        const { fixture } = await render();
        const alarms = TestBed.inject(AlarmService);

        alarms.addAlarm({ label: 'Wake up', time: '07:30', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime' });
        jasmine.clock().tick(11_000);
        expect(alarms.isAlarmRinging()).withContext('while on /screen').toBeFalse();

        fixture.destroy(); // navigating away from /screen in the same app
        alarms.addAlarm({ label: 'Next', time: '07:31', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime' });
        jasmine.clock().tick(60_000);
        expect(alarms.isAlarmRinging()).withContext('after leaving /screen').toBeTrue();
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });

  describe('in a browser without Web Serial (Firefox, Safari, phones)', () => {
    it('explains to use Chrome or Edge on a computer', async () => {
      const { el } = await render(false);
      expect(text(el)).toContain('Desk Display needs Chrome or Edge on a computer');
      expect(text(el)).toContain('Firefox, Safari or a phone browser');
    });

    it('shows no connect button, no steps that cannot work, no diagnostics and no errors', async () => {
      const { el } = await render(false);
      expect(buttons(el).some(b => b.includes('Connect display'))).toBeFalse();
      expect(el.querySelectorAll('article').length).toBe(1);
      expect(el.querySelector('details')).toBeNull();
      expect(text(el)).not.toContain('unsupported');
      expect(text(el)).not.toMatch(/SCREEN\.[A-Z_]+\./);
      expect(text(el)).not.toContain('error');
    });

    it('still shows the demo preview, so the visitor sees what the display does', async () => {
      const { el } = await render(false);
      expect(text(el)).toContain('This is what the display shows:');
      expect(text(el)).toContain('Demo preview');
      expect(el.querySelector('canvas')).toBeTruthy();
      expect(TestBed.inject(ScreenOutputService).demoActive()).toBeTrue();
    });

    it('keeps the demo on even if the user turned it off before', async () => {
      localStorage.setItem('auratime_screen', JSON.stringify({ demo: false }));
      await render(false);
      expect(TestBed.inject(ScreenOutputService).demoActive()).toBeTrue();
    });
  });
});
