import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, PLATFORM_ID, ViewChild, inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ScreenOutputService } from '../../services/screen/screen-output.service';
import { SerialLinkService } from '../../services/screen/serial-link.service';
import { ScreenViewMode } from '../../services/screen/display-snapshot';
import { AlarmService } from '../../services/alarm.service';

/**
 * /screen: chromeless page that drives the USB display. Keep it open (a dedicated window works
 * best): Web Serial and the render loop live in this page, not in a background worker.
 */
@Component({
  selector: 'app-screen',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="min-h-screen bg-luxury-charcoal text-luxury-platinum font-inter px-4 py-8">
      <div class="mx-auto max-w-3xl">
        <header class="flex items-baseline justify-between mb-1">
          <h1 class="font-outfit font-semibold text-2xl text-luxury-gold">AuraTime · Screen</h1>
          <a routerLink="/app" class="text-xs text-gray-400 hover:text-luxury-gold">← Back to clock</a>
        </header>
        <p class="text-sm text-gray-400 mb-5">
          Turing/TURZX 3.5" display (USB 1A86:5722). Close the TURZX software before connecting.
        </p>

        <div class="flex justify-center rounded-2xl border border-white/10 bg-black p-3">
          <div #preview class="w-full max-w-[480px] [&>canvas]:w-full [&>canvas]:h-auto [&>canvas]:rounded"></div>
        </div>
        <p class="mt-2 text-center text-xs text-gray-500">
          Live preview · view: <b class="text-gray-300">{{ output.activeView() }}</b>
          · backlight: <b class="text-gray-300">{{ output.appliedBrightness() }}%</b>
        </p>

        <section class="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" (click)="output.connect()"
                    [disabled]="!link.isSupported() || link.status() === 'connecting' || link.status() === 'connected'"
                    class="rounded-lg bg-luxury-gold px-4 py-2 text-sm font-medium text-luxury-charcoal disabled:opacity-40">
              Connect display
            </button>
            <button type="button" (click)="output.disconnect()"
                    [disabled]="link.status() !== 'connected'"
                    class="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-40">
              Disconnect
            </button>
            <button type="button" (click)="output.refreshAll()"
                    class="rounded-lg border border-white/15 px-4 py-2 text-sm">
              Redraw everything
            </button>
            <label class="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" [checked]="output.flowControl()"
                     (change)="output.flowControl.set($any($event.target).checked)">
              Flow control (RTS/CTS)
            </label>
          </div>

          <p class="mt-3 text-sm" aria-live="polite">
            Status: <b [class]="statusClass()">{{ statusText() }}</b>
            <span *ngIf="link.model()" class="text-gray-400"> · {{ link.model() }}</span>
            <span *ngIf="link.status() === 'connected'" class="text-gray-400">
              · {{ link.framesSent() }} images · {{ kilobytes() }} KB sent
            </span>
          </p>
          <p *ngIf="link.message()" class="mt-1 text-sm text-amber-300">{{ link.message() }}</p>
        </section>

        <section class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <label class="block text-xs text-gray-400 mb-1" for="view">Views</label>
            <select id="view" class="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                    [value]="output.viewMode()" (change)="output.viewMode.set($any($event.target).value)">
              <option *ngFor="let v of views" [value]="v.value">{{ v.label }}</option>
            </select>
            <p class="mt-2 text-xs text-gray-500">
              Auto rotates every 20 s; the focus view stays on while a Pomodoro is running.
            </p>
          </div>

          <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <label class="block text-xs text-gray-400 mb-1" for="brightness">
              Backlight (day): {{ output.brightness().base }}%
            </label>
            <input id="brightness" type="range" min="0" max="100" class="w-full"
                   [value]="output.brightness().base"
                   (input)="output.setBrightnessBase(+$any($event.target).value)">
          </div>

          <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [checked]="output.brightness().nightEnabled"
                     (change)="output.patchBrightness({ nightEnabled: $any($event.target).checked })">
              Night schedule
            </label>
            <div class="mt-3 grid gap-3 sm:grid-cols-4" [class.opacity-40]="!output.brightness().nightEnabled">
              <div>
                <label class="block text-xs text-gray-400 mb-1" for="from">From</label>
                <select id="from" class="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                        [value]="output.brightness().nightFromHour"
                        (change)="output.patchBrightness({ nightFromHour: +$any($event.target).value })">
                  <option *ngFor="let h of hours" [value]="h">{{ h }}:00</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1" for="to">To</label>
                <select id="to" class="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                        [value]="output.brightness().nightToHour"
                        (change)="output.patchBrightness({ nightToHour: +$any($event.target).value })">
                  <option *ngFor="let h of hours" [value]="h">{{ h }}:00</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1" for="night">
                  Night backlight: {{ output.brightness().nightLevel }}%
                </label>
                <input id="night" type="range" min="0" max="100" class="w-full"
                       [value]="output.brightness().nightLevel"
                       (input)="output.patchBrightness({ nightLevel: +$any($event.target).value })">
              </div>
              <label class="flex items-center gap-2 text-sm sm:mt-5">
                <input type="checkbox" [checked]="output.brightness().nightBlack"
                       (change)="output.patchBrightness({ nightBlack: $any($event.target).checked })">
                Black screen at night
              </label>
            </div>
          </div>
        </section>

        <section class="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <h2 class="text-sm font-medium text-amber-300">Diagnostics</h2>
          <div class="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [checked]="output.alwaysFullFrame()"
                     (change)="output.alwaysFullFrame.set($any($event.target).checked)">
              Always send the full screen
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [checked]="output.slowSend()"
                     (change)="output.slowSend.set($any($event.target).checked)">
              Slow send (3 ms per chunk)
            </label>
          </div>
          <p class="mt-2 text-xs text-gray-400">
            If glitches disappear with "full screen", the problem is in the partial updates; if they
            disappear with "slow send", the display needs more time between chunks.
          </p>
          <p *ngIf="link.lastSend() as s" class="mt-2 font-mono text-xs text-gray-300">
            Last send: {{ s.width }}×{{ s.height }} px · {{ s.bytes }} B · {{ s.ms }} ms ·
            longest gap between chunks {{ s.maxGapMs }} ms
          </p>
        </section>

        <p class="mt-5 text-xs text-gray-500">
          The theme, font, 12/24h clock, Pomodoro and tasks follow the app; change them in the clock window
          and they appear here within a second.
        </p>
      </div>
    </main>
  `
})
export class ScreenComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly output = inject(ScreenOutputService);
  readonly link = inject(SerialLinkService);
  private title = inject(Title);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @ViewChild('preview', { static: true }) previewHost!: ElementRef<HTMLElement>;

  constructor() {
    // This page only *shows* the next alarm; ringing stays with the clock window.
    inject(AlarmService).stopChecker();
  }

  readonly views: { value: ScreenViewMode; label: string }[] = [
    { value: 'auto', label: 'Automatic rotation' },
    { value: 'clock', label: 'Clock' },
    { value: 'focus', label: 'Focus (Pomodoro + tasks)' },
    { value: 'weather', label: 'Weather + quote' }
  ];
  readonly hours = Array.from({ length: 24 }, (_, h) => h);

  ngOnInit(): void {
    this.title.setTitle('AuraTime Screen');
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser || !this.output.canvas) return;
    this.previewHost.nativeElement.appendChild(this.output.canvas);
    void this.output.start();
  }

  ngOnDestroy(): void {
    this.output.stop();
    this.output.canvas?.remove();
  }

  kilobytes(): string {
    return (this.link.bytesSent() / 1024).toFixed(0);
  }

  statusText(): string {
    switch (this.link.status()) {
      case 'connected': return 'connected';
      case 'connecting': return 'connecting…';
      case 'error': return 'error';
      case 'unsupported': return 'unsupported browser';
      default: return 'disconnected';
    }
  }

  statusClass(): string {
    switch (this.link.status()) {
      case 'connected': return 'text-emerald-400';
      case 'error':
      case 'unsupported': return 'text-red-400';
      default: return 'text-gray-200';
    }
  }
}
