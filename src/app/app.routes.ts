import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page/landing-page.component';
import { ClockComponent } from './components/clock/clock.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent },
  { path: 'app', component: ClockComponent },
  { path: '**', redirectTo: '' }
];

