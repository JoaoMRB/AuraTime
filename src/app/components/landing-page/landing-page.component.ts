import { Component, OnInit, OnDestroy, inject, signal, effect, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit, OnDestroy {
  public ts = inject(TranslationService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private platformId = inject(PLATFORM_ID);

  // Mockup clock time
  currentTime = signal<string>('00:00:00');
  currentDate = signal<string>('');
  private timerId: any;

  constructor() {
    // Dynamic SEO updating when language changes
    effect(() => {
      const titleStr = `${this.ts.t('LANDING.HERO.TITLE')} | ${this.ts.t('BRAND')}`;
      const descStr = this.ts.t('LANDING.HERO.SUBTITLE');
      
      this.titleService.setTitle(titleStr);
      this.metaService.updateTag({ name: 'description', content: descStr });
      this.metaService.updateTag({ name: 'keywords', content: 'screen clock, minimalist clock, liquid glass clock, aesthetic desk clock, focus helper, pomodoro online, luxury setup, gold black clock, vercel app, angular ssr' });
      
      // Open Graph Tags
      this.metaService.updateTag({ property: 'og:title', content: titleStr });
      this.metaService.updateTag({ property: 'og:description', content: descStr });
      this.metaService.updateTag({ property: 'og:type', content: 'website' });
      this.metaService.updateTag({ property: 'og:site_name', content: 'AuraTime' });
    });
  }

  ngOnInit() {
    this.updateClock();
    if (isPlatformBrowser(this.platformId)) {
      this.timerId = setInterval(() => {
        this.updateClock();
      }, 1000);
    }
  }

  ngOnDestroy() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }

  updateClock() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    this.currentTime.set(`${hrs}:${mins}:${secs}`);

    // Update date
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const lang = this.ts.currentLang() === 'pt' ? 'pt-PT' : 'en-US';
    this.currentDate.set(now.toLocaleDateString(lang, options));
  }

  changeLang(lang: string) {
    this.ts.setLanguage(lang);
  }

  // Generate structured JSON-LD schema
  getJsonLdSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "AuraTime",
      "operatingSystem": "All",
      "applicationCategory": "ProductivityApplication",
      "offers": {
        "@type": "Offer",
        "price": "0.00",
        "priceCurrency": "USD"
      },
      "description": this.ts.t('LANDING.HERO.SUBTITLE'),
      "keywords": "Aesthetic Screen Clock, Minimalist Desk Clock, Glassmorphism Focus Tool, Premium Pomodoro Background"
    };
  }
}
