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
import { AlarmService, Alarm } from '../../services/alarm.service';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './clock.component.html',
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
  activeAlarms = computed(() => this.alarmService.activeAlarms());
  nextAlarmTime = computed(() => this.alarmService.nextAlarmTime());
  isAlarmRinging = computed(() => this.alarmService.isAlarmRinging());

  // Alarm dialog state
  alarmDialogOpen = signal<boolean>(false);

  // New alarm form state
  newAlarm = signal({
    label: '',
    time: '08:00',
    days: [] as number[],
    sound: 'chime' as 'chime' | 'bell' | 'digital',
    snoozeMinutes: 10
  });

  // Edit alarm state
  editingAlarmId = signal<string | null>(null);
  editAlarm = signal<Partial<Alarm> | null>(null);

  // Day labels (index 0 = Sunday)
  getDayLabel(day: number): string {
    return this.ts.t(`ALARM.DAY_${day}`);
  }

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
    const mode = this.settings.mode();

    if (mode === 'clock') {
      this.titleService.setTitle(`[${hrsStr}:${mins}] ${appName}`);
    } else if (mode === 'pomodoro') {
      const pomoTime = this.pomodoroService.currentTime();
      const phaseSymbol = this.pomodoroService.currentPhase() === 'work'
        ? this.ts.t('POMODORO.WORK')
        : this.ts.t('POMODORO.BREAK');
      this.titleService.setTitle(`[${pomoTime}] ${phaseSymbol} | ${appName}`);
    } else if (mode === 'stopwatch') {
      this.titleService.setTitle(`[${this.stopwatchTime()}] ${this.ts.t('CLOCK.MODE_STOPWATCH')} | ${appName}`);
    } else if (mode === 'timer') {
      this.titleService.setTitle(`[${this.timerTime()}] ${this.ts.t('CLOCK.MODE_TIMER')} | ${appName}`);
    } else if (mode === 'worldclock') {
      this.titleService.setTitle(`[${hrsStr}:${mins}] ${this.ts.t('CLOCK.MODE_WORLDCLOCK')} | ${appName}`);
    } else if (mode === 'alarm') {
      const next = this.nextAlarmTime();
      const alarmLabel = this.ts.t('CLOCK.MODE_ALARM');
      this.titleService.setTitle(next ? `[${next}] ${alarmLabel} | ${appName}` : `${alarmLabel} | ${appName}`);
    } else {
      this.titleService.setTitle(appName);
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

  // ── Alarm Dialog ──────────────────────────────────────────
  openAlarmDialog() {
    this.alarmDialogOpen.set(true);
  }

  closeAlarmDialog() {
    this.alarmDialogOpen.set(false);
    this.editingAlarmId.set(null);
    this.editAlarm.set(null);
  }

  // Add new alarm from form
  addAlarm(): void {
    const alarm = this.newAlarm();
    if (!alarm.label.trim()) return;
    if (!alarm.time) return;

    this.alarmService.addAlarm({
      label: alarm.label.trim(),
      time: alarm.time,
      days: alarm.days.length > 0 ? alarm.days : [new Date().getDay()],
      enabled: true,
      snoozeMinutes: alarm.snoozeMinutes,
      sound: alarm.sound
    });

    this.newAlarm.set({ label: '', time: '08:00', days: [], sound: 'chime', snoozeMinutes: 10 });
  }

  // Delete alarm
  deleteAlarm(id: string): void {
    this.alarmService.deleteAlarm(id);
    if (this.editingAlarmId() === id) {
      this.editingAlarmId.set(null);
      this.editAlarm.set(null);
    }
  }

  // Start editing alarm
  startEditAlarm(alarm: Alarm): void {
    this.editingAlarmId.set(alarm.id);
    this.editAlarm.set({ label: alarm.label, time: alarm.time, days: [...alarm.days], sound: alarm.sound, snoozeMinutes: alarm.snoozeMinutes });
  }

  // Save edited alarm
  saveEditAlarm(id: string): void {
    const edited = this.editAlarm();
    if (!edited || !edited.label?.trim()) return;
    this.alarmService.updateAlarm(id, {
      label: edited.label.trim(),
      time: edited.time || '08:00',
      days: edited.days || [],
      sound: edited.sound as 'chime' | 'bell' | 'digital',
      snoozeMinutes: edited.snoozeMinutes || 10
    });
    this.editingAlarmId.set(null);
    this.editAlarm.set(null);
  }

  // Cancel edit
  cancelEditAlarm(): void {
    this.editingAlarmId.set(null);
    this.editAlarm.set(null);
  }

  // Toggle day on new alarm form
  toggleDay(day: number): void {
    const alarm = this.newAlarm();
    const days = [...alarm.days];
    const idx = days.indexOf(day);
    if (idx > -1) days.splice(idx, 1); else days.push(day);
    this.newAlarm.set({ ...alarm, days });
  }

  // Toggle day on edit form
  toggleEditDay(day: number): void {
    const edited = this.editAlarm();
    if (!edited) return;
    const days = edited.days ? [...edited.days] : [];
    const idx = days.indexOf(day);
    if (idx > -1) days.splice(idx, 1); else days.push(day);
    this.editAlarm.set({ ...edited, days });
  }

  // Day selected check
  isDaySelected(day: number, days: number[] | undefined): boolean {
    return days ? days.includes(day) : false;
  }

  // Get days as readable string
  getDaysString(days: number[]): string {
    if (days.length === 0) return this.ts.t('ALARM.ONCE');
    if (days.length === 7) return this.ts.t('ALARM.DAILY');
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return this.ts.t('ALARM.WEEKDAYS');
    if (days.length === 2 && days.includes(0) && days.includes(6)) return this.ts.t('ALARM.WEEKENDS');
    return days.map(d => this.getDayLabel(d)).join(', ');
  }

  getAlarmSoundLabel(sound: string): string {
    switch (sound) {
      case 'bell':
        return this.ts.t('ALARM.SOUND_BELL');
      case 'digital':
        return this.ts.t('ALARM.SOUND_DIGITAL');
      default:
        return this.ts.t('ALARM.SOUND_CHIME');
    }
  }

  getWorldClockDiffLabel(timezone: string): string {
    const diffHours = this.worldClockService.getTimeDifference(timezone);
    if (diffHours === 0) return this.ts.t('WORLD_CLOCK.SAME_TIME');
    if (diffHours > 0) return `+${diffHours}h`;
    return `${diffHours}h`;
  }

  // Snooze ringing alarm
  snoozeAlarm(): void {
    this.alarmService.snooze();
  }

  // Stop ringing alarm
  stopAlarmRinging(): void {
    this.alarmService.stopRinging();
  }
}
