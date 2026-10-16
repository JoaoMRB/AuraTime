import { TestBed } from '@angular/core/testing';
import { AlarmService } from './alarm.service';
import { AudioService } from './audio.service';

describe('AlarmService: ringing and display-only pages', () => {
  const NOW = new Date(2026, 0, 15, 7, 29, 50); // ten seconds before 07:30
  let chimes: number;

  function setup(): AlarmService {
    TestBed.configureTestingModule({
      providers: [{ provide: AudioService, useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => chimes++ } }]
    });
    const service = TestBed.inject(AlarmService);
    service.addAlarm({ label: 'Wake up', time: '07:30', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime' });
    return service;
  }

  beforeEach(() => {
    chimes = 0;
    localStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('rings when the time comes', () => {
    const service = setup();
    jasmine.clock().tick(11_000);
    expect(service.isAlarmRinging()).toBeTrue();
  });

  it('does not ring while a display-only page asks for silence', () => {
    const service = setup();
    service.suppressRinging();
    jasmine.clock().tick(11_000);
    expect(service.isAlarmRinging()).toBeFalse();
    expect(chimes).toBe(0);
  });

  it('keeps working afterwards: the suppression ends with the page (the checker was never stopped)', () => {
    const service = setup();
    const release = service.suppressRinging();
    jasmine.clock().tick(5_000);
    release(); // the visitor left /screen
    jasmine.clock().tick(6_000); // still inside the 07:30 minute
    expect(service.isAlarmRinging()).toBeTrue();
  });

  it('a later alarm still rings after visiting and leaving the page', () => {
    const service = setup();
    const release = service.suppressRinging();
    jasmine.clock().tick(90_000); // 07:30 passes while the page is open: that ring is skipped
    expect(service.isAlarmRinging()).toBeFalse();
    release();
    service.addAlarm({ label: 'Later', time: '07:35', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime' });
    jasmine.clock().tick(5 * 60_000);
    expect(service.isAlarmRinging()).toBeTrue();
  });

  it('needs every page to release: two pages, one leaves, still silent', () => {
    const service = setup();
    const first = service.suppressRinging();
    service.suppressRinging();
    first();
    jasmine.clock().tick(11_000);
    expect(service.isAlarmRinging()).toBeFalse();
  });

  it('releasing twice does not unbalance the counter', () => {
    const service = setup();
    const first = service.suppressRinging();
    service.suppressRinging();
    first();
    first(); // must not also release the second page's suppression
    jasmine.clock().tick(11_000);
    expect(service.isAlarmRinging()).toBeFalse();
  });
});
