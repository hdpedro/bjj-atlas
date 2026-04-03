import { getDb } from './db';
import type { NormalizedEvent } from '@/types/event';

export interface IngestResult {
  inserted: number;
  updated: number;
  errors: number;
}

export async function ingestEvents(events: NormalizedEvent[]): Promise<IngestResult> {
  const sql = getDb();
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const event of events) {
    try {
      const result = await sql`
        INSERT INTO events (hash, name, date_start, date_end, city, country, venue, organizer, source, source_url, description, relevance, raw_data)
        VALUES (
          ${event.hash},
          ${event.name},
          ${event.dateStart},
          ${event.dateEnd || null},
          ${event.city || null},
          ${event.country || null},
          ${event.venue || null},
          ${event.organizer || null},
          ${event.source},
          ${event.sourceUrl},
          ${event.description || null},
          ${event.relevance},
          ${event.rawData ? JSON.stringify(event.rawData) : null}
        )
        ON CONFLICT (hash) DO UPDATE SET
          name = EXCLUDED.name,
          relevance = EXCLUDED.relevance,
          description = COALESCE(EXCLUDED.description, events.description),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `;
      if (result[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors++;
      console.error(`[Ingest] Error for "${event.name}":`, err instanceof Error ? err.message : err);
    }
  }

  return { inserted, updated, errors };
}
