import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

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

      effect(() => {
        const text = this.noteContent();
        try {
          localStorage.setItem('auratime_scratchpad', text);
          this.lastSaved.set(new Date().toLocaleTimeString());
        } catch (e) {}
      });
    }
  }

  private loadNote() {
    try {
      const saved = localStorage.getItem('auratime_scratchpad');
      if (saved !== null) {
        this.noteContent.set(saved);
      } else {
        this.noteContent.set('✨ Quick thoughts & notes while focusing...\n\n- Meeting takeaways\n- Code snippets\n- Epiphanies');
      }
    } catch (e) {}
  }

  updateContent(text: string) {
    this.noteContent.set(text);
  }

  clear() {
    this.noteContent.set('');
  }
}
