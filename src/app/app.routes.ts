import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page/landing-page.component';
import { ClockComponent } from './components/clock/clock.component';
import { extensionHomeRedirect } from './extension-context';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, canActivate: [extensionHomeRedirect] },
  { path: 'app', component: ClockComponent },
  {
    path: 'screen',
    loadComponent: () => import('./components/screen/screen.component').then(m => m.ScreenComponent)
  },
  { path: '**', redirectTo: '' }
];

