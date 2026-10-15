import { DESK_DISPLAY_EN } from '../../../i18n/desk-display.en';
import { ScreenLabels } from '../display-snapshot';
import { buildLabels } from '../screen-logic';

/** English texts of the screen, without needing a TranslationService (for tests and sample renders). */
export function englishLabels(): ScreenLabels {
  return buildLabels(path => path.split('.').reduce((node: any, key) => node?.[key], DESK_DISPLAY_EN) ?? path);
}
