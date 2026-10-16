import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { TaskService } from './task.service';
import { AnalyticsService } from './analytics.service';
import { AlarmService, nextAlarmOccurrence } from './alarm.service';
import { AudioService } from './audio.service';
import { DashboardService } from './dashboard.service';
import { WorldClockService } from './world-clock.service';
import { TimerService } from './timer.service';
import { SoundscapeService } from './soundscape.service';
import { PomodoroService } from './pomodoro.service';
import { LOCKS_API } from './web-locks';
import { backupCorrupt } from './safe-storage';
import { TranslationService } from './translation.service';
import { LoggerService } from './logger.service';
import { NotesService } from './notes.service';
import { FONT_TOKENS, resolveFont, resolveThemeId, DEFAULT_THEME_ID } from './screen/theme-tokens';
import { localeForLang } from './screen/screen-logic';
import { sanitizeScreenPrefs, ScreenOutputService } from './screen/screen-output.service';
import { DeskDisplayStatusService, DESK_STATUS_KEY } from './screen/desk-display-status.service';
import { isWebUrl, sanitizeAlarms, sanitizeAnalytics, sanitizeSoundscape, sanitizeTasks, sanitizeTimerPresets, sanitizeWorldClocks } from './storage-validators';

const audioStub = { provide: AudioService, useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => {} } };
const set = (key: string, value: unknown) => localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
const storageEvent = (key: string, value: string) =>
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));

