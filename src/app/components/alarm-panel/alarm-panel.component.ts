import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlarmService, Alarm } from '../../services/alarm.service';
import { TranslationService } from '../../services/translation.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-alarm-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, NgFor, NgIf],
  templateUrl: './alarm-panel.component.html',
  styleUrl: './alarm-panel.component.css'
})
export class AlarmPanelComponent implements OnInit {
  private alarmService = inject(AlarmService);
  public ts = inject(TranslationService);
  public settings = inject(SettingsService);

  // Form state
  newAlarm = signal({
    label: '',
    time: '08:00',
    days: [] as number[],
    sound: 'chime' as 'chime' | 'bell' | 'digital',
    snoozeMinutes: 10
  });

  editingId = signal<string | null>(null);
  editAlarm = signal<Partial<Alarm> | null>(null);

  // Exposed from service
  alarms = computed(() => this.alarmService.allAlarms());
  activeAlarms = computed(() => this.alarmService.activeAlarms());
  nextAlarmTime = computed(() => this.alarmService.nextAlarmTime());
  isAlarmRinging = computed(() => this.alarmService.isAlarmRinging());

  // Days of week labels (will be translated)
  dayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  ngOnInit(): void {
    // Component initialization if needed
  }

  // Add new alarm
  addAlarm(): void {
    const alarm = this.newAlarm();
    
    if (!alarm.label.trim()) {
      alert('Please enter an alarm label');
      return;
    }

    if (!alarm.time) {
      alert('Please select an alarm time');
      return;
    }

    this.alarmService.addAlarm({
      label: alarm.label.trim(),
      time: alarm.time,
      days: alarm.days.length > 0 ? alarm.days : [new Date().getDay()], // If no days selected, set for today
      enabled: true,
      snoozeMinutes: alarm.snoozeMinutes,
      sound: alarm.sound
    });

    // Reset form
    this.newAlarm.set({
      label: '',
      time: '08:00',
      days: [],
      sound: 'chime',
      snoozeMinutes: 10
    });
  }

  // Toggle alarm enabled/disabled
  toggleAlarm(id: string): void {
    this.alarmService.toggleAlarm(id);
  }

  // Delete alarm
  deleteAlarm(id: string): void {
    if (confirm('Delete this alarm?')) {
      this.alarmService.deleteAlarm(id);
      this.editingId.set(null);
    }
  }

  // Start editing alarm
  startEdit(alarm: Alarm): void {
    this.editingId.set(alarm.id);
    this.editAlarm.set({
      label: alarm.label,
      time: alarm.time,
      days: [...alarm.days],
      sound: alarm.sound,
      snoozeMinutes: alarm.snoozeMinutes
    });
  }

  // Save edited alarm
  saveEdit(id: string): void {
    const edited = this.editAlarm();
    if (!edited) return;

    if (!edited.label?.trim()) {
      alert('Please enter an alarm label');
      return;
    }

    this.alarmService.updateAlarm(id, {
      label: edited.label.trim(),
      time: edited.time || '08:00',
      days: edited.days || [],
      sound: edited.sound as 'chime' | 'bell' | 'digital',
      snoozeMinutes: edited.snoozeMinutes || 10
    });

    this.editingId.set(null);
    this.editAlarm.set(null);
  }

  // Cancel edit
  cancelEdit(): void {
    this.editingId.set(null);
    this.editAlarm.set(null);
  }

  // Toggle day selection
  toggleDay(day: number): void {
    const alarm = this.newAlarm();
    const days = [...alarm.days];
    const index = days.indexOf(day);
    
    if (index > -1) {
      days.splice(index, 1);
    } else {
      days.push(day);
    }

    this.newAlarm.set({ ...alarm, days });
  }

  // Toggle day selection in edit
  toggleEditDay(day: number): void {
    const edited = this.editAlarm();
    if (!edited) return;

    const days = edited.days ? [...edited.days] : [];
    const index = days.indexOf(day);
    
    if (index > -1) {
      days.splice(index, 1);
    } else {
      days.push(day);
    }

    this.editAlarm.set({ ...edited, days });
  }

  // Check if day is selected
  isDaySelected(day: number, days: number[] | undefined): boolean {
    return days ? days.includes(day) : false;
  }

  // Snooze current ringing alarm
  snoozeAlarm(): void {
    this.alarmService.snooze();
  }

  // Stop ringing alarm
  stopAlarmRinging(): void {
    this.alarmService.stopRinging();
  }

  // Get days as readable string
  getDaysString(days: number[]): string {
    if (days.length === 0) return 'Once';
    if (days.length === 7) return 'Daily';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    
    return days.map(d => this.dayLabels[d]).join(', ');
  }
}
