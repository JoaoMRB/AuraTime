import { TestBed } from '@angular/core/testing';
import { WorldClockService } from './world-clock.service';

describe('WorldClockService', () => {
  let service: WorldClockService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WorldClockService]
    });

    service = TestBed.inject(WorldClockService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have default clocks', () => {
    const clocks = service.allClocks();
    expect(clocks.length).toBeGreaterThan(0);
  });

  it('should have New York clock', () => {
    const clocks = service.allClocks();
    expect(clocks.some(c => c.label === 'New York')).toBeTruthy();
  });

  it('should get time for timezone', () => {
    const time = service.getTime('America/New_York');
    expect(time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('should get date for timezone', () => {
    const date = service.getDate('America/New_York');
    expect(date).toBeTruthy();
  });

  it('should add a new clock', () => {
    const initialCount = service.allClocks().length;
    
    service.addClock({
      label: 'Sydney',
      timezone: 'Australia/Sydney',
      offset: 10
    });
    
    const clocks = service.allClocks();
    expect(clocks.length).toBe(initialCount + 1);
    expect(clocks.some(c => c.label === 'Sydney')).toBeTruthy();
  });

  it('should remove a clock', () => {
    const clocks = service.allClocks();
    const initialCount = clocks.length;
    const clockToRemove = clocks[0];
    
    service.removeClock(clockToRemove.id);
    
    const updatedClocks = service.allClocks();
    expect(updatedClocks.length).toBe(initialCount - 1);
    expect(updatedClocks.some(c => c.id === clockToRemove.id)).toBeFalsy();
  });

  it('should handle invalid timezone gracefully', () => {
    const time = service.getTime('Invalid/Timezone');
    expect(time).toBe('--:--');
  });

  it('should update an existing clock', () => {
    const clocks = service.allClocks();
    const clockToUpdate = clocks[0];
    const newLabel = 'Updated Clock';
    
    // Assuming there's an update method or we need to remove and re-add
    service.removeClock(clockToUpdate.id);
    service.addClock({
      label: newLabel,
      timezone: clockToUpdate.timezone,
      offset: clockToUpdate.offset
    });
    
    const updatedClocks = service.allClocks();
    expect(updatedClocks.some(c => c.label === newLabel)).toBeTruthy();
  });
});
