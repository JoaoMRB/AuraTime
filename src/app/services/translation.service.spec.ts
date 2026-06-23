import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

describe('TranslationService', () => {
  let service: TranslationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TranslationService]
    });

    service = TestBed.inject(TranslationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return available languages', () => {
    const languages = service.getAvailableLanguages();
    
    expect(languages.length).toBeGreaterThan(0);
    expect(languages.some(l => l.code === 'en')).toBeTruthy();
    expect(languages.some(l => l.code === 'pt')).toBeTruthy();
  });

  it('should translate a simple path', () => {
    const translation = service.t('BRAND');
    expect(translation).toBeDefined();
    expect(translation.length).toBeGreaterThan(0);
  });

  it('should translate a nested path', () => {
    const translation = service.t('LANDING.HERO.TITLE');
    expect(translation).toBeDefined();
    expect(translation).toContain('Elegance') || expect(translation).toContain('Luxo');
  });

  it('should return fallback for invalid path', () => {
    const translation = service.t('INVALID.PATH.HERE');
    expect(translation).toBe('INVALID.PATH.HERE');
  });

  it('should set language', (done) => {
    service.setLanguage('pt');
    
    setTimeout(() => {
      expect(service.currentLang()).toBe('pt');
      done();
    }, 100);
  });

  it('should start with default language', () => {
    expect(service.currentLang()).toBe('en');
  });

  it('should have default translations loaded', () => {
    const translations = service.translations();
    expect(translations).toBeDefined();
    expect(Object.keys(translations).length).toBeGreaterThan(0);
  });

  it('should handle language change', (done) => {
    service.setLanguage('es');
    
    const req = httpMock.expectOne('/assets/i18n/es.json');
    expect(req.request.method).toBe('GET');
    
    req.flush({ BRAND: 'AURA' });
    
    setTimeout(() => {
      expect(service.currentLang()).toBe('es');
      done();
    }, 50);
  });

  it('should fallback to defaults on HTTP error', (done) => {
    service.setLanguage('en');
    
    const req = httpMock.expectOne('/assets/i18n/en.json');
    req.error(new ErrorEvent('Network error'));
    
    setTimeout(() => {
      expect(service.currentLang()).toBe('en');
      done();
    }, 50);
  });
});
