import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { backupCorrupt, isRecord, parseJson, readStorage, writeStorage } from './safe-storage';
import { lostEntries, sanitizeTasks } from './storage-validators';

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
  pomodoros: number; // completed pomodoro sessions on this task
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  tasks = signal<TaskItem[]>([]);
  activeTaskId = signal<string | null>(null);

  constructor() {
    if (this.isBrowser) {
      this.loadTasks();

      effect(() => {
        const state = {
          tasks: this.tasks(),
          activeTaskId: this.activeTaskId()
        };
        writeStorage('auratime_tasks', JSON.stringify(state));
      });
    }
  }

  private loadTasks() {
    // Keep several open tabs/windows (app + /screen) in sync
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === 'auratime_tasks' && event.newValue) {
        this.applyRaw(event.newValue);
      }
    });

    const data = readStorage('auratime_tasks');
    if (!(data && this.applyRaw(data))) {
      // Starter sample tasks (nothing saved yet, or what was saved is unusable)
      this.tasks.set([
        { id: '1', text: 'Define top 3 goals for today', completed: false, pomodoros: 0, createdAt: Date.now() },
        { id: '2', text: 'Deep work focus block (50m)', completed: false, pomodoros: 0, createdAt: Date.now() }
      ]);
      this.activeTaskId.set('1');
    }
  }

  /** Applies saved tasks; entries that are not valid tasks are dropped. Returns false if there was nothing usable. */
  private applyRaw(data: string): boolean {
    const raw = parseJson(data);
    const parsed = sanitizeTasks(raw);
    if (lostEntries(isRecord(raw) ? raw['tasks'] : null, parsed?.tasks ?? null)) backupCorrupt('auratime_tasks', data);
    if (!parsed) return false;
    this.tasks.set(parsed.tasks);
    this.activeTaskId.set(parsed.activeTaskId);
    return true;
  }

  addTask(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newTask: TaskItem = {
      id: Date.now().toString(),
      text: trimmed,
      completed: false,
      pomodoros: 0,
      createdAt: Date.now()
    };

    this.tasks.update(tasks => [newTask, ...tasks]);
    if (!this.activeTaskId()) {
      this.activeTaskId.set(newTask.id);
    }
  }

  toggleTask(id: string): void {
    this.tasks.update(tasks =>
      tasks.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }

  deleteTask(id: string): void {
    this.tasks.update(tasks => tasks.filter(t => t.id !== id));
    if (this.activeTaskId() === id) {
      const remaining = this.tasks().filter(t => !t.completed);
      this.activeTaskId.set(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  setActiveTask(id: string): void {
    this.activeTaskId.set(this.activeTaskId() === id ? null : id);
  }

  getActiveTask(): TaskItem | undefined {
    const id = this.activeTaskId();
    return this.tasks().find(t => t.id === id);
  }

  incrementActiveTaskPomodoro(): void {
    const activeId = this.activeTaskId();
    if (!activeId) return;

    this.tasks.update(tasks =>
      tasks.map(t => (t.id === activeId ? { ...t, pomodoros: t.pomodoros + 1 } : t))
    );
  }

  clearCompleted(): void {
    this.tasks.update(tasks => tasks.filter(t => !t.completed));
  }
}
