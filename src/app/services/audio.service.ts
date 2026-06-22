import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type SoundType = 'none' | 'tick' | 'rain';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private audioCtx: AudioContext | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGainNode: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainLfo: OscillatorNode | null = null;
  private rainLfoGain: GainNode | null = null;

  constructor() {}

  // Initialize Audio Context (must be called after user interaction)
  async initAudioContext(): Promise<void> {
    if (!this.isBrowser) return;
    
    if (!this.audioCtx) {
      const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  // Play luxury watch tick sound
  playTickSound(): void {
    if (!this.isBrowser) return;
    this.initAudioContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      // High-end Mechanical Watch Ticking Simulation
      // Double ticks: strong tick, then light tick 350ms later
      this.synthesizeWatchClick(now, 0.04, 6000, 0.05);
      
      // Secondary minor tick (re-engage anchor)
      setTimeout(() => {
        if (this.audioCtx) {
          this.synthesizeWatchClick(this.audioCtx.currentTime, 0.015, 5000, 0.02);
        }
      }, 350);
    } catch (e) {
      console.warn('Web Audio tick sound failed to play', e);
    }
  }

  // Play chime sound (for Pomodoro phase completion)
  playChimeSound(): void {
    if (!this.isBrowser) return;
    this.initAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    // Premium double harmonic glass chime
    this.synthesizeChimeTone(now, 523.25, 1.5, 0.15); // C5
    this.synthesizeChimeTone(now + 0.15, 659.25, 2.0, 0.12); // E5
    this.synthesizeChimeTone(now + 0.3, 783.99, 2.5, 0.10); // G5
  }

  // Start rain ambient sound
  async startRainSound(): Promise<void> {
    if (!this.isBrowser) return;
    await this.initAudioContext();
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
      filter.frequency.setValueAtTime(450, this.audioCtx.currentTime);

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
      this.rainSource = source;
      this.rainFilter = filter;
    } catch (e) {
      console.warn('Could not synthesize rain noise', e);
    }
  }

  // Stop rain ambient sound
  stopRainSound(): void {
    if (!this.rainSource) return;

    try {
      if (this.rainGainNode && this.audioCtx) {
        const now = this.audioCtx.currentTime;
        // Smooth fade-out
        this.rainGainNode.gain.setValueAtTime(this.rainGainNode.gain.value, now);
        this.rainGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
        
        const sourceToStop = this.rainSource;
        setTimeout(() => {
          try {
            sourceToStop.stop();
          } catch (e) {}
        }, 1100);
      } else {
        this.rainSource?.stop();
      }
    } catch (e) {}
    
    this.cleanupRainResources();
  }

  // Cleanup rain resources
  private cleanupRainResources(): void {
    try {
      this.rainLfo?.stop();
      this.rainSource?.stop();
    } catch (e) {}
    
    this.rainSource = null;
    this.rainGainNode = null;
    this.rainFilter = null;
    this.rainLfo = null;
    this.rainLfoGain = null;
  }

  // Handle sound type changes
  async handleSoundChange(soundType: SoundType): Promise<void> {
    if (soundType === 'rain') {
      await this.startRainSound();
    } else {
      this.stopRainSound();
    }
  }

  // Synthesize watch click sound
  private synthesizeWatchClick(time: number, duration: number, frequency: number, volume: number): void {
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

  // Synthesize chime tone
  private synthesizeChimeTone(time: number, freq: number, duration: number, volume: number): void {
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

  // Create LFO for rain sound variation
  private createRainLfo(filter: BiquadFilterNode): void {
    if (!this.audioCtx) return;
    try {
      const lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();

      lfo.frequency.setValueAtTime(0.08, this.audioCtx.currentTime); // Slow oscillation (8s cycle)
      lfoGain.gain.setValueAtTime(150, this.audioCtx.currentTime); // Sweep filter between 300Hz and 600Hz

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(0);
      
      this.rainLfo = lfo;
      this.rainLfoGain = lfoGain;
    } catch (e) {
      // Swallowed
    }
  }

  // Cleanup on destroy
  destroy(): void {
    this.stopRainSound();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
