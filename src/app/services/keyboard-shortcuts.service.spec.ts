import { TestBed } from '@angular/core/testing';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { SettingsService } from './settings.service';
import { PomodoroService } from './pomodoro.service';

/** Keys handled directly by ClockComponent (panels, PiP, zen). */
const COMPONENT_KEYS = ['m', 't', 'n', 's', 'p', 'z'];

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
  document.dispatchEvent(event);
  return event;
}

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;
  let settings: SettingsService;
  let pomodoro: PomodoroService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(KeyboardShortcutsService);
    settings = TestBed.inject(SettingsService);
    pomodoro = TestBed.inject(PomodoroService);
  });

  afterEach(() => localStorage.clear());

  it('does not reuse any key owned by ClockComponent', () => {
    const keys = service.getAllShortcuts().map(s => s.key.toLowerCase());
    for (const k of COMPONENT_KEYS) {
      expect(keys).not.toContain(k);
    }
  });

  it('leaves component keys alone (no mode/theme change, no preventDefault)', () => {
    const mode = settings.mode();
    const theme = settings.theme();
    for (const k of COMPONENT_KEYS) {
      expect(press(k).defaultPrevented).toBeFalse();
    }
    expect(settings.mode()).toBe(mode);
    expect(settings.theme()).toBe(theme);
  });

  it('cycles mode with c and theme with h', () => {
    settings.mode.set('clock');
    press('c');
    expect(settings.mode()).toBe('pomodoro');
    settings.theme.set('emerald-gold');
    press('h');
    expect(settings.theme()).toBe('liquid-glass');
  });

  it('toggles the pomodoro with the space bar in pomodoro mode', () => {
    settings.mode.set('pomodoro');
    press(' ');
    expect(pomodoro.isRunning()).toBeTrue();
    press(' ');
    expect(pomodoro.isRunning()).toBeFalse();
  });

  it('emits toggle-settings on comma', () => {
    let fired = false;
    const handler = () => (fired = true);
    document.addEventListener('toggle-settings', handler);
    press(',');
    document.removeEventListener('toggle-settings', handler);
    expect(fired).toBeTrue();
  });

  it('does not hijack browser combos like Ctrl+R', () => {
    settings.mode.set('pomodoro');
    const event = press('r', { ctrlKey: true });
    expect(event.defaultPrevented).toBeFalse();
  });
});
