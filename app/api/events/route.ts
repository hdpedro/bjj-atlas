import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/utils/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const params = request.nextUrl.searchParams;

    const city = params.get('city');
    const country = params.get('country');
    const source = params.get('source');
    const from = params.get('from');
    const to = params.get('to');
    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const offset = parseInt(params.get('offset') || '0');

    // Build query based on active filters
    // Neon's tagged template doesn't support dynamic WHERE easily,
    // so we use a wide query with CASE-based filtering
    const events = await sql`
      SELECT id, name, date_start, date_end, city, country, venue, organizer, source, source_url, relevance, description, created_at
      FROM events
      WHERE
        (${city}::text IS NULL OR LOWER(unaccent(city)) LIKE LOWER(unaccent(${'%' + (city || '') + '%'})))
        AND (${country}::text IS NULL OR LOWER(unaccent(country)) LIKE LOWER(unaccent(${'%' + (country || '') + '%'})))
        AND (${source}::text IS NULL OR source = ${source || ''})
        AND (${from}::text IS NULL OR date_start >= ${from || '1900-01-01'}::date)
        AND (${to}::text IS NULL OR date_start <= ${to || '2100-01-01'}::date)
      ORDER BY relevance DESC, date_start ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*)::int as total FROM events
      WHERE
        (${city}::text IS NULL OR LOWER(unaccent(city)) LIKE LOWER(unaccent(${'%' + (city || '') + '%'})))
        AND (${country}::text IS NULL OR LOWER(unaccent(country)) LIKE LOWER(unaccent(${'%' + (country || '') + '%'})))
        AND (${source}::text IS NULL OR source = ${source || ''})
        AND (${from}::text IS NULL OR date_start >= ${from || '1900-01-01'}::date)
        AND (${to}::text IS NULL OR date_start <= ${to || '2100-01-01'}::date)
    `;
    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      events,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[API /events] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
