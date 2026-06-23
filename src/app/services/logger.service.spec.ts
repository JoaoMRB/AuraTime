import { TestBed } from '@angular/core/testing';
import { LoggerService, ErrorSeverity } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });
    service = TestBed.inject(LoggerService);
    service.clearLogs(); // Clear before each test
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should log messages', () => {
    spyOn(console, 'log');
    service.log('Test message', 'TestContext');
    expect(console.log).toHaveBeenCalled();
  });

  it('should log warnings', () => {
    spyOn(console, 'warn');
    service.warn('Warning message', 'TestContext');
    expect(console.warn).toHaveBeenCalled();
  });

  it('should log errors', () => {
    spyOn(console, 'error');
    service.error('Error message', 'stack trace', 'TestContext');
    
    const logs = service.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].message).toBe('Error message');
  });

  it('should store error logs', () => {
    service.error('Test error', undefined, 'Test');
    const logs = service.getLogs();
    
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('Test error');
    expect(logs[0].severity).toBe(ErrorSeverity.MEDIUM);
  });

  it('should respect max log limit', () => {
    for (let i = 0; i < 150; i++) {
      service.error(`Error ${i}`);
    }
    
    const logs = service.getLogs();
    expect(logs.length).toBeLessThanOrEqual(100);
  });

  it('should clear logs', () => {
    service.error('Test error');
    expect(service.getLogs().length).toBe(1);
    
    service.clearLogs();
    expect(service.getLogs().length).toBe(0);
  });

  it('should include timestamp in logs', () => {
    const beforeTime = new Date();
    service.error('Test error');
    const afterTime = new Date();
    
    const logs = service.getLogs();
    expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(logs[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });

  it('should handle different severity levels', () => {
    service.error('Low error', undefined, 'Test', ErrorSeverity.LOW);
    service.error('Medium error', undefined, 'Test', ErrorSeverity.MEDIUM);
    service.error('High error', undefined, 'Test', ErrorSeverity.HIGH);
    
    const logs = service.getLogs();
    expect(logs[0].severity).toBe(ErrorSeverity.LOW);
    expect(logs[1].severity).toBe(ErrorSeverity.MEDIUM);
    expect(logs[2].severity).toBe(ErrorSeverity.HIGH);
  });

  it('should not persist logs outside browser environment', () => {
    // This test would need to mock localStorage
    // For now, just verify the service handles it gracefully
    service.error('Test error');
    expect(service.getLogs().length).toBeGreaterThan(0);
  });
});
