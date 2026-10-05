import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/utils/db';
import { expandCountryWords } from '@/utils/country';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const params = request.nextUrl.searchParams;

    const q = params.get('q');
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ error: 'Query parameter "q" is required (min 2 chars)' }, { status: 400 });
    }

    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const offset = parseInt(params.get('offset') || '0');

    // Match ANY word (ranked), so "campeonatos do brasil" still finds Brazilian events.
    const words = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const tsquery = expandCountryWords(words).join(' | ');
    if (!tsquery) {
      return NextResponse.json({ query: q, events: [], pagination: { total: 0, limit, offset, hasMore: false } });
    }

    const events = await sql`
      SELECT id, name, date_start, COALESCE(date_end, date_start) AS date_end, city, country, venue, organizer, source, source_url, relevance, description, created_at,
        ts_rank(
          to_tsvector('english', unaccent(name || ' ' || COALESCE(city, '') || ' ' || COALESCE(country, '') || ' ' || COALESCE(description, ''))),
          to_tsquery('english', ${tsquery})
        ) AS search_rank
      FROM events
      WHERE to_tsvector('english', unaccent(name || ' ' || COALESCE(city, '') || ' ' || COALESCE(country, '') || ' ' || COALESCE(description, '')))
        @@ to_tsquery('english', ${tsquery})
      ORDER BY (date_start >= CURRENT_DATE) DESC, search_rank DESC, date_start ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as total FROM events
      WHERE to_tsvector('english', unaccent(name || ' ' || COALESCE(city, '') || ' ' || COALESCE(country, '') || ' ' || COALESCE(description, '')))
        @@ to_tsquery('english', ${tsquery})
    `;
    const total = parseInt(countResult[0]?.total || '0');

    return NextResponse.json({
      query: q,
      events,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[API /events/search] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
