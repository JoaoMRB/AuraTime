import { Injectable, inject, PLATFORM_ID, DestroyRef, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SettingsService } from './settings.service';
import { PomodoroService } from './pomodoro.service';
import { AudioService } from './audio.service';

export interface Shortcut {
  key: string;
  description: string;
  action: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private settingsService = inject(SettingsService);
  private pomodoroService = inject(PomodoroService);
  private audioService = inject(AudioService);
  private destroyRef = inject(DestroyRef);

  private shortcuts: Shortcut[] = [];
  private enabled = signal<boolean>(true);

  constructor() {
    if (this.isBrowser) {
      this.setupShortcuts();
    }
  }

  private setupShortcuts(): void {
    this.shortcuts = [
      {
        key: 'Space',
        description: 'Toggle Pomodoro/Timer',
        action: () => this.handleSpaceKey()
      },
      {
        key: 'r',
        description: 'Reset Timer',
        action: () => this.handleResetKey()
      },
      {
        key: 's',
        description: 'Toggle Settings',
        action: () => this.handleSettingsKey()
      },
      {
        key: 'f',
        description: 'Toggle Fullscreen',
        action: () => this.handleFullscreenKey()
      },
      {
        key: 'm',
        description: 'Cycle Modes',
        action: () => this.handleModeKey()
      },
      {
        key: 't',
        description: 'Toggle Theme',
        action: () => this.handleThemeKey()
      },
      {
        key: '+',
        description: 'Increase Scale',
        action: () => this.handleScaleUp()
      },
      {
        key: '-',
        description: 'Decrease Scale',
        action: () => this.handleScaleDown()
      },
      {
        key: 'Escape',
        description: 'Close Settings/Exit Fullscreen',
        action: () => this.handleEscapeKey()
      }
    ];

    this.setupKeyboardListener();
  }

  private setupKeyboardListener(): void {
    const handler = (event: KeyboardEvent) => {
      if (!this.enabled()) return;

      // Ignore if user is typing in an input
      if (event.target instanceof HTMLInputElement || 
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement) {
        return;
      }

      const key = event.key.toLowerCase();
      const shortcut = this.shortcuts.find(s => s.key.toLowerCase() === key);

      if (shortcut) {
        event.preventDefault();
        shortcut.action();
      }
    };

    document.addEventListener('keydown', handler);

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('keydown', handler);
    });
  }

  private handleSpaceKey(): void {
    const mode = this.settingsService.mode();
    if (mode === 'pomodoro') {
      this.pomodoroService.toggle();
    }
  }

  private handleResetKey(): void {
    const mode = this.settingsService.mode();
    if (mode === 'pomodoro') {
      this.pomodoroService.reset();
    }
  }

  private handleSettingsKey(): void {
    // This would need to be handled in the component
    // For now, we'll dispatch a custom event
    document.dispatchEvent(new CustomEvent('toggle-settings'));
  }

  private handleFullscreenKey(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  private handleModeKey(): void {
    const modes = ['clock', 'pomodoro', 'worldclock', 'stopwatch', 'timer', 'alarm'];
    const currentMode = this.settingsService.mode();
    const currentIndex = modes.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.settingsService.mode.set(modes[nextIndex]);
  }

  private handleThemeKey(): void {
    const themes = ['emerald-gold', 'liquid-glass', 'obsidian-platinum', 'dark-glass', 'light-glass'];
    const currentTheme = this.settingsService.theme();
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.settingsService.theme.set(themes[nextIndex]);
  }

  private handleScaleUp(): void {
    const currentScale = this.settingsService.scale();
    const newScale = Math.min(2.0, currentScale + 0.1);
    this.settingsService.scale.set(newScale);
  }

  private handleScaleDown(): void {
    const currentScale = this.settingsService.scale();
    const newScale = Math.max(0.5, currentScale - 0.1);
    this.settingsService.scale.set(newScale);
  }

  private handleEscapeKey(): void {
    // Close settings
    document.dispatchEvent(new CustomEvent('close-settings'));
    
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  // Enable/disable shortcuts
  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
  }

  // Get all shortcuts for help display
  getAllShortcuts(): Shortcut[] {
    return this.shortcuts;
  }

  // Get shortcuts for a specific mode
  getShortcutsForMode(mode: string): Shortcut[] {
    switch (mode) {
      case 'pomodoro':
        return this.shortcuts.filter(s => 
          ['Space', 'r'].includes(s.key)
        );
      default:
        return this.shortcuts.filter(s => 
          ['s', 'f', 'm', 't', '+', '-', 'Escape'].includes(s.key)
        );
    }
  }
}
