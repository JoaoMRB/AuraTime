import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { DesktopPageComponent } from './desktop-page.component';
import { DESKTOP_APP } from '../../desktop-app';

describe('DesktopPageComponent', () => {
  function render() {
    TestBed.configureTestingModule({
      imports: [DesktopPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    const fixture = TestBed.createComponent(DesktopPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('offers the latest installer for download', () => {
    const { el } = render();
    const download = el.querySelector<HTMLAnchorElement>('[data-testid="download"]')!;
    expect(download.getAttribute('href')).toBe(DESKTOP_APP.downloadUrl);
    expect(download.textContent).toContain('Download for Windows');
    // the link always points at the newest release, never at a fixed version
    expect(DESKTOP_APP.downloadUrl).toContain('/releases/latest/download/AuraTime-Setup.exe');
  });

  it('says it is a beta, with the version and the download size', () => {
    const { el } = render();
    const meta = el.querySelector('[data-testid="meta"]')!.textContent!;
    expect(meta).toContain(`Version ${DESKTOP_APP.version} beta`);
    expect(meta).toContain(`${DESKTOP_APP.sizeMb} MB`);
    expect(meta).not.toContain('{');
    expect(el.querySelector('h1')!.textContent).toContain('AuraTime for Windows');
  });

  it('shows the six system designs and the three other views, drawn by the app', () => {
    const { el } = render();
    const pictures = Array.from(el.querySelectorAll<HTMLImageElement>('img'))
      .map(img => img.getAttribute('src'))
      .filter(src => src?.startsWith('/assets/desktop/system-') || src?.startsWith('/assets/desktop/view-'));
    expect(pictures.length).toBe(9);
  });

  it('compares the app with the browser version, both ways', () => {
    const { el } = render();
    const rows = el.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(6);
    expect(el.querySelector('table')!.textContent).toContain('Not yet'); // honest about what the app lacks
  });

  it('points to the PawnIO driver for the CPU temperature', () => {
    const { el } = render();
    const link = el.querySelector<HTMLAnchorElement>(`a[href="${DESKTOP_APP.pawnIoUrl}"]`);
    expect(link).toBeTruthy();
    expect(link!.rel).toContain('noopener');
  });

  it('links to the browser version and sets its own title', () => {
    const { el } = render();
    expect(el.querySelector('a[href="/screen"]')).toBeTruthy();
    expect(TestBed.inject(Title).getTitle()).toContain('AuraTime for Windows');
  });
});
