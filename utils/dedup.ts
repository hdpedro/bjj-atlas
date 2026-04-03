import { createHash } from 'crypto';

export function computeEventHash(name: string, date: string, city: string): string {
  const input = [
    name.toLowerCase().trim(),
    date.trim(),
    (city || '').toLowerCase().trim(),
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}