describe('what is read back from storage is validated', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('tasks', () => {
    it('keeps valid tasks and drops broken ones', () => {
      set('auratime_tasks', {
        tasks: [
          { id: 'a', text: 'Write', completed: true, pomodoros: 2, createdAt: 5 },
          { id: 7, text: 'number id' },
          { id: 'b' },
          null,
          'text',
          { id: 'c', text: 'Loose types', completed: 'yes', pomodoros: -3, createdAt: 'x' },
          { id: 'a', text: 'duplicate id' }
        ],
        activeTaskId: 'ghost'
      });
      const service = TestBed.inject(TaskService);
      expect(service.tasks().map(t => t.id)).toEqual(['a', 'c']);
      expect(service.tasks()[1]).toEqual({ id: 'c', text: 'Loose types', completed: false, pomodoros: 0, createdAt: 0 });
      expect(service.activeTaskId()).toBeNull(); // pointed at a task that does not exist
    });

    it('falls back to the starter tasks when what is saved is not a task list', () => {
      set('auratime_tasks', { tasks: 'broken' });
      expect(TestBed.inject(TaskService).tasks().length).toBe(2);
    });

    it('ignores a broken value from another window and keeps the current tasks', () => {
      const service = TestBed.inject(TaskService);
      const before = service.tasks();
      storageEvent('auratime_tasks', '{not json');
      storageEvent('auratime_tasks', JSON.stringify({ tasks: 5 }));
      expect(service.tasks()).toBe(before);
    });
  });

  describe('analytics', () => {
    it('keeps valid days and drops broken ones, including a "__proto__" key', () => {
      set('auratime_analytics', '{"dailyRecords":{"2026-01-10":{"minutes":50,"pomodoros":2},"2026-01-11":{"minutes":"x"},"junk":{"minutes":1,"pomodoros":1},"__proto__":{"minutes":9,"pomodoros":9}},"currentStreak":"3","bestStreak":4}');
      const service = TestBed.inject(AnalyticsService);
      expect(Object.keys(service.dailyRecords())).toEqual(['2026-01-10']);
      expect(service.bestStreak()).toBe(4);
      expect(({} as Record<string, unknown>)['minutes']).toBeUndefined(); // Object.prototype untouched
    });

    it('sanitizeAnalytics rejects negative and infinite numbers', () => {
      expect(sanitizeAnalytics({ dailyRecords: { '2026-01-10': { minutes: -5, pomodoros: 1 }, '2026-01-11': { minutes: Infinity, pomodoros: 1 } }, bestStreak: -1 }))
        .toEqual({ dailyRecords: {} });
    });
  });

  describe('alarms', () => {
    afterEach(() => TestBed.inject(AlarmService, undefined, { optional: true })?.destroy());

    it('keeps valid alarms and drops broken ones', () => {
      set('auratime_alarms', [
        { id: '1', label: 'ok', time: '07:30', days: [1, 2, 9, 'x', 2], enabled: true, snoozeMinutes: 10, sound: 'bell' },
        { id: '2', label: 'bad time', time: '25:99', days: [], enabled: true, snoozeMinutes: 5, sound: 'chime' },
        { id: '3', label: 'no id?', time: '8:00' },
        { label: 'missing id', time: '08:00' },
        { id: '4', time: '09:00', enabled: 1, sound: 'siren', snoozeMinutes: 99999 }
      ]);
      TestBed.configureTestingModule({ providers: [audioStub] });
      const alarms = TestBed.inject(AlarmService).allAlarms();
      expect(alarms.map(a => a.id)).toEqual(['1', '4']);
      expect(alarms[0].days).toEqual([1, 2]);
      expect(alarms[1]).toEqual({ id: '4', label: '', time: '09:00', days: [], enabled: false, snoozeMinutes: 120, sound: 'chime' });
    });

    it('does not let a broken value from another window replace the alarms', () => {
      TestBed.configureTestingModule({ providers: [audioStub] });
      const service = TestBed.inject(AlarmService);
      service.addAlarm({ label: 'x', time: '07:00', days: [], enabled: true, snoozeMinutes: 5, sound: 'chime' });
      storageEvent('auratime_alarms', '{"not":"a list"}');
      expect(service.allAlarms().length).toBe(1);
    });

    it('sanitizeAlarms returns null for anything that is not a list', () => {
      expect(sanitizeAlarms({})).toBeNull();
      expect(sanitizeAlarms('x')).toBeNull();
      expect(sanitizeAlarms([])).toEqual([]);
    });
  });

  describe('dashboard links', () => {
    it('only keeps http and https links: a stored javascript: or data: address is dropped', () => {
      set('auratime_dashboard', {
        links: [
          { id: '1', title: 'Good', url: 'https://example.com/a', icon: '🔗' },
          { id: '2', title: 'Evil', url: 'javascript:alert(1)', icon: '🔗' },
          { id: '3', title: 'Data', url: 'data:text/html,<script>alert(1)</script>', icon: '🔗' },
          { id: '4', title: 'Not a url', url: 'example', icon: '🔗' },
          { id: '5', title: 'Plain http', url: 'http://example.org', icon: 5 }
        ],
        countdown: { title: 5 }
      });
      const service = TestBed.inject(DashboardService);
      expect(service.links().map(l => l.id)).toEqual(['1', '5']);
      expect(service.links()[1].icon).toBe('🔗');
      expect(service.countdown().title).toBe('Daily Standup'); // the broken countdown was ignored
    });

    it('isWebUrl', () => {
      expect(isWebUrl('https://a.b')).toBeTrue();
      expect(isWebUrl('HTTP://A.B')).toBeTrue();
      expect(isWebUrl('javascript:void(0)')).toBeFalse();
      expect(isWebUrl('ftp://a.b')).toBeFalse();
      expect(isWebUrl(5)).toBeFalse();
    });
  });

  describe('world clocks', () => {
    it('drops clocks with an unknown time zone and keeps the others', () => {
      set('auratime_worldclocks', [
        { id: '1', label: 'Lisbon', timezone: 'Europe/Lisbon', offset: 0 },
        { id: '2', label: 'Nowhere', timezone: 'Mars/Olympus', offset: 3 },
        { id: '3', label: '', timezone: 'Asia/Tokyo' },
        { id: '4', label: 'Tokyo', timezone: 'Asia/Tokyo', offset: 'nine' }
      ]);
      const clocks = TestBed.inject(WorldClockService).allClocks();
      expect(clocks.map(c => c.id)).toEqual(['1', '4']);
      expect(Number.isFinite(clocks[1].offset)).toBeTrue(); // the broken offset was replaced, not kept
    });

    it('keeps the defaults when nothing usable is saved', () => {
      set('auratime_worldclocks', [{ id: 'x', label: 'Bad', timezone: 'Nope/Nope' }]);
      expect(TestBed.inject(WorldClockService).allClocks().length).toBeGreaterThan(0);
      expect(sanitizeWorldClocks([{ id: 'x', label: 'Bad', timezone: 'Nope/Nope' }])).toEqual([]);
    });
  });

  describe('timer presets and the soundscape', () => {
    it('keeps valid presets only', () => {
      set('auratime_timer_presets', [
        { id: 'a', label: '5 min', duration: 5 },
        { id: 'b', label: 'zero', duration: 0 },
        { id: 'c', label: 'huge', duration: 99999 },
        { id: 'd', label: 'nan', duration: 'five' }
      ]);
      TestBed.configureTestingModule({ providers: [audioStub] });
      expect(TestBed.inject(TimerService).allPresets().map(p => p.id)).toEqual(['a']);
      expect(sanitizeTimerPresets([{ id: 'a', label: '', duration: 1 }])!.length).toBe(1);
    });

    it('clamps soundscape volumes and ignores unknown tracks', () => {
      set('auratime_soundscape', { masterVolume: 500, tracks: [{ id: 'rain', volume: -20 }, { id: 'ghost', volume: 50 }, { id: 'wind', volume: 'loud' }] });
      const service = TestBed.inject(SoundscapeService);
      expect(service.masterVolume()).toBe(100);
      expect(service.tracks().find(t => t.id === 'rain')!.volume).toBe(0);
      expect(service.tracks().find(t => t.id === 'wind')!.volume).toBe(30); // unchanged: the saved value was not a number
      expect(sanitizeSoundscape({ masterVolume: NaN })).toEqual({});
    });
  });

  describe('pomodoro', () => {
    it('ignores infinite or absurd numbers instead of freezing the countdown', () => {
      TestBed.configureTestingModule({ providers: [audioStub, { provide: LOCKS_API, useValue: null }] });
      set('auratime_pomodoro', '{"phase":"work","running":true,"endTime":1e999,"remainingSec":1e999,"workDuration":1e999,"breakDuration":-5}');
      const service = TestBed.inject(PomodoroService);
      expect(service.isRunning()).toBeFalse();
      expect(Number.isFinite(service.totalSeconds())).toBeTrue();
    });
  });

  describe('notes and logs', () => {
    it('keeps only log entries that look like log entries', () => {
      set('auratime_logs', [{ message: 'ok', severity: 'error', timestamp: 1 }, 5, null, { message: 7 }, 'x']);
      expect(TestBed.inject(LoggerService).getLogs().length).toBe(1);
      localStorage.setItem('auratime_logs', '{"not":"a list"}');
      expect(() => TestBed.inject(NotesService)).not.toThrow();
    });
  });

  describe('every service survives a browser that throws on any storage access', () => {
    it('does not throw', () => {
      spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
      TestBed.configureTestingModule({ providers: [audioStub, { provide: LOCKS_API, useValue: null }] });
      for (const token of [TaskService, AnalyticsService, DashboardService, WorldClockService, TimerService, SoundscapeService, PomodoroService, NotesService, AlarmService]) {
        expect(() => TestBed.inject(token as never)).withContext(token.name).not.toThrow();
      }
      TestBed.flushEffects();
      TestBed.inject(AlarmService).destroy();
    });

    it('the language and the Desk Display status too', () => {
      spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
      spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      const translation = TestBed.inject(TranslationService);
      expect(() => translation.setLanguage('pt')).not.toThrow();
      expect(() => TestBed.inject(DeskDisplayStatusService).publish(true)).not.toThrow();
    });
  });
});

