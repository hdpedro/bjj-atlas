import { NextRequest, NextResponse } from 'next/server';
import { normalizeEvents } from '@/utils/normalize';
import { ingestEvents } from '@/utils/ingest';
import type { RawScrapedEvent } from '@/types/event';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function validateSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawEvents: RawScrapedEvent[] = body.events;

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    const normalized = normalizeEvents(rawEvents);
    const result = await ingestEvents(normalized);

    return NextResponse.json({
      message: 'Ingest complete',
      received: rawEvents.length,
      normalized: normalized.length,
      ...result,
    });
  } catch (err) {
    console.error('[API /events/ingest] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
