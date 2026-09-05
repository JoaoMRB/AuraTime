import { Injectable, signal, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface SoundTrack {
  id: string;
  name: string;
  icon: string;
  volume: number; // 0 to 100
  active: boolean;
}

export interface SoundPreset {
  id: string;
  name: string;
  icon: string;
  volumes: Record<string, number>;
}

@Injectable({
  providedIn: 'root'
})
export class SoundscapeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Track state
  masterVolume = signal<number>(80);
  isMuted = signal<boolean>(false);
  isPlaying = signal<boolean>(false);

  tracks = signal<SoundTrack[]>([
    { id: 'rain', name: 'SOUNDSCAPE.RAIN', icon: '🌧️', volume: 50, active: false },
    { id: 'thunder', name: 'SOUNDSCAPE.THUNDER', icon: '⛈️', volume: 40, active: false },
    { id: 'fire', name: 'SOUNDSCAPE.FIRE', icon: '🔥', volume: 45, active: false },
    { id: 'wind', name: 'SOUNDSCAPE.WIND', icon: '💨', volume: 30, active: false },
    { id: 'brown', name: 'SOUNDSCAPE.BROWN_NOISE', icon: '🌊', volume: 40, active: false },
    { id: 'pink', name: 'SOUNDSCAPE.PINK_NOISE', icon: '🌸', volume: 30, active: false },
    { id: 'binaural', name: 'SOUNDSCAPE.BINAURAL', icon: '🧘', volume: 45, active: false }
  ]);

  presets: SoundPreset[] = [
    {
      id: 'deep_work',
      name: 'SOUNDSCAPE.PRESET_DEEP_WORK',
      icon: '🧠',
      volumes: { brown: 60, rain: 25, wind: 0, fire: 0, thunder: 0, pink: 0, binaural: 0 }
    },
    {
      id: 'rainy_evening',
      name: 'SOUNDSCAPE.PRESET_RAINY_EVENING',
      icon: '☕',
      volumes: { rain: 65, thunder: 35, fire: 40, brown: 0, wind: 20, pink: 0, binaural: 0 }
    },
    {
      id: 'focus_binaural',
      name: 'SOUNDSCAPE.PRESET_FOCUS_BINAURAL',
      icon: '🧘',
      volumes: { binaural: 55, pink: 20, rain: 0, fire: 0, wind: 0, thunder: 0, brown: 0 }
    },
    {
      id: 'zen_breeze',
      name: 'SOUNDSCAPE.PRESET_ZEN_BREEZE',
      icon: '🍃',
      volumes: { wind: 50, pink: 30, rain: 15, fire: 0, thunder: 0, brown: 0, binaural: 0 }
    }
  ];

  // Active audio nodes
  private trackNodes: Map<string, { gain: GainNode; stop: () => void }> = new Map();

  constructor() {
    if (this.isBrowser) {
      this.loadSavedSettings();

      // Auto-save changes
      effect(() => {
        const state = {
          masterVolume: this.masterVolume(),
          isMuted: this.isMuted(),
          tracks: this.tracks().map(t => ({ id: t.id, volume: t.volume, active: t.active }))
        };
        try {
          localStorage.setItem('auratime_soundscape', JSON.stringify(state));
        } catch (e) {}
      });
    }
  }

  private loadSavedSettings() {
    try {
      const data = localStorage.getItem('auratime_soundscape');
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.masterVolume !== undefined) this.masterVolume.set(parsed.masterVolume);
        if (parsed.tracks && Array.isArray(parsed.tracks)) {
          this.tracks.update(current =>
            current.map(track => {
              const saved = parsed.tracks.find((s: any) => s.id === track.id);
              return saved ? { ...track, volume: saved.volume ?? track.volume, active: false } : track;
            })
          );
        }
      }
    } catch (e) {}
  }

  async initAudio(): Promise<void> {
    if (!this.isBrowser) return;

    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        this.masterGain = this.audioCtx.createGain();
        this.updateMasterGain();
        this.masterGain.connect(this.audioCtx.destination);
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  private updateMasterGain() {
    if (!this.masterGain || !this.audioCtx) return;
    const vol = this.isMuted() ? 0 : this.masterVolume() / 100;
    this.masterGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
  }

  setMasterVolume(vol: number) {
    this.masterVolume.set(Math.max(0, Math.min(100, vol)));
    this.updateMasterGain();
  }

  toggleMute() {
    this.isMuted.update(m => !m);
    this.updateMasterGain();
  }

  async toggleTrack(trackId: string) {
    await this.initAudio();
    this.tracks.update(list =>
      list.map(t => (t.id === trackId ? { ...t, active: !t.active } : t))
    );

    const track = this.tracks().find(t => t.id === trackId);
    if (track) {
      if (track.active) {
        this.startTrackAudio(track);
      } else {
        this.stopTrackAudio(trackId);
      }
    }

    this.checkIfPlaying();
  }

  setTrackVolume(trackId: string, volume: number) {
    this.tracks.update(list =>
      list.map(t => (t.id === trackId ? { ...t, volume } : t))
    );

    const node = this.trackNodes.get(trackId);
    if (node && this.audioCtx) {
      node.gain.gain.setValueAtTime(volume / 100, this.audioCtx.currentTime);
    }


  }

  async applyPreset(preset: SoundPreset) {
    await this.initAudio();
    this.tracks.update(list =>
      list.map(t => {
        const vol = preset.volumes[t.id] ?? 0;
        return {
          ...t,
          volume: vol > 0 ? vol : t.volume,
          active: vol > 0
        };
      })
    );

    // Sync all audio nodes
    for (const track of this.tracks()) {
      if (track.active) {
        this.startTrackAudio(track);
      } else {
        this.stopTrackAudio(track.id);
      }
    }

    this.checkIfPlaying();
  }

  stopAll() {
    for (const track of this.tracks()) {
      this.stopTrackAudio(track.id);
    }
    this.tracks.update(list => list.map(t => ({ ...t, active: false })));
    this.isPlaying.set(false);
  }

  private checkIfPlaying() {
    const anyActive = this.tracks().some(t => t.active);
    this.isPlaying.set(anyActive);
  }

  private startTrackAudio(track: SoundTrack) {
    if (!this.audioCtx || !this.masterGain) return;
    this.stopTrackAudio(track.id); // clear existing if any

    const trackGain = this.audioCtx.createGain();
    trackGain.gain.setValueAtTime(track.volume / 100, this.audioCtx.currentTime);
    trackGain.connect(this.masterGain);

    let stopFn = () => {};

    switch (track.id) {
      case 'rain':
        stopFn = this.createRainSynthesizer(trackGain);
        break;
      case 'thunder':
        stopFn = this.createThunderSynthesizer(trackGain);
        break;
      case 'fire':
        stopFn = this.createFireSynthesizer(trackGain);
        break;
      case 'wind':
        stopFn = this.createWindSynthesizer(trackGain);
        break;
      case 'brown':
        stopFn = this.createBrownNoise(trackGain);
        break;
      case 'pink':
        stopFn = this.createPinkNoise(trackGain);
        break;
      case 'binaural':
        stopFn = this.createBinauralFocusTones(trackGain);
        break;
    }

    this.trackNodes.set(track.id, { gain: trackGain, stop: stopFn });
  }

  private stopTrackAudio(trackId: string) {
    const node = this.trackNodes.get(trackId);
    if (node) {
      try {
        node.stop();
        node.gain.disconnect();
      } catch (e) {}
      this.trackNodes.delete(trackId);
    }
  }

  // --- Procedural Web Audio Synthesizers ---

  // 1. Rain Synthesizer
  private createRainSynthesizer(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};
    const sampleRate = this.audioCtx.sampleRate;
    const bufferSize = sampleRate * 2;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.03 * white) / 1.03;
      lastOut = data[i];
      data[i] *= 3.0;
    }

    const noiseSource = this.audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const lowpass = this.audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(550, this.audioCtx.currentTime);

    // Dynamic wind modulation
    const lfo = this.audioCtx.createOscillator();
    const lfoGain = this.audioCtx.createGain();
    lfo.frequency.setValueAtTime(0.1, this.audioCtx.currentTime);
    lfoGain.gain.setValueAtTime(160, this.audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start();

    noiseSource.connect(lowpass);
    lowpass.connect(targetGain);
    noiseSource.start();

    return () => {
      try {
        noiseSource.stop();
        lfo.stop();
        noiseSource.disconnect();
        lowpass.disconnect();
      } catch (e) {}
    };
  }

  // 2. Fireplace Crackle Synthesizer
  private createFireSynthesizer(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};
    const ctx = this.audioCtx;

    // Warm roar base (brown noise)
    const roarBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const roarData = roarBuffer.getChannelData(0);
    let lastRoar = 0;
    for (let i = 0; i < roarData.length; i++) {
      const white = Math.random() * 2 - 1;
      roarData[i] = (lastRoar + 0.05 * white) / 1.05;
      lastRoar = roarData[i];
      roarData[i] *= 1.8;
    }
    const roarSource = ctx.createBufferSource();
    roarSource.buffer = roarBuffer;
    roarSource.loop = true;

    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.setValueAtTime(280, ctx.currentTime);

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.4, ctx.currentTime);

    roarSource.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(targetGain);
    roarSource.start();

    // Crackle & pop pulses
    let crackleTimer: any;
    const scheduleCrackle = () => {
      if (!this.audioCtx || this.audioCtx.state === 'closed') return;
      const now = this.audioCtx.currentTime;
      const popDuration = 0.005 + Math.random() * 0.015;
      const popFreq = 1200 + Math.random() * 2500;

      const osc = this.audioCtx.createOscillator();
      const popGain = this.audioCtx.createGain();
      const popFilter = this.audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(popFreq, now);
      popFilter.type = 'highpass';
      popFilter.frequency.setValueAtTime(800, now);

      popGain.gain.setValueAtTime(0.15 + Math.random() * 0.25, now);
      popGain.gain.exponentialRampToValueAtTime(0.0001, now + popDuration);

      osc.connect(popFilter);
      popFilter.connect(popGain);
      popGain.connect(targetGain);

      osc.start(now);
      osc.stop(now + popDuration);

      const nextDelay = 80 + Math.random() * 450;
      crackleTimer = setTimeout(scheduleCrackle, nextDelay);
    };

    scheduleCrackle();

    return () => {
      try {
        clearTimeout(crackleTimer);
        roarSource.stop();
        roarSource.disconnect();
      } catch (e) {}
    };
  }

  // 3. Wind Synthesizer
  private createWindSynthesizer(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};
    const ctx = this.audioCtx;

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(320, ctx.currentTime);
    bandpass.Q.setValueAtTime(3.5, ctx.currentTime);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
    lfoGain.gain.setValueAtTime(200, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(bandpass.frequency);
    lfo.start();

    source.connect(bandpass);
    bandpass.connect(targetGain);
    source.start();

    return () => {
      try {
        source.stop();
        lfo.stop();
        source.disconnect();
      } catch (e) {}
    };
  }

  // 4. Thunder Synthesizer (sporadic deep rumble)
  private createThunderSynthesizer(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};

    let thunderTimer: any;
    const scheduleThunder = () => {
      if (!this.audioCtx || this.audioCtx.state === 'closed') return;
      const now = this.audioCtx.currentTime;
      const duration = 3.5 + Math.random() * 2.5;

      // Deep rumble noise burst
      const rumbleBuffer = this.audioCtx.createBuffer(1, Math.floor(this.audioCtx.sampleRate * duration), this.audioCtx.sampleRate);
      const data = rumbleBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        data[i] = (last + 0.08 * w) / 1.08;
        last = data[i];
      }

      const src = this.audioCtx.createBufferSource();
      src.buffer = rumbleBuffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, now);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(targetGain);

      src.start(now);
      src.stop(now + duration);

      const nextInterval = 12000 + Math.random() * 20000;
      thunderTimer = setTimeout(scheduleThunder, nextInterval);
    };

    // First rumble after 3 seconds
    thunderTimer = setTimeout(scheduleThunder, 3000);

    return () => {
      try {
        clearTimeout(thunderTimer);
      } catch (e) {}
    };
  }

  // 5. Brown Noise
  private createBrownNoise(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};
    const bufferSize = this.audioCtx.sampleRate * 2;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * white) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }

    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(targetGain);
    src.start();

    return () => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    };
  }

  // 6. Pink Noise
  private createPinkNoise(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};
    const bufferSize = this.audioCtx.sampleRate * 2;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(targetGain);
    src.start();

    return () => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    };
  }

  // 7. Binaural Focus Tones (100% procedural — zero copyright)
  // Creates a stereo binaural beat: left ear 200Hz, right ear 206Hz → 6Hz theta
  // beat for creativity & focus. Layered with soft harmonic café drones.
  private createBinauralFocusTones(targetGain: GainNode): () => void {
    if (!this.audioCtx) return () => {};
    const ctx = this.audioCtx;

    const baseFreq = 200; // Hz — carrier tone
    const beatFreq = 6;   // Hz — binaural beat frequency (theta: creativity/focus)

    // Left channel panner
    const panLeft = ctx.createStereoPanner();
    panLeft.pan.setValueAtTime(-1, ctx.currentTime);

    // Right channel panner
    const panRight = ctx.createStereoPanner();
    panRight.pan.setValueAtTime(1, ctx.currentTime);

    // Left oscillator: base carrier
    const oscLeft = ctx.createOscillator();
    oscLeft.type = 'sine';
    oscLeft.frequency.setValueAtTime(baseFreq, ctx.currentTime);

    // Right oscillator: carrier + beat offset → brain perceives 6Hz pulse
    const oscRight = ctx.createOscillator();
    oscRight.type = 'sine';
    oscRight.frequency.setValueAtTime(baseFreq + beatFreq, ctx.currentTime);

    // Soft gain per channel (low volume — this is subtle)
    const gainLeft = ctx.createGain();
    gainLeft.gain.setValueAtTime(0.18, ctx.currentTime);
    const gainRight = ctx.createGain();
    gainRight.gain.setValueAtTime(0.18, ctx.currentTime);

    oscLeft.connect(gainLeft);
    gainLeft.connect(panLeft);
    panLeft.connect(targetGain);

    oscRight.connect(gainRight);
    gainRight.connect(panRight);
    panRight.connect(targetGain);

    oscLeft.start();
    oscRight.start();

    // Harmonic café drone layer: warm 3rd harmonic overtone (300Hz + 400Hz)
    const harmonics = [300, 400, 600];
    const harmOscs: OscillatorNode[] = [];

    for (const freq of harmonics) {
      const h = ctx.createOscillator();
      h.type = 'sine';
      h.frequency.setValueAtTime(freq, ctx.currentTime);

      const hGain = ctx.createGain();
      hGain.gain.setValueAtTime(0.025, ctx.currentTime);

      // Gentle slow tremolo on harmonics for organic warmth
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.2 + Math.random() * 0.15, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.008, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(hGain.gain);
      lfo.start();

      h.connect(hGain);
      hGain.connect(targetGain);
      h.start();
      harmOscs.push(h);
    }

    return () => {
      try {
        oscLeft.stop();
        oscRight.stop();
        harmOscs.forEach(h => h.stop());
        gainLeft.disconnect();
        gainRight.disconnect();
      } catch (e) {}
    };
  }

  destroy() {
    this.stopAll();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
