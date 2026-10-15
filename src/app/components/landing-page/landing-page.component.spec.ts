import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LandingPageComponent } from './landing-page.component';
import { TranslationService } from '../../services/translation.service';

describe('LandingPageComponent: Desk Display', () => {
  async function render() {
    TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('has a Desk Display button in the top bar, next to the app button, leading to /screen', async () => {
    const { el } = await render();
    const nav = el.querySelector('header nav')!;
    const links = Array.from(nav.querySelectorAll('a'));
    const desk = links.find(a => a.getAttribute('href') === '/screen')!;
    const app = links.find(a => a.getAttribute('href') === '/app')!;
    expect(desk).toBeTruthy();
    expect(desk.textContent).toContain('Desk Display');
    expect(app).toBeTruthy();
    expect(desk.parentElement).toBe(app.parentElement); // same group of buttons
    expect(links.indexOf(desk)).toBeLessThan(links.indexOf(app));
  });

  it('has a dedicated section: what it is, a mock-up, 3 setup steps and the compatibility note', async () => {
    const { el } = await render();
    const section = el.querySelector('section#desk-display')!;
    expect(section).toBeTruthy();
    expect(section.querySelector('h2')!.textContent).toContain('Your clock, on a screen of its own');
    expect(section.querySelector('app-desk-display-mock canvas')).toBeTruthy();
    expect(section.querySelectorAll('ol > li').length).toBe(3);
    expect(section.textContent).toContain('Compatible with Turing Smart Screen 3.5" (USB) displays.');
    expect(section.querySelector('a[href="/screen"]')).toBeTruthy();
  });

  it('does not use third-party logos or suggest a partnership', async () => {
    const { el } = await render();
    const section = el.querySelector('section#desk-display')!;
    expect(section.querySelectorAll('img').length).toBe(0);
    expect(section.textContent).toContain('not affiliated with any display manufacturer');
    expect(section.textContent?.toLowerCase()).not.toMatch(/official|partner|certified|endorsed/);
  });

  it('follows the language of the page', async () => {
    const { fixture, el } = await render();
    const ts = TestBed.inject(TranslationService);
    ts.currentLang.set('pt');
    ts.translations.set({ LANDING: { DESK: { NAV: 'Desk Display', TITLE: 'O teu relógio, num ecrã só dele' } } });
    fixture.detectChanges();
    expect(el.querySelector('section#desk-display h2')!.textContent).toContain('O teu relógio, num ecrã só dele');
  });
});
