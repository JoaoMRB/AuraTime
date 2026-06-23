import { TestBed } from '@angular/core/testing';
import { ValidationService } from './validation.service';

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ValidationService]
    });
    service = TestBed.inject(ValidationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Time validation', () => {
    it('should validate valid time format', () => {
      expect(service.isValidTime('07:30')).toBeTruthy();
      expect(service.isValidTime('23:59')).toBeTruthy();
      expect(service.isValidTime('00:00')).toBeTruthy();
    });

    it('should reject invalid time format', () => {
      expect(service.isValidTime('25:00')).toBeFalsy();
      expect(service.isValidTime('12:60')).toBeFalsy();
      expect(service.isValidTime('invalid')).toBeFalsy();
      expect(service.isValidTime('7:30')).toBeFalsy();
    });
  });

  describe('Duration validation', () => {
    it('should validate valid seconds', () => {
      expect(service.isValidSeconds(300)).toBeTruthy();
      expect(service.isValidSeconds(0)).toBeTruthy();
      expect(service.isValidSeconds(86400)).toBeTruthy();
    });

    it('should reject invalid seconds', () => {
      expect(service.isValidSeconds(-1)).toBeFalsy();
      expect(service.isValidSeconds(86401)).toBeFalsy();
      expect(service.isValidSeconds('invalid')).toBeFalsy();
    });

    it('should validate valid minutes', () => {
      expect(service.isValidMinutes(25)).toBeTruthy();
      expect(service.isValidMinutes(1)).toBeTruthy();
      expect(service.isValidMinutes(1440)).toBeTruthy();
    });

    it('should reject invalid minutes', () => {
      expect(service.isValidMinutes(0)).toBeFalsy();
      expect(service.isValidMinutes(-1)).toBeFalsy();
      expect(service.isValidMinutes(1441)).toBeFalsy();
    });
  });

  describe('Label validation', () => {
    it('should validate valid labels', () => {
      expect(service.isValidLabel('Morning')).toBeTruthy();
      expect(service.isValidLabel('Morning Alarm')).toBeTruthy();
      expect(service.isValidLabel('alarm-1')).toBeTruthy();
    });

    it('should reject invalid labels', () => {
      expect(service.isValidLabel('')).toBeFalsy();
      expect(service.isValidLabel('a'.repeat(51))).toBeFalsy();
      expect(service.isValidLabel('Alert@#$')).toBeFalsy();
    });
  });

  describe('Timezone validation', () => {
    it('should validate valid timezones', () => {
      expect(service.isValidTimezone('America/New_York')).toBeTruthy();
      expect(service.isValidTimezone('Europe/London')).toBeTruthy();
      expect(service.isValidTimezone('Asia/Tokyo')).toBeTruthy();
    });

    it('should reject invalid timezones', () => {
      expect(service.isValidTimezone('Invalid/Timezone')).toBeFalsy();
      expect(service.isValidTimezone('Fake Zone')).toBeFalsy();
    });
  });

  describe('Angle validation', () => {
    it('should validate valid angles', () => {
      expect(service.isValidAngle(0)).toBeTruthy();
      expect(service.isValidAngle(45)).toBeTruthy();
      expect(service.isValidAngle(-45)).toBeTruthy();
      expect(service.isValidAngle(-20.5)).toBeTruthy();
    });

    it('should reject invalid angles', () => {
      expect(service.isValidAngle(46)).toBeFalsy();
      expect(service.isValidAngle(-46)).toBeFalsy();
      expect(service.isValidAngle('invalid')).toBeFalsy();
    });
  });

  describe('Scale validation', () => {
    it('should validate valid scales', () => {
      expect(service.isValidScale(1.0)).toBeTruthy();
      expect(service.isValidScale(0.5)).toBeTruthy();
      expect(service.isValidScale(2.0)).toBeTruthy();
      expect(service.isValidScale(1.5)).toBeTruthy();
    });

    it('should reject invalid scales', () => {
      expect(service.isValidScale(0.4)).toBeFalsy();
      expect(service.isValidScale(2.1)).toBeFalsy();
      expect(service.isValidScale('invalid')).toBeFalsy();
    });
  });

  describe('Sanitization', () => {
    it('should sanitize labels', () => {
      expect(service.sanitizeLabel('  Morning  ')).toBe('Morning');
      expect(service.sanitizeLabel('a'.repeat(60))).toBe('a'.repeat(50));
    });

    it('should sanitize time', () => {
      expect(service.sanitizeTime('  07:30  ')).toBe('07:30');
    });
  });

  describe('Complex validation', () => {
    it('should validate alarm objects', () => {
      const validAlarm = {
        time: '07:30',
        enabled: true,
        label: 'Morning'
      };
      expect(service.isValidAlarm(validAlarm)).toBeTruthy();

      const invalidAlarm = {
        time: 'invalid',
        enabled: true,
        label: 'Morning'
      };
      expect(service.isValidAlarm(invalidAlarm)).toBeFalsy();
    });

    it('should validate timer settings', () => {
      const validSettings = {
        duration: 25,
        label: 'Pomodoro'
      };
      expect(service.isValidTimerSettings(validSettings)).toBeTruthy();
    });
  });

  describe('Error messages', () => {
    it('should provide error messages', () => {
      expect(service.getErrorMessage('time', null)).toContain('format');
      expect(service.getErrorMessage('label', null)).toContain('1-50');
      expect(service.getErrorMessage('minutes', null)).toContain('1 and 1440');
    });
  });
});
