import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslationService } from '../../services/translation.service';
import { DESKTOP_APP } from '../../desktop-app';

/** The Windows app's page: what it does, how it differs from the browser version, and the download. */
@Component({
  selector: 'app-desktop-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './desktop-page.component.html'
})
export class DesktopPageComponent {
  readonly ts = inject(TranslationService);
  readonly app = DESKTOP_APP;
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  readonly features = [1, 2, 3, 4, 5, 6].map(n => ({ title: `DESKTOP.FEATURES.F${n}_T`, text: `DESKTOP.FEATURES.F${n}_D` }));

  /** Pictures drawn by the app itself (public/assets/desktop), with sample numbers. */
  readonly systemDesigns = [
    { file: 'system-dashboard', name: 'DESKTOP.DESIGNS.DASHBOARD' },
    { file: 'system-panel', name: 'DESKTOP.DESIGNS.PANEL' },
    { file: 'system-gauges', name: 'DESKTOP.DESIGNS.GAUGES' },
    { file: 'system-bars', name: 'DESKTOP.DESIGNS.BARS' },
    { file: 'system-graphs', name: 'DESKTOP.DESIGNS.GRAPHS' },
    { file: 'system-minimal', name: 'DESKTOP.DESIGNS.MINIMAL' }
  ];
  readonly views = [
    { file: 'view-clock', name: 'DESKTOP.DESIGNS.CLOCK' },
    { file: 'view-weather', name: 'DESKTOP.DESIGNS.WEATHER' },
    { file: 'view-world', name: 'DESKTOP.DESIGNS.WORLD' }
  ];

  /** App vs browser. `appYes`/`webYes` mark the cells drawn as a plain "yes". */
  readonly compareRows = [1, 2, 3, 4, 5, 6].map(n => ({
    label: `DESKTOP.COMPARE.R${n}`,
    app: `DESKTOP.COMPARE.R${n}_APP`,
    web: `DESKTOP.COMPARE.R${n}_WEB`,
    appYes: n <= 3,
    webYes: n === 4
  }));

  readonly steps = [1, 2, 3].map(n => ({ n, title: `DESKTOP.STEPS.S${n}_T`, text: `DESKTOP.STEPS.S${n}_D` }));
  readonly faq = [1, 2, 3, 4, 5, 6].map(n => ({ q: `DESKTOP.FAQ.Q${n}`, a: `DESKTOP.FAQ.A${n}`, pawnIo: n === 1 }));

  constructor() {
    effect(() => {
      const title = this.ts.t('DESKTOP.SEO.TITLE');
      const description = this.ts.t('DESKTOP.SEO.DESCRIPTION');
      this.title.setTitle(title);
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ property: 'og:site_name', content: 'AuraTime' });
    });
  }

  /** Fills {version} and {size} in a text. */
  text(key: string): string {
    return this.ts.format(key, { version: this.app.version, size: this.app.sizeMb });
  }

  changeLanguage(event: Event): void {
    this.ts.setLanguage((event.target as HTMLSelectElement).value);
  }
}
