import { Component, OnInit, OnDestroy, HostListener, inject, signal, effect, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { SettingsService } from '../../services/settings.service';
import { TranslationService } from '../../services/translation.service';
import { AudioService } from '../../services/audio.service';
import { PomodoroService } from '../../services/pomodoro.service';
import { WorldClockService } from '../../services/world-clock.service';
import { StopwatchService } from '../../services/stopwatch.service';
import { TimerService } from '../../services/timer.service';
import { AlarmService } from '../../services/alarm.service';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './clock.component.html',
  styleUrl: './clock.component.css'
})
export class ClockComponent implements OnInit, OnDestroy {
  public settings = inject(SettingsService);
  public ts = inject(TranslationService);
  private titleService = inject(Title);
  private audioService = inject(AudioService);
  private pomodoroService = inject(PomodoroService);
  public worldClockService = inject(WorldClockService);
  private stopwatchService = inject(StopwatchService);
  private timerService = inject(TimerService);
  private alarmService = inject(AlarmService);
  private keyboardService = inject(KeyboardShortcutsService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Time States
  currentTime = signal<string>('00:00:00');
  currentDateStr = signal<string>('');

  // Pomodoro States (exposed from service)
  pomoMinutes = computed(() => {
    const time = this.pomodoroService.currentTime();
    return parseInt(time.split(':')[0]);
  });
  pomoSeconds = computed(() => {
    const time = this.pomodoroService.currentTime();
    return parseInt(time.split(':')[1]);
  });
  pomoRunning = computed(() => this.pomodoroService.isRunning());
  pomoPhase = computed(() => this.pomodoroService.currentPhase());

  // Stopwatch States (exposed from service)
  stopwatchTime = computed(() => this.stopwatchService.currentTime());
  stopwatchRunning = computed(() => this.stopwatchService.isRunning());
  stopwatchLaps = computed(() => this.stopwatchService.allLaps());

  // Timer States (exposed from service)
  timerTime = computed(() => this.timerService.currentTime());
  timerRunning = computed(() => this.timerService.isRunning());
  timerProgress = computed(() => this.timerService.progress());

  // World Clock States (exposed from service)
  worldClocks = computed(() => this.worldClockService.allClocks());

  // Alarm States (exposed from service)
  alarms = computed(() => this.alarmService.allAlarms());
  nextAlarmTime = computed(() => this.alarmService.nextAlarmTime());
  isAlarmRinging = computed(() => this.alarmService.isAlarmRinging());

  // HUD visibility control
  hudVisible = signal<boolean>(true);
  settingsOpen = signal<boolean>(false);
  private hudTimeout: any;

  // Running interval IDs
  private clockIntervalId: any;

  constructor() {
    // Watch settings changes to control background sounds
    effect(() => {
      const activeSound = this.settings.sound();
      if (this.isBrowser) {
        this.audioService.handleSoundChange(activeSound as any);
      }
    });
  }

  ngOnInit() {
    this.updateTime();
    
    if (this.isBrowser) {
      // Start time update interval
      this.clockIntervalId = setInterval(() => {
        this.updateTime();
        this.pomodoroService.tick();
        if (this.settings.sound() === 'tick') {
          this.audioService.playTickSound();
        }
      }, 1000);

      // Start mouse inactivity listener
      this.triggerHudVisibility();

      // Setup keyboard shortcut listeners
      this.setupKeyboardListeners();
    }
  }

  ngOnDestroy() {
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
    }
    if (this.hudTimeout) {
      clearTimeout(this.hudTimeout);
    }
    this.audioService.destroy();
    this.removeKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    this.toggleSettingsListener = () => this.toggleSettings();
    this.closeSettingsListener = () => this.closeSettings();

    document.addEventListener('toggle-settings', this.toggleSettingsListener);
    document.addEventListener('close-settings', this.closeSettingsListener);
  }

  private removeKeyboardListeners(): void {
    if (this.toggleSettingsListener) {
      document.removeEventListener('toggle-settings', this.toggleSettingsListener);
    }
    if (this.closeSettingsListener) {
      document.removeEventListener('close-settings', this.closeSettingsListener);
    }
  }

  private toggleSettingsListener: any;
  private closeSettingsListener: any;

  // Update Time and Date
  updateTime() {
    const now = new Date();
    let hrs = now.getHours();
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    
    let ampm = '';
    if (!this.settings.militaryTime()) {
      ampm = hrs >= 12 ? ' PM' : ' AM';
      hrs = hrs % 12;
      hrs = hrs ? hrs : 12; // 0 should be 12
    }
    
    const hrsStr = String(hrs).padStart(2, '0');
    const timeStr = this.settings.showSeconds() 
      ? `${hrsStr}:${mins}:${secs}${ampm}` 
      : `${hrsStr}:${mins}${ampm}`;
    
    this.currentTime.set(timeStr);

    // Format Date
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const lang = this.ts.currentLang() === 'pt' ? 'pt-PT' : 'en-US';
    this.currentDateStr.set(now.toLocaleDateString(lang, options));

    // Update browser tab title
    const appName = this.ts.t('BRAND');
    if (this.settings.mode() === 'clock') {
      this.titleService.setTitle(`[${hrsStr}:${mins}] ${appName}`);
    } else {
      const pomoTime = this.pomodoroService.currentTime();
      const phaseSymbol = this.pomodoroService.currentPhase() === 'work' ? 'Focus' : 'Rest';
      this.titleService.setTitle(`[${pomoTime}] ${phaseSymbol} | ${appName}`);
    }
  }

  // Listen to Mouse Move to show Settings HUD
  @HostListener('document:mousemove')
  onMouseMove() {
    this.triggerHudVisibility();
  }

  triggerHudVisibility() {
    this.hudVisible.set(true);
    if (this.hudTimeout) {
      clearTimeout(this.hudTimeout);
    }

    // Only hide HUD if the settings panel is NOT open
    if (!this.settingsOpen()) {
      this.hudTimeout = setTimeout(() => {
        this.hudVisible.set(false);
      }, 3500); // Hide after 3.5 seconds of absolute stillness
    }
  }

  toggleSettings() {
    this.settingsOpen.update(v => !v);
    this.triggerHudVisibility();
  }

  closeSettings() {
    this.settingsOpen.set(false);
    this.triggerHudVisibility();
  }

  // Language update
  changeLang(lang: string) {
    this.ts.setLanguage(lang);
  }

  // Pomodoro Operations
  togglePomodoro() {
    this.pomodoroService.toggle();
  }

  resetPomodoro() {
    this.pomodoroService.reset();
  }

  // Stopwatch Operations
  toggleStopwatch() {
    this.stopwatchService.toggle();
  }

  resetStopwatch() {
    this.stopwatchService.reset();
  }

  recordLap() {
    this.stopwatchService.recordLap();
  }

  // Timer Operations
  startTimer(minutes: number) {
    this.timerService.start(minutes);
  }

  toggleTimer() {
    this.timerService.toggle();
  }

  resetTimer() {
    this.timerService.reset();
  }

  // Alarm Operations
  toggleAlarm(id: string) {
    this.alarmService.toggleAlarm(id);
  }
}
