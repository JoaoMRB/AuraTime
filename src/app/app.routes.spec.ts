import { routes } from './app.routes';

/**
 * The initial bundle has a size budget (angular.json). The clock and the Desk Display page are big and only needed
 * on their own routes, so they must stay lazy-loaded: importing either component at the top of app.routes.ts
 * would put it back in the initial bundle.
 */
describe('routes: heavy pages are lazy-loaded', () => {
  for (const path of ['app', 'screen', 'desktop']) {
    it(`"${path}" loads its component on demand`, () => {
      const route = routes.find(r => r.path === path)!;
      expect(route.component).withContext('a directly imported component is in the initial bundle').toBeUndefined();
      expect(typeof route.loadComponent).toBe('function');
    });
  }

  it('the Windows app page resolves to the DesktopPageComponent', async () => {
    const route = routes.find(r => r.path === 'desktop')!;
    const component = await (route.loadComponent as () => Promise<{ name: string }>)();
    expect(component.name).toBe('DesktopPageComponent');
  });

  it('the clock route resolves to the ClockComponent', async () => {
    const route = routes.find(r => r.path === 'app')!;
    const component = await (route.loadComponent as () => Promise<{ name: string }>)();
    expect(component.name).toBe('ClockComponent');
  });
});