describe('names that exist on every object are not fonts, themes, locales or parameters', () => {
  const NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

  it('resolveFont falls back to Outfit', () => {
    for (const name of NAMES) expect(resolveFont(name)).withContext(name).toBe(FONT_TOKENS.outfit);
  });

  it('resolveThemeId falls back to the default theme', () => {
    for (const name of NAMES) expect(resolveThemeId(name)).withContext(name).toBe(DEFAULT_THEME_ID);
  });

  it('localeForLang falls back to en-US', () => {
    for (const name of NAMES) expect(localeForLang(name)).withContext(name).toBe('en-US');
  });

  it('a stored font pin of that kind is not accepted', () => {
    for (const name of NAMES) expect(sanitizeScreenPrefs({ fontPin: name }).fontPin).withContext(name).toBeUndefined();
  });

  it('format() leaves a placeholder named like that alone', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const t = TestBed.inject(TranslationService);
    spyOn(t, 't').and.returnValue('a {constructor} b {name}');
    expect(t.format('X', { name: 'N' })).toBe('a {constructor} b N');
  });
});

describe('saved screen preferences', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sanitizeScreenPrefs keeps valid values and drops the rest', () => {
    const out = sanitizeScreenPrefs({
      viewMode: 'week', rotation: ['clock', 'nope', 'week'], flowControl: 'yes', themePin: 'constructor', fontPin: 'inter',
      brightness: { base: 150, nightFromHour: 99, nightLevel: 'dim', nightEnabled: false }
    });
    expect(out.viewMode).toBe('week');
    expect(out.rotation).toEqual(['clock', 'week']);
    expect(out.flowControl).toBeUndefined();
    expect(out.themePin).toBeUndefined();
    expect(out.fontPin).toBe('inter');
    expect(out.brightness!.base).toBe(100);
    expect(out.brightness!.nightFromHour).toBe(23);
    expect(out.brightness!.nightLevel).toBe(10); // default: the saved one was not a number
    expect(out.brightness!.nightEnabled).toBeFalse();
  });

  it('a damaged saved value does not break the service', () => {
    for (const bad of ['{nope', 'null', '[]', '"text"', '5']) {
      localStorage.setItem('auratime_screen', bad);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LOCKS_API, useValue: null }] });
      const service = TestBed.inject(ScreenOutputService);
      expect(service.viewMode()).withContext(bad).toBe('auto');
    }
  });
});

