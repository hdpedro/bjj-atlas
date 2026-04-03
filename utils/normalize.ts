import type { RawScrapedEvent, NormalizedEvent } from '@/types/event';
import { computeEventHash } from './dedup';
import { computeRelevance } from './scoring';

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
}

function parseDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.trim();
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeEvent(raw: RawScrapedEvent): NormalizedEvent {
  const name = raw.name.trim();
  const dateStart = parseDate(raw.dateStart);
  const dateEnd = raw.dateEnd ? parseDate(raw.dateEnd) : undefined;
  const city = raw.city ? titleCase(raw.city.trim()) : undefined;
  const country = raw.country ? titleCase(raw.country.trim()) : undefined;
  const description = raw.description ? stripHtml(raw.description) : undefined;

  const hash = computeEventHash(name, dateStart, city || '');
  const normalized: NormalizedEvent = {
    ...raw,
    name,
    dateStart,
    dateEnd,
    city,
    country,
    description,
    hash,
    relevance: 0,
  };
  normalized.relevance = computeRelevance(normalized);
  return normalized;
}

export function normalizeEvents(events: RawScrapedEvent[]): NormalizedEvent[] {
  const seen = new Set<string>();
  const results: NormalizedEvent[] = [];

  for (const raw of events) {
    try {
      const normalized = normalizeEvent(raw);
      if (!seen.has(normalized.hash)) {
        seen.add(normalized.hash);
        results.push(normalized);
      }
    } catch {
      // Skip malformed events
    }
  }
  return results;
}
