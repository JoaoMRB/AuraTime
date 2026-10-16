import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Stroke paths (24x24) of the small icons used by the Desk Display page. */
const PATHS = {
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 6l6 6-6 6',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M8.5 5v14M15.5 5v14',
  pin: 'M12 16v6M8.5 3h7l-1 6.5L18 13v2H6v-2l3.5-3.5z',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M6 9l6 6 6-6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  power: 'M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'
} as const;

export type ScreenIconName = keyof typeof PATHS;

/** Decorative icon: the button or link around it carries the accessible name. */
@Component({
  selector: 'app-screen-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                  stroke-linejoin="round" aria-hidden="true" focusable="false" class="block h-full w-full">
               <path [attr.d]="path()" [attr.fill]="name() === 'play' ? 'currentColor' : null" />
             </svg>`,
  styles: [':host { display: inline-block; width: 1.25rem; height: 1.25rem; flex: none; }']
})
export class ScreenIconComponent {
  readonly name = input.required<ScreenIconName>();
  readonly path = computed(() => PATHS[this.name()]);
}
