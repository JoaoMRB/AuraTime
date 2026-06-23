import { TestBed } from '@angular/core/testing';
import { AlarmService } from './alarm.service';
import { AudioService } from './audio.service';

describe('AlarmService', () => {
  let service: AlarmService;
  let audioService: jasmine.SpyObj<AudioService>;

  beforeEach(() => {
    const audioServiceSpy = jasmine.createSpyObj('AudioService', ['playChimeSound', 'initAudioContext']);

    TestBed.configureTestingModule({
      providers: [
        AlarmService,
        { provide: AudioService, useValue: audioServiceSpy }
      ]
    });

    service = TestBed.inject(AlarmService);
    audioService = TestBed.inject(AudioService) as jasmine.SpyObj<AudioService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have no alarms initially', () => {
    expect(service.allAlarms().length).toBe(0);
  });

  it('should add an alarm', () => {
    const alarmData = {
      time: '07:30',
      enabled: true,
      label: 'Morning'
    };
    
    service.addAlarm(alarmData);
    
    expect(service.allAlarms().length).toBeGreaterThan(0);
  });

  it('should have only enabled alarms in active list', () => {
    service.addAlarm({
      time: '07:30',
      enabled: true,
      label: 'Morning'
    });
    
    service.addAlarm({
      time: '22:00',
      enabled: false,
      label: 'Evening'
    });
    
    expect(service.activeAlarms().length).toBe(1);
  });

  it('should remove an alarm', () => {
    service.addAlarm({
      time: '07:30',
      enabled: true,
      label: 'Morning'
    });
    
    const alarmId = service.allAlarms()[0]?.id;
    if (alarmId) {
      service.removeAlarm(alarmId);
      expect(service.allAlarms().length).toBe(0);
    }
  });

  it('should toggle alarm enabled status', () => {
    service.addAlarm({
      time: '07:30',
      enabled: true,
      label: 'Morning'
    });
    
    const alarm = service.allAlarms()[0];
    const initialState = alarm.enabled;
    
    service.toggleAlarm(alarm.id);
    
    const updatedAlarm = service.allAlarms()[0];
    expect(updatedAlarm.enabled).not.toBe(initialState);
  });

  it('should not be ringing initially', () => {
    expect(service.isAlarmRinging()).toBeFalsy();
  });

  it('should not have next alarm if no alarms', () => {
    expect(service.nextAlarmTime()).toBeNull();
  });

  it('should track alarm history', () => {
    const history = service.alarmHistory();
    expect(Array.isArray(history)).toBeTruthy();
  });

  it('should handle multiple alarms', () => {
    service.addAlarm({ time: '07:00', enabled: true, label: 'First' });
    service.addAlarm({ time: '12:00', enabled: true, label: 'Second' });
    service.addAlarm({ time: '18:00', enabled: true, label: 'Third' });
    
    expect(service.activeAlarms().length).toBe(3);
  });

  it('should update alarm label', () => {
    service.addAlarm({
      time: '07:30',
      enabled: true,
      label: 'Morning'
    });
    
    const alarmId = service.allAlarms()[0]?.id;
    const newLabel = 'Updated Morning';
    
    service.updateAlarmLabel(alarmId, newLabel);
    
    const updatedAlarm = service.allAlarms().find(a => a.id === alarmId);
    expect(updatedAlarm?.label).toBe(newLabel);
  });

  it('should update alarm time', () => {
    service.addAlarm({
      time: '07:30',
      enabled: true,
      label: 'Morning'
    });
    
    const alarmId = service.allAlarms()[0]?.id;
    const newTime = '08:00';
    
    service.updateAlarmTime(alarmId, newTime);
    
    const updatedAlarm = service.allAlarms().find(a => a.id === alarmId);
    expect(updatedAlarm?.time).toBe(newTime);
  });
});
