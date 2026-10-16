import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject } from '@angular/core';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { TickService } from '../../services/screen/tick.service';
import { TranslationService } from '../../services/translation.service';
import { ScreenIconComponent } from './screen-icon.component';

type Handle = 'from' | 'to';

/**
 * Day / night brightness as a 24 h timeline with two handles (night starts, night ends), one brightness slider
 * per period and the black-screen option. Handles snap to whole hours and work with the pointer and the keyboard.
 */
@Component({
  selector: 'app-screen-schedule',
  standalone: true,
  imports: [ScreenIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './screen-schedule.component.html'
})
export class ScreenScheduleComponent {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  private tick = inject(TickService);

  @ViewChild('bar', { static: true }) bar!: ElementRef<HTMLElement>;

  readonly axis = [0, 6, 12, 18, 24];
  readonly b = this.output.brightness;
  readonly nightOn = computed(() => this.b().nightEnabled && this.b().nightFromHour !== this.b().nightToHour);

  /** Night segments as [startHour, endHour] pairs inside 0..24 (two when the night crosses midnight). */
  readonly nightSegments = computed<[number, number][]>(() => {
    const { nightFromHour: from, nightToHour: to } = this.b();
    if (!this.nightOn()) return [];
    return from > to ? [[from, 24], [0, to]] : [[from, to]];
  });
  readonly dayColor = computed(() => `rgba(212, 175, 55, ${0.18 + 0.6 * (this.b().base / 100)})`);
  /** Opaque (a dark base under the tint), so the night segment does not mix with the day colour. */
  readonly nightColor = computed(() => {
    const tint = this.b().nightBlack ? 'rgb(0, 0, 0)' : `rgba(96, 120, 190, ${0.12 + 0.5 * (this.b().nightLevel / 100)})`;
    return `linear-gradient(${tint}, ${tint}), #0C0F0D`;
  });
  /** Position of "now" on the timeline, in percent. */
  readonly nowPercent = computed(() => {
    const d = this.tick.now();
    return ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;
  });

  pct(hour: number): number {
    return (hour / 24) * 100;
  }

  label(hour: number): string {
    return `${String(hour % 24).padStart(2, '0')}:00`;
  }

  fill(value: number): string {
    return `${value}%`;
  }

  hourOf(handle: Handle): number {
    return handle === 'from' ? this.b().nightFromHour : this.b().nightToHour;
  }

  setHour(handle: Handle, hour: number): void {
    const wrapped = ((Math.round(hour) % 24) + 24) % 24;
    this.output.patchBrightness(handle === 'from' ? { nightFromHour: wrapped } : { nightToHour: wrapped });
  }

  onKey(event: KeyboardEvent, handle: Handle): void {
    const now = this.hourOf(handle);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': next = now + 1; break;
      case 'ArrowLeft': case 'ArrowDown': next = now - 1; break;
      case 'PageUp': next = now + 3; break;
      case 'PageDown': next = now - 3; break;
      case 'Home': next = 0; break;
      case 'End': next = 23; break;
    }
    if (next === null) return;
    event.preventDefault();
    this.setHour(handle, next);
  }

  /** The handle being dragged, if any. */
  private dragging: Handle | null = null;

  onPointerDown(event: PointerEvent, handle: Handle): void {
    try { (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); } catch { /* not an active pointer */ }
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus();
    this.dragging = handle;
    this.moveTo(event, handle);
  }

  onPointerMove(event: PointerEvent, handle: Handle): void {
    if (this.dragging === handle) this.moveTo(event, handle);
  }

  onPointerEnd(): void {
    this.dragging = null;
  }

  private moveTo(event: PointerEvent, handle: Handle): void {
    const rect = this.bar.nativeElement.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.setHour(handle, ratio * 24);
  }

  /** Clicking the bar moves the nearest handle there. */
  onBarClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('[role="slider"]')) return;
    const rect = this.bar.nativeElement.getBoundingClientRect();
    const hour = Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * 24);
    const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 24 - Math.abs(a - b));
    this.setHour(distance(hour, this.b().nightFromHour) <= distance(hour, this.b().nightToHour) ? 'from' : 'to', hour);
  }
}
