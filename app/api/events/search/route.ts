import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/utils/db';

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

    const events = await sql`
      SELECT id, name, date_start, date_end, city, country, venue, organizer, source, source_url, relevance, description, created_at,
        ts_rank(
          to_tsvector('english', name || ' ' || COALESCE(city, '') || ' ' || COALESCE(description, '')),
          plainto_tsquery('english', ${q})
        ) AS search_rank
      FROM events
      WHERE to_tsvector('english', name || ' ' || COALESCE(city, '') || ' ' || COALESCE(description, ''))
        @@ plainto_tsquery('english', ${q})
      ORDER BY search_rank DESC, relevance DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as total FROM events
      WHERE to_tsvector('english', name || ' ' || COALESCE(city, '') || ' ' || COALESCE(description, ''))
        @@ plainto_tsquery('english', ${q})
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
