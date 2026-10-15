import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page/landing-page.component';
import { extensionHomeRedirect } from './extension-context';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, canActivate: [extensionHomeRedirect] },
  {
    path: 'app',
    loadComponent: () => import('./components/clock/clock.component').then(m => m.ClockComponent)
  },
  {
    path: 'screen',
    loadComponent: () => import('./components/screen/screen.component').then(m => m.ScreenComponent)
  },
  { path: '**', redirectTo: '' }
];

