import { formatClock } from './clock-format';

describe('formatClock', () => {
  const at = (h: number, m: number, s: number) => new Date(2026, 0, 15, h, m, s);

  it('formats 24h with seconds', () => {
    const r = formatClock(at(21, 5, 33), { use24h: true, showSeconds: true });
    expect(r.text).toBe('21:05:33');
    expect(r.ampm).toBe('');
  });

  it('formats 24h without seconds', () => {
    expect(formatClock(at(7, 3, 59), { use24h: true, showSeconds: false }).text).toBe('07:03');
  });

  it('formats 12h PM with seconds', () => {
    const r = formatClock(at(21, 5, 33), { use24h: false, showSeconds: true });
    expect(r.text).toBe('09:05:33 PM');
    expect(r.hours).toBe('09');
  });

  it('maps midnight to 12 AM and noon to 12 PM', () => {
    expect(formatClock(at(0, 0, 0), { use24h: false, showSeconds: false }).text).toBe('12:00 AM');
    expect(formatClock(at(12, 0, 0), { use24h: false, showSeconds: false }).text).toBe('12:00 PM');
  });
});
