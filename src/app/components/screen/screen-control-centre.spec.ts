import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ScreenComponent } from './screen.component';
import { ScreenViewsComponent } from './screen-views.component';
import { ScreenOutputService, sanitizeScreenPrefs } from '../../services/screen/screen-output.service';
import { SerialLinkService, SERIAL_API } from '../../services/screen/serial-link.service';
import { LOCKS_API } from '../../services/web-locks';
import { FakePort, FakeSerial } from '../../services/screen/testing/fake-serial';
import { REQUIRED_FONT_SHORTHANDS } from '../../services/screen/screen-renderer';
import { ALL_SCREEN_VIEWS } from '../../services/screen/display-snapshot';
import { rotationInfo } from '../../services/screen/screen-logic';

const HELLO_OK = new Uint8Array([1, 1, 1, 1, 1, 1]);
const flush = (ms = 0) => new Promise(r => setTimeout(r, ms));

describe('Desk Display control centre', () => {
  let serial: FakeSerial;
  let fixture: ComponentFixture<ScreenComponent>;
  let el: HTMLElement;
  let output: ScreenOutputService;

  async function render(options: { connect?: boolean } = {}): Promise<void> {
    serial = new FakeSerial();
    serial.picked = new FakePort();
    serial.ports = [];
    TestBed.configureTestingModule({
      imports: [ScreenComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: SERIAL_API, useValue: serial },
        { provide: LOCKS_API, useValue: null }
      ]
    });
    output = TestBed.inject(ScreenOutputService);
    output.bandPauseMs.set(0);
    fixture = TestBed.createComponent(ScreenComponent);
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    if (options.connect) {
      serial.picked!.reader.replies.push(HELLO_OK);
      await output.connect();
      await flush(400);
    } else {
      (el.querySelector('[data-testid="customize"]') as HTMLButtonElement).click();
    }
    fixture.detectChanges();
  }

  const q = <T extends Element = HTMLElement>(selector: string) => el.querySelector(selector) as T;
  const qa = <T extends Element = HTMLElement>(selector: string) => Array.from(el.querySelectorAll(selector)) as T[];
  const text = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ');
  const stored = () => {
    TestBed.flushEffects(); // preferences are saved by an effect
    return JSON.parse(localStorage.getItem('auratime_screen')!);
  };
  const order = () => qa('app-screen-views li').map(li => li.getAttribute('data-view'));

  beforeEach(async () => {
    localStorage.clear();
    await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
  });
  afterEach(() => localStorage.clear());

  describe('modes', () => {
    it('starts in setup mode: the steps are compact and there is no control centre', async () => {
      serial = new FakeSerial();
      serial.picked = new FakePort();
      TestBed.configureTestingModule({
        imports: [ScreenComponent],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: SERIAL_API, useValue: serial }, { provide: LOCKS_API, useValue: null }]
      });
      const f = TestBed.createComponent(ScreenComponent);
      f.detectChanges();
      TestBed.inject(ApplicationRef).tick();
      f.detectChanges();
      const root = f.nativeElement as HTMLElement;
      // the finished browser step is a single line with a check
      expect(root.querySelector('[data-testid="step-browser"]')!.textContent).toContain('Great: this browser can talk to USB displays.');
      expect(root.querySelector('app-screen-views')).toBeNull();
      expect(root.querySelector('[data-testid="pause"]')).toBeNull(); // no transport controls yet
      expect(root.querySelector('[data-testid="customize"]')).toBeTruthy();
    });

    it('switches to the control centre when the display connects, with a status pill and a disconnect action', async () => {
      await render({ connect: true });
      expect(q('app-screen-views')).toBeTruthy();
      expect(q('[data-testid="pause"]')).toBeTruthy();
      expect(text(q('[data-testid="status-pill"]'))).toContain('Connected · UsbMonitor 3.5');

      q('[data-testid="status-pill"]').click();
      fixture.detectChanges();
      expect(q('[data-testid="status-pill"]').getAttribute('aria-expanded')).toBe('true');
      q('[data-testid="disconnect"]').click();
      await flush(50);
      fixture.detectChanges();
      expect(TestBed.inject(SerialLinkService).status()).toBe('disconnected');
      expect(q('app-screen-views')).toBeNull(); // back to setup
    });

    it('Escape closes the status menu', async () => {
      await render({ connect: true });
      q('[data-testid="status-pill"]').click();
      fixture.detectChanges();
      expect(q('[data-testid="status-menu"]')).toBeTruthy();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(q('[data-testid="status-menu"]')).toBeNull();
    });

    it('can be opened before connecting (it then customises the demo) and left again', async () => {
      await render();
      expect(q('app-screen-views')).toBeTruthy();
      expect(text(q('[data-testid="not-connected-banner"]'))).toContain('customising the demo preview');
      (qa('[data-testid="not-connected-banner"] button')[0]).click();
      fixture.detectChanges();
      expect(q('app-screen-views')).toBeNull();
    });
  });

  describe('transport controls', () => {
    beforeEach(async () => {
      await render({ connect: true });
    });

    it('every icon-only button has an accessible name', () => {
      for (const button of qa<HTMLButtonElement>('[data-testid="prev"], [data-testid="pause"], [data-testid="next"], [data-testid="pin"]')) {
        expect(button.getAttribute('aria-label')!.length).toBeGreaterThan(2);
      }
      for (const button of qa<HTMLButtonElement>('app-screen-views [data-testid="up"], app-screen-views [data-testid="down"]')) {
        expect(button.getAttribute('aria-label')).toMatch(/Move .* (up|down)/);
      }
    });

    it('next / previous move through the rotation order and back', () => {
      const start = output.activeView();
      q('[data-testid="next"]').click();
      const second = output.activeView();
      expect(second).not.toBe(start);
      q('[data-testid="next"]').click();
      expect(output.activeView()).not.toBe(second);
      q('[data-testid="prev"]').click();
      q('[data-testid="prev"]').click();
      expect(output.activeView()).toBe(start);
    });

    it('pause holds the current view, resume lets the rotation go on', () => {
      const view = output.activeView();
      q('[data-testid="pause"]').click();
      fixture.detectChanges();
      expect(output.paused()).toBeTrue();
      expect(q('[data-testid="pause"]').getAttribute('aria-pressed')).toBe('true');
      expect(q('[data-testid="pause"]').getAttribute('aria-label')).toBe('Resume rotation');
      expect(text(q('[data-testid="rotation-state"]'))).toContain('Rotation paused');
      expect(output.activeView()).toBe(view);

      q('[data-testid="pause"]').click();
      fixture.detectChanges();
      expect(output.paused()).toBeFalse();
      expect(output.activeView()).toBe(view); // resumes where it stopped
    });

    it('next while paused moves the held view', () => {
      q('[data-testid="pause"]').click();
      const held = output.activeView();
      q('[data-testid="next"]').click();
      expect(output.paused()).toBeTrue();
      expect(output.activeView()).not.toBe(held);
    });

    it('pin keeps the display on the current view and survives a reload; unpin returns to the rotation', () => {
      const view = output.activeView();
      q('[data-testid="pin"]').click();
      fixture.detectChanges();
      expect(output.viewMode()).toBe(view);
      expect(stored().viewMode).toBe(view);
      expect(q('[data-testid="pin"]').getAttribute('aria-pressed')).toBe('true');
      expect(q<HTMLButtonElement>('[data-testid="pause"]').disabled).toBeTrue(); // a pinned view is already held
      expect(text(q('[data-testid="rotation-state"]'))).toContain('Pinned');

      q('[data-testid="pin"]').click();
      fixture.detectChanges();
      expect(output.viewMode()).toBe('auto');
      expect(q('[data-testid="pin"]').getAttribute('aria-pressed')).toBe('false');
    });

    it('next while pinned moves the pin', () => {
      q('[data-testid="pin"]').click();
      const pinned = output.viewMode();
      q('[data-testid="next"]').click();
      expect(output.viewMode()).not.toBe('auto');
      expect(output.viewMode()).not.toBe(pinned);
    });

    it('clicking the preview shows the next view', () => {
      const start = output.activeView();
      q('app-screen-hero [role="button"]').click();
      expect(output.activeView()).not.toBe(start);
    });

    it('shows the view name, the time left and a progress bar for the rotation', () => {
      expect(q('[data-testid="view-name"]').textContent!.trim().length).toBeGreaterThan(0);
      expect(text(q('[data-testid="rotation-state"]'))).toMatch(/Rotating · next in \d+ s/);
      const bar = q('[role="progressbar"]');
      expect(Number(bar.getAttribute('aria-valuemax'))).toBe(output.rotationProgress().durationSec);
    });

    describe('keyboard', () => {
      const press = (key: string, target: EventTarget = document.body) => {
        const event = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event;
      };

      it('→ and ← change the view, Space pauses and resumes', () => {
        const start = output.activeView();
        expect(press('ArrowRight').defaultPrevented).toBeTrue();
        const second = output.activeView();
        expect(second).not.toBe(start);
        press('ArrowLeft');
        expect(output.activeView()).toBe(start);

        press(' ');
        expect(output.paused()).toBeTrue();
        press(' ');
        expect(output.paused()).toBeFalse();
      });

      it('leaves the keys alone inside form controls (sliders, switches, selects)', () => {
        const start = output.activeView();
        const slider = q('app-screen-views [data-testid="duration"]');
        const event = press('ArrowRight', slider);
        expect(event.defaultPrevented).toBeFalse();
        expect(output.activeView()).toBe(start);
        press(' ', q('app-screen-views [data-testid="toggle"]'));
        expect(output.paused()).toBeFalse();
      });
    });
  });

  describe('views gallery', () => {
    beforeEach(async () => {
      await render();
    });

    it('shows one card per view, in rotation order, each with a thumbnail canvas', () => {
      expect(order()).toEqual([...ALL_SCREEN_VIEWS]);
      expect(qa('app-screen-views canvas').length).toBe(6);
    });

    it('the on/off switch updates the rotation and is saved', () => {
      const sw = q('app-screen-views li[data-view="weather"] [data-testid="toggle"]');
      expect(sw.getAttribute('aria-checked')).toBe('true');
      sw.click();
      fixture.detectChanges();
      expect(sw.getAttribute('aria-checked')).toBe('false');
      expect(output.rotation()).not.toContain('weather');
      expect(stored().rotation).not.toContain('weather');
      expect(q<HTMLInputElement>('app-screen-views li[data-view="weather"] [data-testid="duration"]').disabled).toBeTrue();
    });

    it('up / down buttons reorder the cards, the order is saved and the rotation follows it', () => {
      q('app-screen-views li[data-view="world"] [data-testid="up"]').click();
      fixture.detectChanges();
      expect(order()).toEqual(['clock', 'focus', 'week', 'world', 'alarm', 'weather']);
      expect(stored().viewOrder).toEqual(['clock', 'focus', 'week', 'world', 'alarm', 'weather']);
      expect(output.activeRotation().indexOf('world')).toBeLessThan(output.activeRotation().indexOf('alarm'));

      q('app-screen-views li[data-view="clock"] [data-testid="down"]').click();
      fixture.detectChanges();
      expect(order().slice(0, 2)).toEqual(['focus', 'clock']);
      expect(text(q('app-screen-views [role="status"]'))).toContain('Clock is now number 2 of 6');
    });

    it('the first card cannot go up and the last cannot go down', () => {
      expect((q('app-screen-views li:first-child [data-testid="up"]') as HTMLButtonElement).disabled).toBeTrue();
      expect((q('app-screen-views li:last-child [data-testid="down"]') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('dragging a card onto another reorders them', () => {
      const views = fixture.debugElement.query(x => x.componentInstance instanceof ScreenViewsComponent).componentInstance as ScreenViewsComponent;
      const drag = (type: string) => Object.assign(new Event(type, { cancelable: true }), { dataTransfer: new DataTransfer() }) as DragEvent;
      views.onDragStart(drag('dragstart'), 'weather', q('app-screen-views li[data-view="weather"]'));
      views.onDragOver(drag('dragover'), 'clock');
      views.onDrop(drag('drop'), 'clock');
      fixture.detectChanges();
      expect(order()[0]).toBe('weather');
      expect(stored().viewOrder[0]).toBe('weather');
    });

    it('a duration between 10 and 60 s is saved and reaches the rotation', () => {
      const slider = q<HTMLInputElement>('app-screen-views li[data-view="clock"] [data-testid="duration"]');
      expect([slider.min, slider.max]).toEqual(['10', '60']);
      slider.value = '45';
      slider.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(output.viewSeconds().clock).toBe(45);
      expect(stored().viewSeconds.clock).toBe(45);
      expect(text(q('app-screen-views li[data-view="clock"]'))).toContain('45 s');

      const info = rotationInfo({
        mode: 'auto', focusRunning: false, enabled: output.rotation(), hasContent: Object.fromEntries(ALL_SCREEN_VIEWS.map(v => [v, true])) as never,
        nowMs: 1000, order: output.viewOrder(), durations: output.viewSeconds()
      });
      expect(info.view).toBe('clock');
      expect(info.durationSec).toBe(45);

      output.setViewSeconds('clock', 500);
      expect(output.viewSeconds().clock).toBe(60);
    });

    it('a view with nothing to show gets a hint and a link to where it is set up', () => {
      const week = q('app-screen-views li[data-view="week"]');
      expect(text(week)).toContain('Nothing to show yet');
      expect(text(week)).toContain('Complete a focus session and this week appears here.');
      const link = week.querySelector('a') as HTMLAnchorElement;
      expect(text(link)).toContain('Start a focus session');
      expect(link.getAttribute('href')).toBe('/app');
      // clock and focus always have something
      expect(q('app-screen-views li[data-view="clock"] [data-testid="empty-hint"]')).toBeNull();
    });

    it('redraws the thumbnails only while the section is visible, not while a frame is being sent, and not too often', async () => {
      const views = fixture.debugElement.query(x => x.componentInstance instanceof ScreenViewsComponent).componentInstance as ScreenViewsComponent;
      const before = views.drawCount;
      views.refresh();
      expect(views.drawCount).toBe(before + 1);

      spyOn(output, 'isSending').and.returnValue(true);
      const sending = views.drawCount;
      views.refresh();
      expect(views.drawCount).toBe(sending); // while sending, the refresh gives up before touching any canvas
      const canvas = q<HTMLCanvasElement>('app-screen-views canvas');
      const draw = spyOn(canvas.getContext('2d')!, 'drawImage');
      await flush(20);
      expect(draw).not.toHaveBeenCalled();
    });
  });

  describe('appearance', () => {
    beforeEach(async () => {
      await render();
    });

    it('offers the five themes as swatches and picking one pins it, shown in the preview at once', async () => {
      const swatches = qa('[data-testid="theme-swatch"]');
      expect(swatches.length).toBe(5);
      const before = output.canvas!.getContext('2d')!.getImageData(5, 5, 1, 1).data.join(',');
      q('[data-testid="theme-swatch"][data-theme="light-glass"]').click();
      fixture.detectChanges();
      expect(output.themePin()).toBe('light-glass');
      expect(q('[data-testid="theme-swatch"][data-theme="light-glass"]').getAttribute('aria-checked')).toBe('true');
      await flush(60); // the preview is redrawn on the next animation frame
      const after = output.canvas!.getContext('2d')!.getImageData(5, 5, 1, 1).data.join(',');
      expect(after).not.toBe(before);
      expect(stored().themePin).toBe('light-glass');
    });

    it('font is a segmented control with a sample of each font', () => {
      const options = qa('[data-testid="font-option"]');
      expect(options.map(o => o.getAttribute('data-font'))).toEqual(['outfit', 'orbitron', 'inter', 'playfair']);
      expect(options.every(o => o.querySelector('[style*="font-family"]'))).toBeTrue();
      q('[data-testid="font-option"][data-font="playfair"]').click();
      expect(output.fontPin()).toBe('playfair');
    });

    it('arrow keys move the choice inside the radio group', () => {
      const first = q('[data-testid="theme-swatch"][aria-checked="true"]');
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(output.themePin()).not.toBeNull();
      expect(q('[data-testid="theme-swatch"][aria-checked="true"]')).not.toBe(first);
    });
  });

  describe('schedule', () => {
    beforeEach(async () => {
      await render();
    });

    const handle = (name: 'from' | 'to') => q(`[data-handle="${name}"]`);
    const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

    it('has two labelled slider handles for the night start and end', () => {
      expect(handle('from').getAttribute('role')).toBe('slider');
      expect(handle('from').getAttribute('aria-label')).toBe('Night starts');
      expect(handle('to').getAttribute('aria-label')).toBe('Night ends');
      expect(handle('from').getAttribute('aria-valuetext')).toBe('23:00');
      expect(handle('to').getAttribute('aria-valuetext')).toBe('07:00');
    });

    it('the arrow keys move a handle by an hour, wrapping around midnight; the choice is saved', () => {
      key(handle('from'), 'ArrowRight');
      fixture.detectChanges();
      expect(output.brightness().nightFromHour).toBe(0); // 23 -> 0
      key(handle('from'), 'ArrowLeft');
      key(handle('from'), 'ArrowLeft');
      expect(output.brightness().nightFromHour).toBe(22);
      key(handle('to'), 'PageUp');
      expect(output.brightness().nightToHour).toBe(10);
      key(handle('to'), 'Home');
      expect(output.brightness().nightToHour).toBe(0);
      key(handle('to'), 'End');
      expect(output.brightness().nightToHour).toBe(23);
      expect(stored().brightness.nightFromHour).toBe(22);
    });

    it('dragging a handle snaps it to the hour under the pointer', () => {
      const bar = q('[data-testid="timeline"]');
      const rect = bar.getBoundingClientRect();
      const h = handle('to');
      const event = (type: string, x: number) => new PointerEvent(type, { clientX: x, pointerId: 1, bubbles: true, cancelable: true });
      h.dispatchEvent(event('pointerdown', rect.left + rect.width * (9.2 / 24)));
      expect(output.brightness().nightToHour).toBe(9);
      h.setPointerCapture(1);
      h.dispatchEvent(event('pointermove', rect.left + rect.width * (5.6 / 24)));
      expect(output.brightness().nightToHour).toBe(6);
    });

    it('shows the night as a segment, two when it crosses midnight', () => {
      expect(qa('[data-testid="night-segment"]').length).toBe(2); // 23:00 -> 07:00
      output.patchBrightness({ nightFromHour: 1, nightToHour: 5 });
      fixture.detectChanges();
      expect(qa('[data-testid="night-segment"]').length).toBe(1);
      output.patchBrightness({ nightEnabled: false });
      fixture.detectChanges();
      expect(qa('[data-testid="night-segment"]').length).toBe(0);
      expect(text(q('[data-testid="schedule-summary"]'))).toContain('No night schedule');
    });

    it('has a brightness slider for each period and the black-screen option', () => {
      const day = q<HTMLInputElement>('[data-testid="day-level"]');
      day.value = '80';
      day.dispatchEvent(new Event('input'));
      expect(output.brightness().base).toBe(80);
      const night = q<HTMLInputElement>('[data-testid="night-level"]');
      night.value = '15';
      night.dispatchEvent(new Event('input'));
      expect(output.brightness().nightLevel).toBe(15);
      q('[data-testid="night-black"]').click();
      fixture.detectChanges();
      expect(output.brightness().nightBlack).toBeTrue();
      expect(q<HTMLInputElement>('[data-testid="night-level"]').disabled).toBeTrue();
    });
  });

  describe('health', () => {
    beforeEach(async () => {
      await render({ connect: true });
    });

    it('shows stat chips instead of a status line', () => {
      for (const id of ['uptime', 'frames', 'last', 'pause', 'timeouts', 'redraws', 'resyncs', 'resets']) expect(q(`[data-testid="stat-${id}"]`)).toBeTruthy();
      expect(text(q('[data-testid="stat-pause"]'))).toBe('0 ms'); // the tests turn the pause off
      expect(Number(q('[data-testid="stat-frames"]').textContent)).toBeGreaterThan(0);
      expect(text(q('[data-testid="stat-last"]'))).toMatch(/^\d+ ms$/);
      expect(text(q('[data-testid="health-state"]'))).toContain('All good');
      expect(q('[data-testid="stat-resets"]').textContent!.trim()).toBe('1'); // every connection starts with a RESET
      expect(q('[data-testid="stat-resyncs"]').textContent!.trim()).toBe('0');
    });

    it('counts a resync (a stuck link that had to be reset) as a problem, with its own chip', () => {
      const link = TestBed.inject(SerialLinkService);
      link.resyncs.update(n => n + 1);
      fixture.detectChanges();
      expect(q('[data-testid="stat-resyncs"]').textContent!.trim()).toBe('1');
      expect(text(q('[data-testid="health-warning"]'))).toContain('1 new problem(s)');
    });

    it('draws a sparkline of the frame times', () => {
      const link = TestBed.inject(SerialLinkService);
      const now = Date.now();
      link.sendHistory.set([{ at: now - 3000, ms: 40 }, { at: now - 2000, ms: 120 }, { at: now - 1000, ms: 60 }]);
      fixture.detectChanges();
      expect(q('[data-testid="spark-path"]').getAttribute('d')).toMatch(/^M/);
      expect(q('[data-testid="spark"]').getAttribute('aria-label')).toContain('latest 60 ms, peak 120 ms');
    });

    it('turns to a clear warning when timeouts or forced redraws increase, until dismissed', () => {
      const link = TestBed.inject(SerialLinkService);
      expect(q('[data-testid="health-warning"]')).toBeNull();
      link.writeTimeouts.update(n => n + 1);
      output.forcedFullRedraws.update(n => n + 1);
      fixture.detectChanges();
      expect(q('[data-testid="health-warning"]').getAttribute('role')).toBe('alert');
      expect(text(q('[data-testid="health-warning"]'))).toContain('2 new problem(s)');
      expect(text(q('[data-testid="health-state"]'))).toContain('Needs attention');

      q('[data-testid="health-dismiss"]').click();
      fixture.detectChanges();
      expect(q('[data-testid="health-warning"]')).toBeNull();
      link.writeTimeouts.update(n => n + 1);
      fixture.detectChanges();
      expect(q('[data-testid="health-warning"]')).toBeTruthy(); // a new problem warns again
    });
  });

  describe('advanced', () => {
    it('stays collapsed and keeps the raw numbers and the pause slider', async () => {
      await render({ connect: true });
      const details = q<HTMLDetailsElement>('details');
      expect(details.open).toBeFalse();
      expect(text(details)).toContain('Frames sent:');
      expect(text(details)).toContain('Pause after each band');
    });
  });

  describe('preferences', () => {
    it('keeps a damaged order or duration out of the rotation', () => {
      expect(sanitizeScreenPrefs({ viewOrder: ['weather', 'weather', 'nope', 'clock'] }).viewOrder)
        .toEqual(['weather', 'clock', 'focus', 'week', 'alarm', 'world']);
      expect(sanitizeScreenPrefs({ viewOrder: 'x' }).viewOrder).toBeUndefined();
      expect(sanitizeScreenPrefs({ viewSeconds: { clock: 5, focus: 99, week: 'a', alarm: 30 } }).viewSeconds)
        .toEqual({ clock: 10, focus: 60, week: 20, alarm: 30, world: 20, weather: 20 });
    });
  });
});