describe('the saved language', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup() {
    const requested: string[] = [];
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get: (url: string) => (requested.push(url), of({})) } }]
    });
    return { requested, translation: TestBed.inject(TranslationService) };
  }

  it('only a language we ship is ever turned into a file name to fetch', () => {
    localStorage.setItem('auratime_lang', '../../secret');
    const { requested, translation } = setup();
    expect(requested).toEqual([]);
    expect(translation.currentLang()).toBe('en');
    storageEvent('auratime_lang', 'https://evil.example/x');
    translation.setLanguage('a/b');
    expect(requested).toEqual([]);
  });

  it('a valid saved language still loads', () => {
    localStorage.setItem('auratime_lang', 'de');
    const { requested, translation } = setup();
    expect(translation.currentLang()).toBe('de');
    expect(requested).toEqual(['/assets/i18n/de.json']);
  });
});

describe('Desk Display status written by another window', () => {
  it('a damaged value is ignored', () => {
    localStorage.setItem(DESK_STATUS_KEY, '{"connected":"yes","at":1}');
    const status = TestBed.inject(DeskDisplayStatusService);
    expect(status.connected()).toBeFalse();
    localStorage.clear();
  });
});

describe('sanitizeTasks', () => {
  it('returns null when tasks is not a list', () => {
    expect(sanitizeTasks(null)).toBeNull();
    expect(sanitizeTasks({ tasks: {} })).toBeNull();
  });
});

describe('the time left until an alarm, around a clock change', () => {
  /** A clock that skips 02:00-02:59 on 2026-03-29: asking for 02:30 that day gives 03:30 (what Date does). */
  const springForward = (y: number, m: number, d: number, h: number, min: number) =>
    y === 2026 && m === 2 && d === 29 && h === 2 ? new Date(y, m, d, 3, min) : new Date(y, m, d, h, min);

  it('skips the day on which the time does not exist, instead of counting down to a different time', () => {
    const now = new Date(2026, 2, 28, 12, 0);
    const next = nextAlarmOccurrence({ time: '02:30', days: [] }, now, springForward)!;
    expect(next.getDate()).toBe(30); // not the 29th, where 02:30 never happens
    expect(next.getHours()).toBe(2);
    expect(next.getMinutes()).toBe(30);
  });

  it('is the normal next time on ordinary days', () => {
    const now = new Date(2026, 0, 15, 7, 0);
    expect(nextAlarmOccurrence({ time: '07:30', days: [] }, now)!.getTime()).toBe(new Date(2026, 0, 15, 7, 30).getTime());
    expect(nextAlarmOccurrence({ time: '06:30', days: [] }, now)!.getTime()).toBe(new Date(2026, 0, 16, 6, 30).getTime());
  });

  it('respects the days the alarm is set for (it used to count down to tomorrow whatever the days)', () => {
    const thursday = new Date(2026, 0, 15, 12, 0); // 2026-01-15 is a Thursday
    const next = nextAlarmOccurrence({ time: '08:00', days: [1] }, thursday)!; // Mondays only
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(19);
  });

  it('is null when the time is not a time', () => {
    expect(nextAlarmOccurrence({ time: 'soon', days: [] }, new Date())).toBeNull();
  });
});

describe('the scratchpad', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('saves what is typed and shows when it was saved (the label used to stay empty)', () => {
    const notes = TestBed.inject(NotesService);
    TestBed.flushEffects();
    notes.updateContent('remember the milk');
    TestBed.flushEffects();
    expect(localStorage.getItem('auratime_scratchpad')).toBe('remember the milk');
    expect(notes.lastSaved()).not.toBe('');
  });
});

