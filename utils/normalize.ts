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
  // Evento de um dia chega sem data final (IBJJF e Smoothcomp). Gravar null
  // derrubou a aba Campeonatos do GripFlow em 02/10/2026 — o app formatava
  // `date_end` sem checar. Sem fim (ou com fim antes do início), termina no
  // mesmo dia em que começa. Fim ilegível também: antes descartava o evento.
  const parsedEnd = raw.dateEnd ? parseDate(raw.dateEnd) : '';
  const dateEnd = /^\d{4}-\d{2}-\d{2}$/.test(parsedEnd) && parsedEnd >= dateStart ? parsedEnd : dateStart;
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
