import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { isExtensionPage } from './app/extension-context';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

// Register Service Worker for PWA (not in extension pages: they are already offline and installed)
if ('serviceWorker' in navigator && !isExtensionPage) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}
