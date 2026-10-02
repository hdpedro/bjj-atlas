import { getDb } from './db';
import type { NormalizedEvent } from '@/types/event';

export interface IngestResult {
  inserted: number;
  updated: number;
  errors: number;
}

const BATCH_SIZE = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function upsert(sql: ReturnType<typeof getDb>, event: NormalizedEvent) {
  return sql`
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
      date_end = EXCLUDED.date_end,
      source_url = EXCLUDED.source_url,
      relevance = EXCLUDED.relevance,
      description = COALESCE(EXCLUDED.description, events.description),
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert
  `;
}

export async function ingestEvents(events: NormalizedEvent[]): Promise<IngestResult> {
  const sql = getDb();
  const result: IngestResult = { inserted: 0, updated: 0, errors: 0 };

  const valid = events.filter((e) => {
    const ok = ISO_DATE.test(e.dateStart) && (!e.dateEnd || ISO_DATE.test(e.dateEnd));
    if (!ok) {
      result.errors++;
      console.error(`[Ingest] Skipping "${e.name}": unparseable date "${e.dateStart}"`);
    }
    return ok;
  });

  const count = (rows: Record<string, unknown>[]) => {
    if (rows[0]?.is_insert) result.inserted++;
    else result.updated++;
  };

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    try {
      // One HTTP round trip per batch; a single bad row aborts the whole transaction.
      const results = await sql.transaction(batch.map((e) => upsert(sql, e)));
      results.forEach((rows) => count(rows as Record<string, unknown>[]));
    } catch (err) {
      console.error(`[Ingest] Batch ${i / BATCH_SIZE} failed, retrying row by row:`, err instanceof Error ? err.message : err);
      for (const event of batch) {
        try {
          count((await upsert(sql, event)) as Record<string, unknown>[]);
        } catch (rowErr) {
          result.errors++;
          console.error(`[Ingest] Error for "${event.name}":`, rowErr instanceof Error ? rowErr.message : rowErr);
        }
      }
    }
  }

  return result;
}
