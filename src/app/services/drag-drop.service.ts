import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SettingsService } from './settings.service';

export interface Position {
  x: number;
  y: number;
}

@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private settingsService = inject(SettingsService);

  private isDragging = signal<boolean>(false);
  private currentPosition = signal<Position>({ x: 0, y: 0 });
  private dragOffset = signal<Position>({ x: 0, y: 0 });

  isDraggingActive = computed(() => this.isDragging());
  currentDragPosition = computed(() => this.currentPosition());

  constructor() {
    if (this.isBrowser) {
      this.loadCustomPosition();
    }
  }

  // Start dragging
  startDrag(event: MouseEvent, element: HTMLElement): void {
    if (!this.isBrowser) return;

    this.isDragging.set(true);
    
    const rect = element.getBoundingClientRect();
    this.dragOffset.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });

    // Get current custom position if exists
    const customPos = this.getCustomPosition();
    if (customPos) {
      this.currentPosition.set(customPos);
    } else {
      this.currentPosition.set({
        x: rect.left,
        y: rect.top
      });
    }

    // Add global event listeners
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  // Handle mouse move during drag
  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging()) return;

    const newX = event.clientX - this.dragOffset().x;
    const newY = event.clientY - this.dragOffset().y;

    // Constrain to viewport
    const maxX = window.innerWidth - 100;
    const maxY = window.innerHeight - 100;
    
    const constrainedX = Math.max(0, Math.min(newX, maxX));
    const constrainedY = Math.max(0, Math.min(newY, maxY));

    this.currentPosition.set({ x: constrainedX, y: constrainedY });
  };

  // Handle mouse up to end drag
  private handleMouseUp = (): void => {
    if (!this.isDragging()) return;

    this.isDragging.set(false);
    
    // Save the custom position
    this.saveCustomPosition(this.currentPosition());

    // Remove global event listeners
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  };

  // Reset to preset position
  resetToPreset(): void {
    this.settingsService.position.set('center');
    this.clearCustomPosition();
  }

  // Get custom position from localStorage
  private getCustomPosition(): Position | null {
    try {
      const data = localStorage.getItem('auratime_custom_position');
      if (data) {
        return JSON.parse(data) as Position;
      }
    } catch (e) {
      console.warn('Could not load custom position', e);
    }
    return null;
  }

  // Save custom position to localStorage
  private saveCustomPosition(position: Position): void {
    try {
      localStorage.setItem('auratime_custom_position', JSON.stringify(position));
      // Set position to custom to indicate we're using custom positioning
      this.settingsService.position.set('custom');
    } catch (e) {
      console.warn('Could not save custom position', e);
    }
  }

  // Load custom position on init
  private loadCustomPosition(): void {
    const customPos = this.getCustomPosition();
    if (customPos) {
      this.currentPosition.set(customPos);
      this.settingsService.position.set('custom');
    }
  }

  // Clear custom position
  private clearCustomPosition(): void {
    try {
      localStorage.removeItem('auratime_custom_position');
      this.currentPosition.set({ x: 0, y: 0 });
    } catch (e) {
      console.warn('Could not clear custom position', e);
    }
  }

  // Get position styles for the element
  getPositionStyles(): { left: string; top: string; position: string } {
    if (this.settingsService.position() === 'custom') {
      const pos = this.currentPosition();
      return {
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        position: 'absolute'
      };
    }
    
    // Return empty for preset positions (handled by flexbox)
    return {
      left: 'auto',
      top: 'auto',
      position: 'relative'
    };
  }

  // Check if using custom position
  isCustomPosition(): boolean {
    return this.settingsService.position() === 'custom';
  }
}
