import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { GlobalErrorHandler, LoggerService } from './services/logger.service';
import { isExtensionPage } from './extension-context';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Extension pages are static files (index.csr.html): there is no server to answer /app or /screen,
    // so the extension uses hash URLs (index.csr.html#/app) that survive a reload.
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      ...(isExtensionPage ? [withHashLocation()] : [])
    ),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    LoggerService,
    { provide: ErrorHandler, useClass: GlobalErrorHandler }
  ]
};
