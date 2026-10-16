import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { readStorage, writeStorage } from './safe-storage';

@Injectable({
  providedIn: 'root'
})
export class NotesService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  noteContent = signal<string>('');
  lastSaved = signal<string>('');

  constructor() {
    if (this.isBrowser) {
      this.loadNote();

      // The "saved at" label is a signal written from this effect. Before, the write was rejected by Angular and
      // the try/catch around it hid the error, so the label never showed.
      effect(() => {
        const text = this.noteContent();
        if (writeStorage('auratime_scratchpad', text)) this.lastSaved.set(new Date().toLocaleTimeString());
      }, { allowSignalWrites: true });
    }
  }

  private loadNote() {
    const saved = readStorage('auratime_scratchpad');
    if (saved !== null) {
      this.noteContent.set(saved);
    } else {
      this.noteContent.set('✨ Quick thoughts & notes while focusing...\n\n- Meeting takeaways\n- Code snippets\n- Epiphanies');
    }
  }

  updateContent(text: string) {
    this.noteContent.set(text);
  }

  clear() {
    this.noteContent.set('');
  }
}
