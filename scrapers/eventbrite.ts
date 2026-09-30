import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RawScrapedEvent } from '@/types/event';

const SEARCH_URLS = [
  'https://www.eventbrite.com/d/online/jiu-jitsu/',
  'https://www.eventbrite.com/d/united-states/brazilian-jiu-jitsu/',
  'https://www.eventbrite.com/d/united-states/bjj-tournament/',
  'https://www.eventbrite.com/d/united-states/grappling-tournament/',
  'https://www.eventbrite.com/d/brazil/jiu-jitsu/',
  'https://www.eventbrite.com/d/united-kingdom/jiu-jitsu/',
  'https://www.eventbrite.com/d/europe/jiu-jitsu/',
  'https://www.eventbrite.com/d/australia/jiu-jitsu/',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Extract embedded JSON data from Eventbrite HTML using multiple strategies
function extractEmbeddedEvents(html: string, pageUrl: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];

  // Strategy 1: window.__SERVER_DATA__
  const serverDataPatterns = [
    /window\.__SERVER_DATA__\s*=\s*({[\s\S]*?});\s*<\/script>/,
    /window\.__SERVER_DATA__\s*=\s*({[\s\S]*?});\s*$/m,
  ];
  for (const pattern of serverDataPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        const data = JSON.parse(match[1]);
        const searchData = data.search_data || data.jsonBody?.search_data || data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eventList = (searchData.events || []) as any[];
        for (const ev of eventList) {
          if (ev.name && (ev.start_date || ev.start_datetime)) {
            const venue = ev.primary_venue || {};
            const address = venue.address || {};
            events.push({
              name: ev.name,
              dateStart: ev.start_date || ev.start_datetime || '',
              dateEnd: ev.end_date || ev.end_datetime || undefined,
              city: address.city || venue.city || '',
              country: address.country || '',
              venue: venue.name || '',
              organizer: ev.organizer_name || '',
              source: 'eventbrite',
              sourceUrl: ev.url || pageUrl,
              description: ev.summary || '',
            });
          }
        }
        if (events.length > 0) return events;
      } catch { /* try next */ }
    }
  }

  // Strategy 2: __NEXT_DATA__ (Next.js SSR)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch?.[1]) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const props = data?.props?.pageProps;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventList = (props?.events || props?.search_data?.events || []) as any[];
      for (const ev of eventList) {
        if (ev.name && (ev.start_date || ev.startDate)) {
          events.push({
            name: ev.name,
            dateStart: ev.start_date || ev.startDate || '',
            dateEnd: ev.end_date || ev.endDate || undefined,
            city: ev.primary_venue?.address?.city || '',
            country: ev.primary_venue?.address?.country || '',
            venue: ev.primary_venue?.name || '',
            organizer: ev.organizer_name || ev.organizer?.name || '',
            source: 'eventbrite',
            sourceUrl: ev.url || pageUrl,
            description: ev.summary || '',
          });
        }
      }
      if (events.length > 0) return events;
    } catch { /* try next */ }
  }

  // Strategy 3: Any JSON blob containing events array
  const jsonBlobMatches = html.matchAll(/"events"\s*:\s*(\[[\s\S]{10,}?\])\s*[,}]/g);
  for (const match of jsonBlobMatches) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = JSON.parse(match[1]) as any[];
      if (Array.isArray(arr) && arr.length > 0 && arr[0].name) {
        for (const ev of arr) {
          if (ev.name && (ev.start_date || ev.start_datetime)) {
            events.push({
              name: ev.name,
              dateStart: ev.start_date || ev.start_datetime || '',
              dateEnd: ev.end_date || ev.end_datetime || undefined,
              city: ev.primary_venue?.address?.city || '',
              country: ev.primary_venue?.address?.country || '',
              source: 'eventbrite',
              sourceUrl: ev.url || pageUrl,
              description: ev.summary || '',
            });
          }
        }
        if (events.length > 0) return events;
      }
    } catch { /* try next */ }
  }

  return events;
}

function parseJsonLd(html: string, pageUrl: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];
  const $ = cheerio.load(html);

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item['@type'] === 'Event' && item.name) {
          const loc = item.location || {};
          const addr = loc.address || {};
          events.push({
            name: item.name,
            dateStart: item.startDate || '',
            dateEnd: item.endDate || undefined,
            city: addr.addressLocality || '',
            country: addr.addressCountry || '',
            venue: loc.name || '',
            organizer: item.organizer?.name || '',
            source: 'eventbrite',
            sourceUrl: item.url || pageUrl,
            description: item.description || '',
          });
        }
      }
    } catch { /* skip */ }
  });

  return events;
}

function parseHtmlCards(html: string, pageUrl: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];
  const $ = cheerio.load(html);

  // Look for event cards/links
  $('a[href*="eventbrite.com/e/"], [data-event-id], [class*="event-card"], [class*="search-event-card"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || $el.find('a').first().attr('href') || '';
    let name = $el.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
    if (!name) name = $el.attr('aria-label') || '';
    if (!name) name = $el.text().trim().split('\n')[0]?.trim() || '';

    const dateText = $el.find('time, [datetime], [class*="date"]').first().text().trim()
      || $el.find('[datetime]').first().attr('datetime') || '';

    const locationText = $el.find('[class*="location"], [class*="venue"]').first().text().trim();

    if (name && name.length > 5 && name.length < 200) {
      events.push({
        name,
        dateStart: dateText,
        city: locationText,
        source: 'eventbrite',
        sourceUrl: href.startsWith('http') ? href : pageUrl,
      });
    }
  });

  return events;
}

async function scrapeSearchPage(url: string): Promise<RawScrapedEvent[]> {
  try {
    const { data: html } = await axios.get(url, { timeout: 12000, headers: HEADERS });

    // Try embedded JSON data first (most reliable when available)
    let events = extractEmbeddedEvents(html, url);
    if (events.length > 0) {
      console.log(`[Eventbrite] ${url} → ${events.length} events (embedded JSON)`);
      return events;
    }

    // Try JSON-LD
    events = parseJsonLd(html, url);
    if (events.length > 0) {
      console.log(`[Eventbrite] ${url} → ${events.length} events (JSON-LD)`);
      return events;
    }

    // Fall back to HTML parsing
    events = parseHtmlCards(html, url);
    console.log(`[Eventbrite] ${url} → ${events.length} events (HTML)`);
    return events;
  } catch (err) {
    console.error(`[Eventbrite] Failed ${url}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function scrapeEventbrite(): Promise<RawScrapedEvent[]> {
  console.log('[Eventbrite] Starting scrape...');

  const results = await Promise.allSettled(
    SEARCH_URLS.map(url => scrapeSearchPage(url))
  );

  const allEvents: RawScrapedEvent[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const event of result.value) {
      const key = `${event.name}|${event.dateStart}`;
      if (!seen.has(key)) {
        seen.add(key);
        allEvents.push(event);
      }
    }
  }

  console.log(`[Eventbrite] Total: ${allEvents.length} events`);
  return allEvents;
}
