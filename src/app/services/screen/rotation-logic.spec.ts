import { ALL_SCREEN_VIEWS, ScreenView } from './display-snapshot';
import {
  MAX_VIEW_SECONDS, MIN_VIEW_SECONDS, ViewInputs, clampViewSeconds, offsetToShow, pickView, rotationInfo
} from './screen-logic';

describe('rotation with custom order, durations and offset', () => {
  const allContent = Object.fromEntries(ALL_SCREEN_VIEWS.map(v => [v, true])) as Record<ScreenView, boolean>;
  const base: ViewInputs = {
    mode: 'auto',
    focusRunning: false,
    enabled: ['clock', 'focus', 'week'],
    hasContent: allContent,
    nowMs: 0
  };
  const at = (seconds: number, extra: Partial<ViewInputs> = {}) => ({ ...base, ...extra, nowMs: seconds * 1000 + 250 });

  it('clamps a duration to 10-60 s', () => {
    expect(clampViewSeconds(3)).toBe(MIN_VIEW_SECONDS);
    expect(clampViewSeconds(500)).toBe(MAX_VIEW_SECONDS);
    expect(clampViewSeconds(33.4)).toBe(33);
  });

  it('keeps each view on screen for its own duration', () => {
    const durations = { clock: 10, focus: 30, week: 20 }; // cycle of 60 s
    const view = (s: number) => pickView(at(s, { durations }));
    expect([0, 9, 10, 39, 40, 59, 60, 70].map(view)).toEqual(['clock', 'clock', 'focus', 'focus', 'week', 'week', 'clock', 'focus']);
  });

  it('reports how far into its slot the current view is', () => {
    const info = rotationInfo(at(34, { durations: { clock: 10, focus: 30, week: 20 } }));
    expect(info).toEqual({ view: 'focus', rotating: true, elapsedSec: 24, durationSec: 30 });
  });

  it('follows the order chosen by the user', () => {
    const order: ScreenView[] = ['week', 'clock', 'focus', 'alarm', 'world', 'weather'];
    expect([0, 20, 40, 60].map(s => pickView(at(s, { order })))).toEqual(['week', 'clock', 'focus', 'week']);
  });

  it('is not rotating (no progress) when a view is pinned, a Pomodoro runs, or only one view is enabled', () => {
    expect(rotationInfo(at(5, { mode: 'week' }))).toEqual({ view: 'week', rotating: false, elapsedSec: 0, durationSec: 0 });
    expect(rotationInfo(at(5, { focusRunning: true })).rotating).toBeFalse();
    expect(rotationInfo(at(5, { enabled: ['week'] })).rotating).toBeFalse();
  });

  it('offsetToShow makes a chosen view appear at the start of its slot (previous / next buttons)', () => {
    const durations = { clock: 10, focus: 30, week: 20 };
    for (const now of [0, 7, 33, 58, 125]) {
      for (const target of ['clock', 'focus', 'week'] as ScreenView[]) {
        const input = at(now, { durations });
        const offsetSec = offsetToShow(input, target, 0);
        expect(rotationInfo({ ...input, offsetSec })).toEqual(jasmine.objectContaining({ view: target, elapsedSec: 0 }));
      }
    }
  });

  it('offsetToShow can resume a paused view part-way through its slot', () => {
    const input = at(41, { durations: { clock: 20, focus: 20, week: 20 } });
    const offsetSec = offsetToShow(input, 'clock', 12);
    expect(rotationInfo({ ...input, offsetSec })).toEqual(jasmine.objectContaining({ view: 'clock', elapsedSec: 12 }));
  });

  it('a pinned view that has no content falls back to the clock, as before', () => {
    expect(pickView(at(0, { mode: 'week', hasContent: { ...allContent, week: false } }))).toBe('clock');
  });
});
