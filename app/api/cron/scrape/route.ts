import { NextRequest, NextResponse } from 'next/server';
import { runScraper, runAllScrapers } from '@/scrapers';
import { normalizeEvents } from '@/utils/normalize';
import { ingestEvents } from '@/utils/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function validateSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const source = request.nextUrl.searchParams.get('source');

  try {
    let allRawEvents: Array<{ source: string; events: unknown[]; error?: string }>;

    if (source) {
      // Run a single scraper
      const result = await runScraper(source);
      allRawEvents = [result];
    } else {
      // Run all scrapers
      allRawEvents = await runAllScrapers();
    }

    const summary = [];
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    for (const result of allRawEvents) {
      if (result.error) {
        summary.push({ source: result.source, error: result.error, events: 0 });
        continue;
      }

      const normalized = normalizeEvents(result.events as Parameters<typeof normalizeEvents>[0]);
      const ingestResult = await ingestEvents(normalized);

      totalInserted += ingestResult.inserted;
      totalUpdated += ingestResult.updated;
      totalErrors += ingestResult.errors;

      summary.push({
        source: result.source,
        scraped: result.events.length,
        normalized: normalized.length,
        inserted: ingestResult.inserted,
        updated: ingestResult.updated,
        errors: ingestResult.errors,
      });
    }

    return NextResponse.json({
      message: 'Scrape complete',
      timestamp: new Date().toISOString(),
      summary,
      totals: {
        inserted: totalInserted,
        updated: totalUpdated,
        errors: totalErrors,
      },
    });
  } catch (err) {
    console.error('[Cron /scrape] Error:', err);
    return NextResponse.json({ error: 'Scrape failed', details: String(err) }, { status: 500 });
  }
}
