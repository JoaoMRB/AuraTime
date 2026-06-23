import { Injectable } from '@angular/core';

/**
 * Service for form validation and input sanitization
 */
@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  
  /**
   * Validate time format (HH:MM)
   */
  isValidTime(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Validate time in seconds (must be positive integer)
   */
  isValidSeconds(seconds: any): boolean {
    const num = Number(seconds);
    return Number.isInteger(num) && num >= 0 && num <= 86400; // 24 hours max
  }

  /**
   * Validate duration in minutes
   */
  isValidMinutes(minutes: any): boolean {
    const num = Number(minutes);
    return Number.isInteger(num) && num >= 1 && num <= 1440; // 24 hours max
  }

  /**
   * Validate label/name (non-empty, max 50 chars, no special chars)
   */
  isValidLabel(label: string): boolean {
    if (!label) return false;
    if (label.length > 50) return false;
    // Allow alphanumeric, spaces, hyphens, underscores
    const labelRegex = /^[a-zA-Z0-9\s\-_]+$/;
    return labelRegex.test(label);
  }

  /**
   * Validate timezone (must be valid IANA timezone)
   */
  isValidTimezone(timezone: string): boolean {
    try {
      // Test if timezone is valid by trying to format a date with it
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Validate angle value (-45 to 45 degrees)
   */
  isValidAngle(angle: any): boolean {
    const num = Number(angle);
    return !isNaN(num) && num >= -45 && num <= 45;
  }

  /**
   * Validate scale value (0.5 to 2.0)
   */
  isValidScale(scale: any): boolean {
    const num = Number(scale);
    return !isNaN(num) && num >= 0.5 && num <= 2.0;
  }

  /**
   * Sanitize label input (trim and limit length)
   */
  sanitizeLabel(label: string): string {
    return label.trim().substring(0, 50);
  }

  /**
   * Sanitize time input
   */
  sanitizeTime(time: string): string {
    return time.trim();
  }

  /**
   * Validate alarm object
   */
  isValidAlarm(alarm: any): boolean {
    return (
      this.isValidTime(alarm.time) &&
      typeof alarm.enabled === 'boolean' &&
      this.isValidLabel(alarm.label)
    );
  }

  /**
   * Validate timer settings
   */
  isValidTimerSettings(settings: any): boolean {
    return (
      this.isValidMinutes(settings.duration) &&
      this.isValidLabel(settings.label)
    );
  }

  /**
   * Validate pomodoro settings
   */
  isValidPomodoroSettings(settings: any): boolean {
    return (
      this.isValidMinutes(settings.workDuration) &&
      this.isValidMinutes(settings.breakDuration)
    );
  }

  /**
   * Get validation error messages
   */
  getErrorMessage(field: string, value: any): string {
    switch (field) {
      case 'time':
        return 'Invalid time format. Use HH:MM (e.g., 07:30)';
      case 'label':
        return 'Label must be 1-50 characters, alphanumeric only';
      case 'minutes':
        return 'Duration must be between 1 and 1440 minutes';
      case 'seconds':
        return 'Duration must be between 0 and 86400 seconds';
      case 'angle':
        return 'Angle must be between -45 and 45 degrees';
      case 'scale':
        return 'Scale must be between 0.5 and 2.0';
      case 'timezone':
        return 'Invalid timezone. Check IANA timezone database';
      default:
        return 'Invalid input';
    }
  }
}
