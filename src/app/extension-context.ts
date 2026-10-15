import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * True when the app runs as a browser extension page (chrome-extension:// or moz-extension://).
 * False during SSR/prerender, where `location` does not exist.
 */
export const isExtensionPage: boolean =
  typeof location !== 'undefined' && /^(chrome|moz)-extension:$/.test(location.protocol);

/**
 * In the extension the new tab should open the clock, not the marketing landing page.
 * Built as a factory so it can be tested for both contexts.
 */
export function createExtensionHomeRedirect(inExtension: boolean): CanActivateFn {
  return () => (inExtension ? inject(Router).parseUrl('/app') : true);
}

export const extensionHomeRedirect: CanActivateFn = createExtensionHomeRedirect(isExtensionPage);
