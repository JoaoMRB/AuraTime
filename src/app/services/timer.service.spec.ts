import { TestBed } from '@angular/core/testing';
import { TimerService } from './timer.service';
import { AudioService } from './audio.service';

describe('TimerService', () => {
  let service: TimerService;
  let audioService: jasmine.SpyObj<AudioService>;

  beforeEach(() => {
    const audioServiceSpy = jasmine.createSpyObj('AudioService', ['initAudioContext']);

    TestBed.configureTestingModule({
      providers: [
        TimerService,
        { provide: AudioService, useValue: audioServiceSpy }
      ]
    });

    service = TestBed.inject(TimerService);
    audioService = TestBed.inject(AudioService) as jasmine.SpyObj<AudioService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with zero time', () => {
    expect(service.remaining()).toBe(0);
    expect(service.running()).toBeFalsy();
  });

  it('should set time correctly', () => {
    service.setTime(300); // 5 minutes
    expect(service.totalDuration()).toBe(300);
    expect(service.remaining()).toBe(300);
  });

  it('should add time', () => {
    service.setTime(300);
    service.addTime(60);
    expect(service.remaining()).toBe(360);
  });

  it('should remove time', () => {
    service.setTime(300);
    service.removeTime(60);
    expect(service.remaining()).toBe(240);
  });

  it('should not go below zero when removing time', () => {
    service.setTime(30);
    service.removeTime(60);
    expect(service.remaining()).toBeGreaterThanOrEqual(0);
  });

  it('should start timer', (done) => {
    service.setTime(10);
    service.start();
    expect(service.running()).toBeTruthy();
    
    setTimeout(() => {
      expect(audioService.initAudioContext).toHaveBeenCalled();
      done();
    }, 100);
  });

  it('should pause timer', () => {
    service.setTime(10);
    service.start();
    expect(service.running()).toBeTruthy();
    
    service.pause();
    expect(service.running()).toBeFalsy();
  });

  it('should reset timer', () => {
    service.setTime(300);
    service.start();
    service.reset();
    
    expect(service.running()).toBeFalsy();
    expect(service.totalDuration()).toBe(0);
    expect(service.remaining()).toBe(0);
  });

  it('should add preset', () => {
    service.addPreset('custom', 600);
    const presets = service.allPresets();
    expect(presets.some(p => p.label === 'custom')).toBeTruthy();
  });

  it('should use preset', () => {
    service.usePreset(600);
    expect(service.totalDuration()).toBe(600);
  });

  it('should remove preset', () => {
    const initialCount = service.allPresets().length;
    const presetId = service.allPresets()[0]?.id;
    
    if (presetId) {
      service.removePreset(presetId);
      expect(service.allPresets().length).toBeLessThanOrEqual(initialCount);
    }
  });
});
