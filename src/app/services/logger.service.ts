import { Injectable, ErrorHandler, Injector, NgZone } from '@angular/core';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorLog {
  timestamp: Date;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  context?: string;
  userId?: string;
}

/**
 * Global logging service for debugging and monitoring
 */
@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private logs: ErrorLog[] = [];
  private maxLogs = 100;
  private isDevelopment = !this.isProduction();

  constructor() {
    this.initializeStorage();
  }

  private isProduction(): boolean {
    return typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  }

  private initializeStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem('auratime_logs');
        if (stored) {
          this.logs = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Could not load logs from storage');
      }
    }
  }

  /**
   * Log a message
   */
  log(message: string, context?: string): void {
    if (this.isDevelopment) {
      console.log(`[${context || 'APP'}] ${message}`);
    }
  }

  /**
   * Log a warning
   */
  warn(message: string, context?: string): void {
    if (this.isDevelopment) {
      console.warn(`[${context || 'APP'}] ${message}`);
    }
  }

  /**
   * Log an error
   */
  error(message: string, stack?: string, context?: string, severity: ErrorSeverity = ErrorSeverity.MEDIUM): void {
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      message,
      stack,
      severity,
      context
    };

    this.logs.push(errorLog);

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.persistLogs();

    if (this.isDevelopment) {
      console.error(`[${context || 'ERROR'}] ${message}`, stack);
    }

    // For critical errors, could send to monitoring service
    if (severity === ErrorSeverity.CRITICAL) {
      this.reportCriticalError(errorLog);
    }
  }

  /**
   * Get all logged errors
   */
  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    this.persistLogs();
  }

  private persistLogs(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('auratime_logs', JSON.stringify(this.logs));
      } catch (e) {
        console.warn('Could not persist logs to storage');
      }
    }
  }

  private reportCriticalError(error: ErrorLog): void {
    // In production, you would send this to a monitoring service
    // e.g., Sentry, LogRocket, etc.
    if (!this.isDevelopment) {
      // Example: fetch('/api/errors', { method: 'POST', body: JSON.stringify(error) })
      console.error('Critical error occurred:', error);
    }
  }
}

/**
 * Global error handler for Angular
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(
    private logger: LoggerService,
    private injector: Injector,
    private ngZone: NgZone
  ) {}

  handleError(error: Error): void {
    const chunkFailedMessage = /Loading chunk \d+ failed/g;
    
    if (chunkFailedMessage.test(error.message)) {
      // Lazy loading error - likely version update needed
      this.ngZone.run(() => {
        window.location.reload();
      });
    } else {
      // Log the error
      this.logger.error(
        error.message,
        error.stack,
        'GlobalErrorHandler',
        ErrorSeverity.HIGH
      );
    }

    // Optionally re-throw or handle silently
    // throw error;
  }
}
