import { TestBed } from '@angular/core/testing';
import {
  DESK_STATUS_KEY, DESK_STATUS_STALE_HIDDEN_MS, DESK_STATUS_STALE_MS, DeskDisplayStatusService
} from './desk-display-status.service';
import { TickService } from './tick.service';

/** Simulates the Desk Display window writing the status (the browser only fires `storage` in OTHER windows). */
function otherWindowWrites(value: unknown): void {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  localStorage.setItem(DESK_STATUS_KEY, raw);
  window.dispatchEvent(new StorageEvent('storage', { key: DESK_STATUS_KEY, newValue: raw, storageArea: localStorage }));
}

describe('DeskDisplayStatusService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const tickNow = () => (TestBed.inject(TickService) as unknown as { emit(): void }).emit();

  it('starts as not connected', () => {
    expect(TestBed.inject(DeskDisplayStatusService).connected()).toBeFalse();
  });

  it('shows connected while a fresh "connected" status exists', () => {
    localStorage.setItem(DESK_STATUS_KEY, JSON.stringify({ connected: true, at: Date.now() }));
    expect(TestBed.inject(DeskDisplayStatusService).connected()).toBeTrue();
  });

  it('follows the other window live', () => {
    const status = TestBed.inject(DeskDisplayStatusService);
    otherWindowWrites({ connected: true, at: Date.now() });
    expect(status.connected()).toBeTrue();
    otherWindowWrites({ connected: false, at: Date.now() });
    expect(status.connected()).toBeFalse();
  });

  it('goes back to not connected when the heartbeat stops (window closed, PC asleep)', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 0, 15, 12, 0, 0));
      const status = TestBed.inject(DeskDisplayStatusService);
      otherWindowWrites({ connected: true, at: Date.now() });
      tickNow();
      expect(status.connected()).toBeTrue();

      jasmine.clock().mockDate(new Date(Date.now() + DESK_STATUS_STALE_MS + 1000));
      tickNow();
      expect(status.connected()).toBeFalse();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  describe('a hidden Desk Display page (its timers are throttled by the browser)', () => {
    it('is not reported as gone just because its heartbeat is late', () => {
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(2026, 0, 15, 12, 0, 0));
        const status = TestBed.inject(DeskDisplayStatusService);
        otherWindowWrites({ connected: true, at: Date.now(), hidden: true });
        tickNow();
        expect(status.connected()).toBeTrue();

        // three missed throttled beats (about once a minute each) are fine
        jasmine.clock().mockDate(new Date(Date.now() + 120_000));
        tickNow();
        expect(status.connected()).toBeTrue();

        jasmine.clock().mockDate(new Date(Date.now() + DESK_STATUS_STALE_HIDDEN_MS));
        tickNow();
        expect(status.connected()).toBeFalse();
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('a visible page is still judged quickly (20 s), so a closed window is noticed', () => {
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(2026, 0, 15, 12, 0, 0));
        const status = TestBed.inject(DeskDisplayStatusService);
        otherWindowWrites({ connected: true, at: Date.now(), hidden: false });
        jasmine.clock().mockDate(new Date(Date.now() + DESK_STATUS_STALE_MS + 1000));
        tickNow();
        expect(status.connected()).toBeFalse();
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('stores whether the page was hidden when it reported', () => {
      const status = TestBed.inject(DeskDisplayStatusService);
      status.publish(true, true);
      expect(JSON.parse(localStorage.getItem(DESK_STATUS_KEY)!).hidden).toBeTrue();
      status.publish(true);
      expect(JSON.parse(localStorage.getItem(DESK_STATUS_KEY)!).hidden).toBeFalse();
    });

    it('still understands a status written before the hidden flag existed', () => {
      const status = TestBed.inject(DeskDisplayStatusService);
      otherWindowWrites({ connected: true, at: Date.now() });
      expect(status.connected()).toBeTrue();
    });
  });

  it('ignores garbage in storage', () => {
    const status = TestBed.inject(DeskDisplayStatusService);
    otherWindowWrites('{not json');
    expect(status.connected()).toBeFalse();
    otherWindowWrites({ connected: 'yes', at: 'now' });
    expect(status.connected()).toBeFalse();
  });

  it('publish() stores the status for the other windows and updates itself', () => {
    const status = TestBed.inject(DeskDisplayStatusService);
    status.publish(true);
    expect(JSON.parse(localStorage.getItem(DESK_STATUS_KEY)!).connected).toBeTrue();
    expect(status.connected()).toBeTrue();
    status.publish(false);
    expect(status.connected()).toBeFalse();
  });
});