describe('a stored list that fails validation is backed up first', () => {
  const backups = (key: string) =>
    Object.keys(localStorage).filter(k => k.startsWith(key + '_corrupt_')).sort();

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('copies the raw tasks to a backup key before falling back to the starter tasks', () => {
    const raw = '{"tasks":"broken","note":"my data"}';
    localStorage.setItem('auratime_tasks', raw);
    expect(TestBed.inject(TaskService).tasks().length).toBe(2);
    const [key] = backups('auratime_tasks');
    expect(key).toMatch(/^auratime_tasks_corrupt_\d+$/);
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it('also backs up text that is not even JSON', () => {
    localStorage.setItem('auratime_tasks', '{oops');
    TestBed.inject(TaskService);
    expect(localStorage.getItem(backups('auratime_tasks')[0])).toBe('{oops');
  });

  it('backs up the whole list when only some entries are dropped', () => {
    const raw = JSON.stringify({ tasks: [{ id: 'a', text: 'keep' }, { id: 5 }] });
    localStorage.setItem('auratime_tasks', raw);
    expect(TestBed.inject(TaskService).tasks().length).toBe(1);
    expect(localStorage.getItem(backups('auratime_tasks')[0])).toBe(raw);
  });

  it('does not back up a value that is fine, nor an empty storage', () => {
    localStorage.setItem('auratime_tasks', JSON.stringify({ tasks: [{ id: 'a', text: 'ok' }], activeTaskId: 'a' }));
    TestBed.inject(TaskService);
    expect(backups('auratime_tasks')).toEqual([]);
  });

  it('the same for alarms, links, world clocks and timer presets', () => {
    TestBed.configureTestingModule({ providers: [audioStub] });
    const bad = { alarms: '[{"id":"1","time":"99:99"}]', links: '{"links":[{"id":"1","title":"x","url":"javascript:1"}]}', clocks: '[{"id":"1","label":"x","timezone":"No/Where"}]', presets: '[{"id":"1","label":"x","duration":-1}]' };
    localStorage.setItem('auratime_alarms', bad.alarms);
    localStorage.setItem('auratime_dashboard', bad.links);
    localStorage.setItem('auratime_worldclocks', bad.clocks);
    localStorage.setItem('auratime_timer_presets', bad.presets);
    TestBed.inject(AlarmService).destroy();
    TestBed.inject(DashboardService);
    TestBed.inject(WorldClockService);
    TestBed.inject(TimerService);
    expect(localStorage.getItem(backups('auratime_alarms')[0])).toBe(bad.alarms);
    expect(localStorage.getItem(backups('auratime_dashboard')[0])).toBe(bad.links);
    expect(localStorage.getItem(backups('auratime_worldclocks')[0])).toBe(bad.clocks);
    expect(localStorage.getItem(backups('auratime_timer_presets')[0])).toBe(bad.presets);
  });

  it('backupCorrupt keeps only the newest three, never repeats itself, and survives a full storage', () => {
    for (let i = 0; i < 5; i++) backupCorrupt('k', 'value ' + i);
    expect(backups('k').length).toBe(3);
    expect(backupCorrupt('k', 'value 4')).toBeNull(); // already backed up
    expect(backups('k').map(b => localStorage.getItem(b))).toEqual(['value 2', 'value 3', 'value 4']);
    expect(backupCorrupt('k', null)).toBeNull();
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    expect(() => backupCorrupt('k', 'another')).not.toThrow();
  });
});

describe('a destroyed service stops listening to other windows', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('a storage event after the module is gone does not change the old instance', () => {
    TestBed.configureTestingModule({ providers: [audioStub, { provide: LOCKS_API, useValue: null }] });
    const tasks = TestBed.inject(TaskService);
    const dashboard = TestBed.inject(DashboardService);
    const clocks = TestBed.inject(WorldClockService);
    const before = { t: tasks.tasks(), l: dashboard.links(), c: clocks.allClocks() };
    TestBed.resetTestingModule(); // what happens between two tests

    storageEvent('auratime_tasks', JSON.stringify({ tasks: [{ id: 'x', text: 'late' }] }));
    storageEvent('auratime_dashboard', JSON.stringify({ links: [{ id: 'x', title: 'late', url: 'https://late.example' }] }));
    storageEvent('auratime_worldclocks', JSON.stringify([{ id: 'x', label: 'Late', timezone: 'Asia/Tokyo' }]));

    expect(tasks.tasks()).toBe(before.t);
    expect(dashboard.links()).toBe(before.l);
    expect(clocks.allClocks()).toBe(before.c);
  });
});
