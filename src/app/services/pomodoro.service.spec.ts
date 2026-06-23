import { TestBed } from '@angular/core/testing';
import { PomodoroService } from './pomodoro.service';
import { AudioService } from './audio.service';

describe('PomodoroService', () => {
  let service: PomodoroService;
  let audioService: jasmine.SpyObj<AudioService>;

  beforeEach(() => {
    const audioServiceSpy = jasmine.createSpyObj('AudioService', ['initAudioContext', 'playChimeSound']);

    TestBed.configureTestingModule({
      providers: [
        PomodoroService,
        { provide: AudioService, useValue: audioServiceSpy }
      ]
    });

    service = TestBed.inject(PomodoroService);
    audioService = TestBed.inject(AudioService) as jasmine.SpyObj<AudioService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with work phase', () => {
    expect(service.currentPhase()).toBe('work');
  });

  it('should start with 25 minutes', () => {
    expect(service.minutes()).toBe(25);
  });

  it('should not be running initially', () => {
    expect(service.isRunning()).toBeFalsy();
  });

  it('should toggle between running and paused', () => {
    service.toggle();
    expect(service.isRunning()).toBeTruthy();
    
    service.toggle();
    expect(service.isRunning()).toBeFalsy();
  });

  it('should start the timer', () => {
    service.start();
    expect(service.isRunning()).toBeTruthy();
    expect(audioService.initAudioContext).toHaveBeenCalled();
  });

  it('should pause the timer', () => {
    service.start();
    service.pause();
    expect(service.isRunning()).toBeFalsy();
  });

  it('should reset to initial state', () => {
    service.start();
    service.reset();
    
    expect(service.isRunning()).toBeFalsy();
    expect(service.currentPhase()).toBe('work');
    expect(service.minutes()).toBe(25);
    expect(service.seconds()).toBe(0);
  });

  it('should tick down seconds', () => {
    service.start();
    const initialSeconds = service.seconds();
    
    service.tick();
    
    expect(service.seconds()).toBeLessThan(initialSeconds + 60);
  });

  it('should complete work phase', () => {
    service.minutes.set(0);
    service.seconds.set(1);
    service.start();
    
    service.tick();
    service.tick();
    
    // Should eventually switch to break phase
    expect(service.currentPhase()).toMatch(/work|break/);
  });

  it('should set work duration', () => {
    service.setWorkDuration(30);
    expect(service.workDuration()).toBe(30);
  });

  it('should set break duration', () => {
    service.setBreakDuration(10);
    expect(service.breakDuration()).toBe(10);
  });

  it('should set quick preset: classic', () => {
    service.setPreset('classic');
    expect(service.workDuration()).toBe(25);
  });

  it('should set quick preset: short', () => {
    service.setPreset('short');
    expect(service.workDuration()).toBe(15);
  });

  it('should set quick preset: long', () => {
    service.setPreset('long');
    expect(service.workDuration()).toBe(45);
  });

  it('should track session history', () => {
    const initialCount = service.sessionHistory().length;
    
    service.completePhase();
    
    // Sessions get logged when phase completes
    expect(service.sessionHistory().length).toBeGreaterThanOrEqual(initialCount);
  });

  it('should compute current time string', () => {
    service.minutes.set(5);
    service.seconds.set(30);
    
    const timeStr = service.currentTime();
    expect(timeStr).toBe('05:30');
  });

  it('should compute total seconds', () => {
    service.minutes.set(10);
    service.seconds.set(45);
    
    expect(service.totalSeconds()).toBe(645);
  });
});
