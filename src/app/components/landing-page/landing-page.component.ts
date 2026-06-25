import { Component, OnInit, OnDestroy, inject, signal, effect, PLATFORM_ID, HostListener } from '@angular/core';
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
  private isBrowser = isPlatformBrowser(this.platformId);

  // Mockup clock time
  currentTime = signal<string>('00:00:00');
  currentDate = signal<string>('');
  private timerId: any;

  // WOW Factor 1: Active mockup theme preview
  mockupTheme = signal<string>('emerald-gold');

  // WOW Factor 2: Interactive background spotlight following cursor
  spotlightX = signal<number>(-1000);
  spotlightY = signal<number>(-1000);

  // WOW Factor 3: 3D Parallax Tilt on Card
  cardTransform = signal<string>('perspective(1000px) rotateX(0deg) rotateY(-3deg) scale3d(1, 1, 1)');

  // Language dropdown
  langDropdownOpen = signal<boolean>(false);

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
    if (this.isBrowser) {
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

  getCurrentLanguageName(): string {
    const current = this.ts.getAvailableLanguages().find(l => l.code === this.ts.currentLang());
    return current?.name ?? 'English';
  }

  changeLang(lang: string) {
    this.ts.setLanguage(lang);
    this.langDropdownOpen.set(false);
  }

  toggleLangDropdown(event: Event) {
    event.stopPropagation();
    this.langDropdownOpen.update(v => !v);
  }

  // Spotlight Mouse Tracking
  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (this.isBrowser) {
      this.spotlightX.set(event.clientX);
      this.spotlightY.set(event.clientY);
    }
  }

  // Close dropdown on click outside
  @HostListener('document:click')
  onDocumentClick() {
    if (this.langDropdownOpen()) {
      this.langDropdownOpen.set(false);
    }
  }

  // 3D Parallax Tilt Effect
  onCardMouseMove(event: MouseEvent, cardElement: HTMLElement) {
    if (!this.isBrowser) return;
    const rect = cardElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Normalize coordinates around center (-0.5 to 0.5)
    const px = (x / rect.width) - 0.5;
    const py = (y / rect.height) - 0.5;

    // Calculate rotation angles (max 15 degrees tilt)
    const tiltX = (py * -15).toFixed(2);
    const tiltY = (px * 15).toFixed(2);

    this.cardTransform.set(`perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.03, 1.03, 1.03)`);
  }

  onCardMouseLeave() {
    // Reset to static resting position
    this.cardTransform.set('perspective(1000px) rotateX(0deg) rotateY(-3deg) scale3d(1, 1, 1)');
  }

  // Theme Swapper trigger
  setMockupTheme(theme: string) {
    this.mockupTheme.set(theme);
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
