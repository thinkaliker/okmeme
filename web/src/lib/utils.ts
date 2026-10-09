import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1_000],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Coarse relative time. Intl instead of a dependency; one less thing to ship. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const delta = new Date(iso).getTime() - now;
  const magnitude = Math.abs(delta);
  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) return rtf.format(Math.round(delta / ms), unit);
  }
  return rtf.format(0, 'second');
}

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Score display. Absolute rank is never shown; a raw score is. */
export function formatScore(score: number): string {
  return new Intl.NumberFormat().format(score);
}
