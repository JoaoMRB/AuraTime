import { Component, OnInit, OnDestroy, HostListener, inject, signal, effect, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { SoundscapeService } from '../../services/soundscape.service';
import { TaskService } from '../../services/task.service';
import { NotesService } from '../../services/notes.service';
import { AnalyticsService } from '../../services/analytics.service';
import { WeatherService } from '../../services/weather.service';
import { DashboardService } from '../../services/dashboard.service';
import { PipService } from '../../services/pip.service';
import { TickService } from '../../services/screen/tick.service';
import { formatClock } from '../../services/screen/clock-format';
import { isThemeId, resolveThemeId } from '../../services/screen/theme-tokens';
import { DeskDisplayStatusService } from '../../services/screen/desk-display-status.service';
import { isExtensionPage } from '../../extension-context';

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './clock.component.html',
  host: {
    class: 'block w-full h-screen overflow-hidden'
  }
})
export class ClockComponent implements OnInit, OnDestroy {
  public settings = inject(SettingsService);
  public ts = inject(TranslationService);
  private titleService = inject(Title);
  private audioService = inject(AudioService);
  public pomodoroService = inject(PomodoroService);
  public worldClockService = inject(WorldClockService);
  public stopwatchService = inject(StopwatchService);
  public timerService = inject(TimerService);
  public alarmService = inject(AlarmService);
  private keyboardService = inject(KeyboardShortcutsService);
  public soundscape = inject(SoundscapeService);
  public taskService = inject(TaskService);
  public notesService = inject(NotesService);
  public analyticsService = inject(AnalyticsService);
  public weatherService = inject(WeatherService);
  public dashboardService = inject(DashboardService);
  public pipService = inject(PipService);
  /** Whether the Desk Display (USB screen) page has a display connected, in another window. */
  public deskStatus = inject(DeskDisplayStatusService);
  /** Running as the browser's new tab page (extension): shows a Desk Display shortcut in the HUD. */
  public isExtension = isExtensionPage;
  private tickService = inject(TickService);
  private platformId = inject(PLATFORM_ID);
  private route = inject(ActivatedRoute);
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
  soundscapeOpen = signal<boolean>(false);
  tasksOpen = signal<boolean>(false);
  notesOpen = signal<boolean>(false);
  analyticsOpen = signal<boolean>(false);
  linksOpen = signal<boolean>(false);
  zenMode = signal<boolean>(false);

  // Form Inputs
  newTaskInput = signal<string>('');
  newLinkTitle = signal<string>('');
  newLinkUrl = signal<string>('');
  showAddLinkForm = signal<boolean>(false);

  private hudTimeout: any;

  private unsubscribeTick?: () => void;

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
    const themeFromQuery = this.route.snapshot.queryParamMap.get('theme');
    if (themeFromQuery) {
      // Only apply known ids (or the legacy 'frosted-glass' alias)
      if (isThemeId(themeFromQuery) || themeFromQuery === 'frosted-glass') {
        this.settings.theme.set(resolveThemeId(themeFromQuery));
      }
    }

    this.updateTime();
    
    if (this.isBrowser) {
      // Ensure viewport resets to top and doesn't scroll inside the clock app
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';

      // Subscribe to the shared per-second tick
      this.unsubscribeTick = this.tickService.onTick(() => {
        this.updateTime();
        if (this.settings.sound() === 'tick') {
          this.audioService.playTickSound();
        }
      });

      // Start mouse inactivity listener
      this.triggerHudVisibility();

      // Setup keyboard shortcut listeners
      this.setupKeyboardListeners();
    }
  }

  ngOnDestroy() {
    if (this.isBrowser) {
      document.body.style.overflow = '';
    }
    this.unsubscribeTick?.();
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
    const { hours: hrsStr, minutes: mins, text: timeStr } = formatClock(now, {
      use24h: this.settings.militaryTime(),
      showSeconds: this.settings.showSeconds()
    });

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

  isAnyPanelOpen(): boolean {
    return this.settingsOpen() || this.soundscapeOpen() || this.tasksOpen() || this.notesOpen() || this.analyticsOpen() || this.linksOpen() || this.alarmDialogOpen();
  }

  triggerHudVisibility() {
    this.hudVisible.set(true);
    if (this.hudTimeout) {
      clearTimeout(this.hudTimeout);
    }

    // Only hide HUD if no panel is open and not in Zen Mode
    if (!this.isAnyPanelOpen()) {
      this.hudTimeout = setTimeout(() => {
        this.hudVisible.set(false);
      }, 3500);
    }
  }

  closeAllPanels() {
    this.settingsOpen.set(false);
    this.soundscapeOpen.set(false);
    this.tasksOpen.set(false);
    this.notesOpen.set(false);
    this.analyticsOpen.set(false);
    this.linksOpen.set(false);
    this.showAddLinkForm.set(false);
    this.triggerHudVisibility();
  }

  toggleSettings() {
    const next = !this.settingsOpen();
    this.closeAllPanels();
    this.settingsOpen.set(next);
  }

  closeSettings() {
    this.settingsOpen.set(false);
    this.triggerHudVisibility();
  }

  toggleSoundscape() {
    const next = !this.soundscapeOpen();
    this.closeAllPanels();
    this.soundscapeOpen.set(next);
  }

  toggleTasks() {
    const next = !this.tasksOpen();
    this.closeAllPanels();
    this.tasksOpen.set(next);
  }

  toggleNotes() {
    const next = !this.notesOpen();
    this.closeAllPanels();
    this.notesOpen.set(next);
  }

  toggleAnalytics() {
    const next = !this.analyticsOpen();
    this.closeAllPanels();
    this.analyticsOpen.set(next);
  }

  toggleLinks() {
    const next = !this.linksOpen();
    this.closeAllPanels();
    this.linksOpen.set(next);
  }

  toggleZenMode() {
    this.zenMode.update(z => !z);
    if (this.zenMode()) {
      this.closeAllPanels();
      this.hudVisible.set(false);
    } else {
      this.triggerHudVisibility();
    }
  }

  togglePip() {
    this.pipService.togglePip(() => ({
      time: this.settings.mode() === 'pomodoro' ? this.pomodoroService.currentTime() : this.currentTime(),
      mode: this.settings.mode().toUpperCase(),
      subtext: this.taskService.getActiveTask()?.text || this.currentDateStr()
    }));
  }

  addNewTask() {
    const val = this.newTaskInput();
    if (val.trim()) {
      this.taskService.addTask(val);
      this.newTaskInput.set('');
    }
  }

  addNewLink() {
    const title = this.newLinkTitle();
    const url = this.newLinkUrl();
    if (title.trim() && url.trim()) {
      this.dashboardService.addLink(title, url);
      this.newLinkTitle.set('');
      this.newLinkUrl.set('');
      this.showAddLinkForm.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
      this.closeAllPanels();
      if (this.zenMode()) this.zenMode.set(false);
      return;
    }

    const k = event.key.toLowerCase();
    if (k === 'm') {
      this.toggleSoundscape();
    } else if (k === 't') {
      this.toggleTasks();
    } else if (k === 'n') {
      this.toggleNotes();
    } else if (k === 's') {
      this.toggleAnalytics();
    } else if (k === 'p') {
      this.togglePip();
    } else if (k === 'z') {
      this.toggleZenMode();
    }
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
