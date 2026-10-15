import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DeskDisplayMockComponent, MOCK_LOOKS, MOCK_VIEW_MS } from './desk-display-mock.component';
import { ALL_SCREEN_VIEWS } from '../../services/screen/display-snapshot';
import { REQUIRED_FONT_SHORTHANDS } from '../../services/screen/screen-renderer';
import { TickService } from '../../services/screen/tick.service';

describe('DeskDisplayMockComponent (landing page mock-up)', () => {
  describe('frameAt', () => {
    const at = (ms: number, reduced = false) => DeskDisplayMockComponent.frameAt(ms, reduced);

    it('starts on the first view and look', () => {
      expect(at(0)).toEqual({ viewIndex: 0, lookIndex: 0 });
    });

    it('moves to the next view every MOCK_VIEW_MS and goes through all of them', () => {
      const seen = ALL_SCREEN_VIEWS.map((_, i) => at(i * MOCK_VIEW_MS + 10).viewIndex);
      expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
      expect(at(MOCK_VIEW_MS - 1).viewIndex).toBe(0);
    });

    it('changes the theme after a full round of views, and loops forever', () => {
      const round = ALL_SCREEN_VIEWS.length * MOCK_VIEW_MS;
      expect(at(round - 1).lookIndex).toBe(0);
      expect(at(round + 1)).toEqual({ viewIndex: 0, lookIndex: 1 });
      expect(at(round * MOCK_LOOKS.length + 1)).toEqual({ viewIndex: 0, lookIndex: 0 });
    });

    it('does not move for users who prefer reduced motion', () => {
      expect(at(999_999, true)).toEqual({ viewIndex: 0, lookIndex: 0 });
    });

    it('showcases several different themes and fonts', () => {
      expect(new Set(MOCK_LOOKS.map(l => l.theme)).size).toBe(MOCK_LOOKS.length);
      expect(new Set(MOCK_LOOKS.map(l => l.font)).size).toBeGreaterThan(2);
    });
  });

  describe('rendering', () => {
    beforeEach(async () => {
      await Promise.all(REQUIRED_FONT_SHORTHANDS.map(f => document.fonts.load(f)));
      TestBed.configureTestingModule({
        imports: [DeskDisplayMockComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      });
    });

    async function render() {
      const fixture = TestBed.createComponent(DeskDisplayMockComponent);
      fixture.detectChanges();
      TestBed.inject(ApplicationRef).tick(); // afterNextRender
      await new Promise(r => setTimeout(r, 120)); // fonts + first draw
      fixture.detectChanges();
      return fixture;
    }

    const pixelsOf = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, 480, 320).data;
    const distinctColors = (data: Uint8ClampedArray) => {
      const colors = new Set<number>();
      for (let i = 0; i < data.length && colors.size < 30; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return colors.size;
    };

    it('draws the real renderer on a 480x320 canvas with an accessible name', async () => {
      const fixture = await render();
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(480);
      expect(canvas.height).toBe(320);
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toContain('Desk Display');
      expect(distinctColors(pixelsOf(canvas))).toBeGreaterThan(10);
    });

    it('keeps moving: the picture changes as time passes', async () => {
      const fixture = await render();
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      const before = pixelsOf(canvas).slice();
      (TestBed.inject(TickService) as unknown as { emit(): void }).emit();
      const spent = Date.now();
      while (Date.now() - spent < 1100) { /* let the wall clock cross a second */ }
      (TestBed.inject(TickService) as unknown as { emit(): void }).emit();
      const after = pixelsOf(canvas);
      expect(before.some((v, i) => v !== after[i])).toBeTrue();
    });

    it('shows the caption and one dot per view, and no third-party images', async () => {
      const fixture = await render();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('drawn by the same engine that drives the screen');
      expect(el.querySelectorAll('figure > div:last-of-type > span').length).toBe(ALL_SCREEN_VIEWS.length);
      expect(el.querySelectorAll('img, svg image').length).toBe(0);
    });

    it('does not start (or throw) if it is destroyed while the fonts are still loading', async () => {
      const errors: unknown[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => errors.push(args);
      try {
        const fixture = TestBed.createComponent(DeskDisplayMockComponent);
        fixture.detectChanges();
        TestBed.inject(ApplicationRef).tick(); // start() is now waiting for the fonts
        fixture.destroy();
        await new Promise(r => setTimeout(r, 150));
      } finally {
        console.error = original;
      }
      expect(errors).toEqual([]);
      const tick = TestBed.inject(TickService) as unknown as { listeners: Set<unknown> };
      expect(tick.listeners.size).toBe(0);
    });

    it('stops its clock subscription when destroyed', async () => {
      const fixture = await render();
      const tick = TestBed.inject(TickService) as unknown as { listeners: Set<unknown> };
      const before = tick.listeners.size;
      fixture.destroy();
      expect(tick.listeners.size).toBe(before - 1);
    });
  });
});
