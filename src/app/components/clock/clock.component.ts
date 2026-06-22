import { Component, OnInit, OnDestroy, HostListener, inject, signal, effect, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { SettingsService } from '../../services/settings.service';
import { TranslationService } from '../../services/translation.service';

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
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Time States
  currentTime = signal<string>('00:00:00');
  currentDateStr = signal<string>('');

  // Pomodoro States
  pomoMinutes = signal<number>(25);
  pomoSeconds = signal<number>(0);
  pomoRunning = signal<boolean>(false);
  pomoPhase = signal<'work' | 'break'>('work'); // 'work' | 'break'

  // HUD visibility control
  hudVisible = signal<boolean>(true);
  settingsOpen = signal<boolean>(false);
  private hudTimeout: any;

  // Audio Context (synthesizer)
  private audioCtx: AudioContext | null = null;
  private rainSource: AudioWorkletNode | ScriptProcessorNode | null = null;
  private rainGainNode: GainNode | null = null;

  // Running interval IDs
  private clockIntervalId: any;
  private audioTickTrigger = false;

  constructor() {
    // Watch settings changes to control background sounds
    effect(() => {
      const activeSound = this.settings.sound();
      if (this.isBrowser) {
        this.handleSoundChange(activeSound);
      }
    });

    // Reset Pomodoro when toggling mode
    effect(() => {
      const mode = this.settings.mode();
      if (mode === 'clock') {
        this.pomoRunning.set(false);
      } else {
        this.resetPomodoro();
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.updateTime();
    
    if (this.isBrowser) {
      // Start time update interval
      this.clockIntervalId = setInterval(() => {
        this.updateTime();
        this.tickPomodoro();
        this.playTickSoundIfNeeded();
      }, 1000);

      // Start mouse inactivity listener
      this.triggerHudVisibility();
    }
  }

  ngOnDestroy() {
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
    }
    if (this.hudTimeout) {
      clearTimeout(this.hudTimeout);
    }
    this.stopRainSynthesis();
  }

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
      const pmins = String(this.pomoMinutes()).padStart(2, '0');
      const psecs = String(this.pomoSeconds()).padStart(2, '0');
      const phaseSymbol = this.pomoPhase() === 'work' ? 'Focus' : 'Rest';
      this.titleService.setTitle(`[${pmins}:${psecs}] ${phaseSymbol} | ${appName}`);
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
    this.pomoRunning.update(v => !v);
    this.initAudioContext(); // Resume/Start AudioContext on user action
  }

  resetPomodoro() {
    this.pomoRunning.set(false);
    this.pomoPhase.set('work');
    this.pomoMinutes.set(25);
    this.pomoSeconds.set(0);
  }

  tickPomodoro() {
    if (this.settings.mode() !== 'pomodoro' || !this.pomoRunning()) return;

    let sec = this.pomoSeconds();
    let min = this.pomoMinutes();

    sec--;
    if (sec < 0) {
      sec = 59;
      min--;
    }

    if (min < 0) {
      // Phase Complete! Switch phase
      if (this.pomoPhase() === 'work') {
        this.pomoPhase.set('break');
        min = 5; // 5 min break
      } else {
        this.pomoPhase.set('work');
        min = 25; // 25 min focus
      }
      sec = 0;
      this.playChimeSound();
    }

    this.pomoSeconds.set(sec);
    this.pomoMinutes.set(min);
  }

  // Audio Synthesis Engine (Web Audio API)
  private initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  private playTickSoundIfNeeded() {
    if (this.settings.sound() !== 'tick') return;
    this.initAudioContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      // High-end Mechanical Watch Ticking Simulation
      // Double ticks: strong tick, then light tick 500ms later (classic watch escapement wheel click)
      this.synthesizeWatchClick(now, 0.04, 6000, 0.05);
      
      // Secondary minor tick (re-engage anchor)
      setTimeout(() => {
        if (this.settings.sound() === 'tick' && this.audioCtx) {
          this.synthesizeWatchClick(this.audioCtx.currentTime, 0.015, 5000, 0.02);
        }
      }, 350);
    } catch (e) {
      console.warn('Web Audio tick sound failed to play', e);
    }
  }

  private synthesizeWatchClick(time: number, duration: number, frequency: number, volume: number) {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, time);
    
    // Bandpass to make it sound like a metal gear click
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, time);
    filter.Q.setValueAtTime(10, time);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  private playChimeSound() {
    this.initAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    // Premium double harmonic glass chime
    this.synthesizeChimeTone(now, 523.25, 1.5, 0.15); // C5
    this.synthesizeChimeTone(now + 0.15, 659.25, 2.0, 0.12); // E5
    this.synthesizeChimeTone(now + 0.3, 783.99, 2.5, 0.10); // G5
  }

  private synthesizeChimeTone(time: number, freq: number, duration: number, volume: number) {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const oscHarmonic = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(freq * 2, time); // 1st harmonic

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    oscHarmonic.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(time);
    oscHarmonic.start(time);
    osc.stop(time + duration);
    oscHarmonic.stop(time + duration);
  }

  private handleSoundChange(soundType: string) {
    if (soundType === 'rain') {
      this.startRainSynthesis();
    } else {
      this.stopRainSynthesis();
    }
  }

  // Synthesize calming office rain using brown noise
  private startRainSynthesis() {
    this.initAudioContext();
    if (!this.audioCtx) return;

    // Avoid double instantiation
    if (this.rainSource) return;

    try {
      const bufferSize = 2 * this.audioCtx.sampleRate;
      const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      
      // Generate Pink/Brown Noise (smoother than White noise)
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brown noise filter: filter out high frequencies
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // Compensate for loss of volume
      }

      // Loop source
      const source = this.audioCtx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      // Lowpass filter for muffled rain tone
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, this.audioCtx.currentTime); // Rain low pitch

      // Subtle dynamic lowpass sweep (LFO-like) to simulate wind/gushes of rain
      this.createRainLfo(filter);

      this.rainGainNode = this.audioCtx.createGain();
      this.rainGainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      // Smooth fade-in to avoid pops
      this.rainGainNode.gain.linearRampToValueAtTime(0.12, this.audioCtx.currentTime + 2.0);

      source.connect(filter);
      filter.connect(this.rainGainNode);
      this.rainGainNode.connect(this.audioCtx.destination);

      source.start(0);
      this.rainSource = source as any; // Cast for saving
    } catch (e) {
      console.warn('Could not synthesize rain noise', e);
    }
  }

  private createRainLfo(filter: BiquadFilterNode) {
    if (!this.audioCtx) return;
    try {
      const lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();

      lfo.frequency.setValueAtTime(0.08, this.audioCtx.currentTime); // Slow oscillation (8s cycle)
      lfoGain.gain.setValueAtTime(150, this.audioCtx.currentTime); // Sweep filter between 300Hz and 600Hz

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(0);
    } catch (e) {
      // Swallowed
    }
  }

  private stopRainSynthesis() {
    if (this.rainSource) {
      try {
        if (this.rainGainNode && this.audioCtx) {
          const now = this.audioCtx.currentTime;
          // Smooth fade-out
          this.rainGainNode.gain.setValueAtTime(this.rainGainNode.gain.value, now);
          this.rainGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
          
          const sourceToStop = this.rainSource;
          setTimeout(() => {
            try {
              (sourceToStop as any).stop();
            } catch (e) {}
          }, 1100);
        } else {
          (this.rainSource as any).stop();
        }
      } catch (e) {}
      this.rainSource = null;
      this.rainGainNode = null;
    }
  }
}
