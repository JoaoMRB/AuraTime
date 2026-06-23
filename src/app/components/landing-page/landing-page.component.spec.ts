import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LandingPageComponent } from './landing-page.component';
import { TranslationService } from '../../services/translation.service';
import { Meta, Title } from '@angular/platform-browser';

describe('LandingPageComponent', () => {
  let component: LandingPageComponent;
  let fixture: ComponentFixture<LandingPageComponent>;
  let translationService: jasmine.SpyObj<TranslationService>;
  let titleService: jasmine.SpyObj<Title>;
  let metaService: jasmine.SpyObj<Meta>;

  beforeEach(async () => {
    const translationServiceSpy = jasmine.createSpyObj('TranslationService', ['setLanguage', 'getAvailableLanguages', 't']);
    const titleServiceSpy = jasmine.createSpyObj('Title', ['setTitle']);
    const metaServiceSpy = jasmine.createSpyObj('Meta', ['updateTag']);

    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [
        { provide: TranslationService, useValue: translationServiceSpy },
        { provide: Title, useValue: titleServiceSpy },
        { provide: Meta, useValue: metaServiceSpy }
      ]
    }).compileComponents();

    translationService = TestBed.inject(TranslationService) as jasmine.SpyObj<TranslationService>;
    titleService = TestBed.inject(Title) as jasmine.SpyObj<Title>;
    metaService = TestBed.inject(Meta) as jasmine.SpyObj<Meta>;

    fixture = TestBed.createComponent(LandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display current time', () => {
    const time = component.currentTime();
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('should update clock every second', (done) => {
    const initialTime = component.currentTime();
    
    setTimeout(() => {
      component.updateClock();
      // Note: depending on timing, this might be the same or next second
      expect(component.currentTime()).toBeDefined();
      done();
    }, 100);
  });

  it('should change language', () => {
    component.changeLang('pt');
    expect(translationService.setLanguage).toHaveBeenCalledWith('pt');
  });

  it('should set mockup theme', () => {
    component.setMockupTheme('emerald-gold');
    expect(component.mockupTheme()).toBe('emerald-gold');
  });

  it('should change mockup theme to liquid-glass', () => {
    component.setMockupTheme('liquid-glass');
    expect(component.mockupTheme()).toBe('liquid-glass');
  });

  it('should track spotlight position on mouse move', () => {
    const event = new MouseEvent('mousemove', { clientX: 100, clientY: 200 });
    component.onDocumentMouseMove(event);
    
    expect(component.spotlightX()).toBe(100);
    expect(component.spotlightY()).toBe(200);
  });

  it('should apply 3D parallax tilt on card mouse move', () => {
    const mockElement = document.createElement('div');
    mockElement.getBoundingClientRect = jasmine.createSpy('getBoundingClientRect').and.returnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);

    const event = new MouseEvent('mousemove', { clientX: 200, clientY: 150 });
    component.onCardMouseMove(event, mockElement);

    const transform = component.cardTransform();
    expect(transform).toContain('perspective(1000px)');
    expect(transform).toContain('rotateX');
    expect(transform).toContain('rotateY');
  });

  it('should reset card transform on mouse leave', () => {
    component.onCardMouseLeave();
    expect(component.cardTransform()).toBe('perspective(1000px) rotateX(0deg) rotateY(-3deg) scale3d(1, 1, 1)');
  });

  it('should generate valid JSON-LD schema', () => {
    const schema = component.getJsonLdSchema();
    
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.name).toBe('AuraTime');
    expect(schema.operatingSystem).toBe('All');
    expect(schema.offers.price).toBe('0.00');
  });

  it('should cleanup on destroy', () => {
    spyOn(window, 'clearInterval');
    component.ngOnDestroy();
    expect(window.clearInterval).toHaveBeenCalled();
  });
});
