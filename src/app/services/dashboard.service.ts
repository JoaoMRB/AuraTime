import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  icon: string;
}

export interface DailyQuote {
  text: string;
  author: string;
}

export interface CountdownTarget {
  title: string;
  targetDateTime: string; // ISO format or HH:MM
  active: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Quotes list
  private quotes: DailyQuote[] = [
    { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
    { text: "You have power over your mind - not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "Focus is a muscle. The more you protect it, the sharper it becomes.", author: "Anonymous" },
    { text: "Do not wait; the time will never be 'just right'.", author: "Napoleon Hill" },
    { text: "Deep work is the superpower of the 21st century.", author: "Cal Newport" },
    { text: "Waste no more time arguing what a good person should be. Be one.", author: "Marcus Aurelius" },
    { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca" }
  ];

  currentQuote = signal<DailyQuote>(this.quotes[0]);

  // Bookmarks / Quick Links
  links = signal<QuickLink[]>([
    { id: '1', title: 'GitHub', url: 'https://github.com', icon: '🐙' },
    { id: '2', title: 'Notion', url: 'https://notion.so', icon: '📝' },
    { id: '3', title: 'ChatGPT', url: 'https://chatgpt.com', icon: '🤖' },
    { id: '4', title: 'YouTube', url: 'https://youtube.com', icon: '▶️' },
    { id: '5', title: 'Gmail', url: 'https://mail.google.com', icon: '✉️' }
  ]);

  // Event countdown
  countdown = signal<CountdownTarget>({
    title: 'Daily Standup',
    targetDateTime: '10:00',
    active: false
  });

  constructor() {
    if (this.isBrowser) {
      this.loadDashboardData();
      this.pickDailyQuote();

      effect(() => {
        const state = {
          links: this.links(),
          countdown: this.countdown()
        };
        try {
          localStorage.setItem('auratime_dashboard', JSON.stringify(state));
        } catch (e) {}
      });
    }
  }

  private loadDashboardData() {
    this.applyRaw(localStorage.getItem('auratime_dashboard'));

    // Keep several open tabs/windows (app + /screen) in sync
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === 'auratime_dashboard' && event.newValue) {
        this.applyRaw(event.newValue);
      }
    });
  }

  private applyRaw(data: string | null) {
    try {
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed.links)) this.links.set(parsed.links);
        if (parsed.countdown) this.countdown.set(parsed.countdown);
      }
    } catch (e) {}
  }

  private pickDailyQuote() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const index = dayOfYear % this.quotes.length;
    this.currentQuote.set(this.quotes[index]);
  }

  nextQuote() {
    const current = this.currentQuote();
    const curIdx = this.quotes.findIndex(q => q.text === current.text);
    const nextIdx = (curIdx + 1) % this.quotes.length;
    this.currentQuote.set(this.quotes[nextIdx]);
  }

  addLink(title: string, url: string, icon = '🔗') {
    if (!title.trim() || !url.trim()) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    const newLink: QuickLink = {
      id: Date.now().toString(),
      title: title.trim(),
      url: finalUrl,
      icon
    };
    this.links.update(l => [...l, newLink]);
  }

  removeLink(id: string) {
    this.links.update(l => l.filter(item => item.id !== id));
  }

  setCountdown(title: string, targetDateTime: string, active: boolean) {
    this.countdown.set({ title, targetDateTime, active });
  }
}
