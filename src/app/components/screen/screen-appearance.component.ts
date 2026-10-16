import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { DisplayStateService } from '../../services/screen/display-state.service';
import { FONT_TOKENS, FontId, THEME_IDS, THEME_TOKENS, ThemeId } from '../../services/screen/theme-tokens';
import { TranslationService } from '../../services/translation.service';

interface ThemeSwatch { id: ThemeId; background: string; accent: string; ink: string; }

/**
 * Theme as visual swatches, font as a segmented control with a sample, and a "follow the app" switch.
 * The pinned theme and font live in ScreenOutputService, so the preview changes as soon as one is picked.
 */
@Component({
  selector: 'app-screen-appearance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './screen-appearance.component.html'
})
export class ScreenAppearanceComponent {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  private display = inject(DisplayStateService);

  readonly swatches: ThemeSwatch[] = THEME_IDS.map(id => {
    const t = THEME_TOKENS[id];
    return {
      id,
      background: `linear-gradient(${t.background.angleDeg}deg, ${t.background.stops.join(', ')})`,
      accent: t.text.accent,
      ink: t.text.primary[0]
    };
  });
  readonly fonts: { id: FontId; name: string; family: string; weight: number; italic: boolean }[] = (
    ['outfit', 'orbitron', 'inter', 'playfair'] as const
  ).map(id => ({
    id,
    name: { outfit: 'Outfit', orbitron: 'Orbitron', inter: 'Inter', playfair: 'Playfair' }[id],
    family: FONT_TOKENS[id].family,
    weight: FONT_TOKENS[id].weight,
    italic: FONT_TOKENS[id].italic
  }));

  /** The theme and font the display follows when nothing is pinned: the app's own. */
  readonly appTheme = computed(() => this.display.snapshot().theme);
  readonly appFont = computed(() => this.display.snapshot().fontId);
  readonly followApp = computed(() => !this.output.themePin() && !this.output.fontPin());
  readonly theme = computed(() => this.output.themePin() ?? this.appTheme());
  readonly font = computed(() => this.output.fontPin() ?? this.appFont());

  themeLabel(id: ThemeId): string {
    return this.ts.t(`CLOCK.THEME_${id.toUpperCase().replace(/-/g, '_')}`);
  }

  pickTheme(id: ThemeId): void {
    this.output.themePin.set(id);
  }

  pickFont(id: FontId): void {
    this.output.fontPin.set(id);
  }

  /** On: follow the app again. Off: keep today's theme and font as the pinned ones. */
  setFollow(follow: boolean): void {
    if (follow) {
      this.output.themePin.set(null);
      this.output.fontPin.set(null);
    } else {
      this.output.themePin.set(this.appTheme());
      this.output.fontPin.set(this.appFont());
    }
  }

  readonly themeIds: readonly ThemeId[] = THEME_IDS;
  readonly fontIds: readonly FontId[] = this.fonts.map(f => f.id);

  /** Arrow keys move the choice inside a radio group, like native radio buttons. */
  onArrow(event: KeyboardEvent, kind: 'theme' | 'font'): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const ids: readonly string[] = kind === 'theme' ? this.themeIds : this.fontIds;
    const next = ids[(ids.indexOf(kind === 'theme' ? this.theme() : this.font()) + step + ids.length) % ids.length];
    if (kind === 'theme') this.pickTheme(next as ThemeId);
    else this.pickFont(next as FontId);
    const group = (event.target as HTMLElement).parentElement;
    setTimeout(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }
}
