import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { createExtensionHomeRedirect } from './extension-context';

describe('extension home redirect', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  const run = (inExtension: boolean) =>
    TestBed.runInInjectionContext(() => createExtensionHomeRedirect(inExtension)({} as never, {} as never));

  it('sends the extension new tab to the clock', () => {
    const result = run(true) as UrlTree;
    expect(result instanceof UrlTree).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/app');
  });

  it('leaves the website landing page alone', () => {
    expect(run(false)).toBeTrue();
  });
});
