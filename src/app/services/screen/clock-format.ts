export interface ClockFormatOptions {
  /** true = 24h clock; false = 12h clock with AM/PM suffix. */
  use24h: boolean;
  showSeconds: boolean;
}

export interface FormattedClock {
  hours: string;
  minutes: string;
  seconds: string;
  /** '' in 24h mode, ' AM' / ' PM' (leading space) in 12h mode. */
  ampm: string;
  /** Full display string, e.g. "09:05:33 PM" or "21:05". */
  text: string;
}

/** Pure time formatter shared by the clock UI and any other output (e.g. the USB screen). */
export function formatClock(date: Date, options: ClockFormatOptions): FormattedClock {
  let hrs = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  let ampm = '';
  if (!options.use24h) {
    ampm = hrs >= 12 ? ' PM' : ' AM';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12; // 0 should be 12
  }

  const hours = String(hrs).padStart(2, '0');
  const text = options.showSeconds
    ? `${hours}:${minutes}:${seconds}${ampm}`
    : `${hours}:${minutes}${ampm}`;

  return { hours, minutes, seconds, ampm, text };
}
