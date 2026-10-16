import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { SerialLinkService } from '../../services/screen/serial-link.service';
import { TickService } from '../../services/screen/tick.service';
import { TranslationService } from '../../services/translation.service';
import { ScreenIconComponent } from './screen-icon.component';

const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 56;
/** The sparkline covers this much time. */
const SPARK_WINDOW_MS = 5 * 60 * 1000;

/** Formats a duration as "42 s", "5 min" or "2 h 14 min". */
export function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Stat chips instead of a dense status line, a sparkline of frame times, and a warning when the link struggles. */
@Component({
  selector: 'app-screen-health',
  standalone: true,
  imports: [ScreenIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './screen-health.component.html'
})
export class ScreenHealthComponent {
  readonly ts = inject(TranslationService);
  readonly output = inject(ScreenOutputService);
  readonly link = inject(SerialLinkService);
  private tick = inject(TickService);

  readonly sparkWidth = SPARK_WIDTH;
  readonly sparkHeight = SPARK_HEIGHT;

  /** Problems (timeouts + forced redraws) already counted when the page was opened or the warning dismissed. */
  private readonly baseline = signal(this.problemTotal());

  readonly uptime = computed(() => {
    const since = this.output.connectedAt();
    return since === null ? '—' : formatUptime(this.tick.now().getTime() - since);
  });
  readonly lastFrame = computed(() => {
    const send = this.link.lastSend();
    return send ? `${send.ms} ms` : '—';
  });
  /** New timeouts or forced full redraws since the page was opened (or the last dismissal). */
  readonly newProblems = computed(() => this.problemTotal() - this.baseline());
  readonly warning = computed(() => this.newProblems() > 0);

  private points = computed(() => {
    const now = this.tick.now().getTime();
    return this.link.sendHistory().filter(p => now - p.at <= SPARK_WINDOW_MS);
  });
  readonly sparkMax = computed(() => Math.max(50, ...this.points().map(p => p.ms)));
  readonly sparkLast = computed(() => this.points().at(-1)?.ms ?? null);
  readonly sparkPath = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return '';
    const max = this.sparkMax();
    const t0 = pts[0].at;
    const span = Math.max(1, pts[pts.length - 1].at - t0);
    return pts
      .map((p, i) => {
        const x = ((p.at - t0) / span) * SPARK_WIDTH;
        const y = SPARK_HEIGHT - 4 - (p.ms / max) * (SPARK_HEIGHT - 8);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  });

  private problemTotal(): number {
    return this.link.writeTimeouts() + this.output.forcedFullRedraws() + this.link.resyncs();
  }

  dismiss(): void {
    this.baseline.set(this.problemTotal());
  }
}
