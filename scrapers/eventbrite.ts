import axios from 'axios';
import type { RawScrapedEvent } from '@/types/event';

const SEARCH_QUERIES = [
  'https://www.eventbrite.com/d/online/jiu-jitsu/',
  'https://www.eventbrite.com/d/united-states/brazilian-jiu-jitsu/',
  'https://www.eventbrite.com/d/brazil/jiu-jitsu/',
  'https://www.eventbrite.com/d/united-kingdom/jiu-jitsu/',
];

function extractServerData(html: string): Record<string, unknown> | null {
  // Try multiple patterns for Eventbrite's server data
  const patterns = [
    /window\.__SERVER_DATA__\s*=\s*({.+?});\s*<\/script>/s,
    /window\.__SERVER_DATA__\s*=\s*({.+?});\s*$/m,
    /"search_data"\s*:\s*({.+?"events"\s*:\s*\[.+?\])/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]);
      } catch { /* try next */ }
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventsFromData(data: any, pageUrl: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];

  try {
    // Navigate nested structure
    const searchData = (data.search_data || data.jsonBody?.search_data || data) as Record<string, unknown>;
    const eventList = (searchData.events || []) as Array<Record<string, unknown>>;

    for (const ev of eventList) {
      const name = (ev.name as string) || '';
      const startDate = (ev.start_date as string) || (ev.start_datetime as string) || '';
      const endDate = (ev.end_date as string) || (ev.end_datetime as string) || '';
      const url = (ev.url as string) || '';

      if (!name || !startDate) continue;

      // Extract venue info
      const venue = ev.primary_venue as Record<string, unknown> | undefined;
      const address = venue?.address as Record<string, unknown> | undefined;

      events.push({
        name,
        dateStart: startDate,
        dateEnd: endDate || undefined,
        city: (address?.city as string) || (venue?.city as string) || '',
        country: (address?.country as string) || '',
        venue: (venue?.name as string) || '',
        organizer: (ev.organizer_name as string) || '',
        source: 'eventbrite',
        sourceUrl: url || pageUrl,
        description: (ev.summary as string) || (ev.description as string) || '',
        rawData: ev,
      });
    }
  } catch {
    // Could not parse events
  }
  return events;
}

async function scrapeEventbritePage(url: string): Promise<RawScrapedEvent[]> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'BJJAtlas/1.0 (event aggregator)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const serverData = extractServerData(html);
    if (serverData) {
      return parseEventsFromData(serverData, url);
    }

    // Fallback: try to find JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    if (jsonLdMatch) {
      const events: RawScrapedEvent[] = [];
      for (const script of jsonLdMatch) {
        try {
          const content = script.replace(/<\/?script[^>]*>/g, '');
          const json = JSON.parse(content);
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
                sourceUrl: item.url || url,
                description: item.description || '',
              });
            }
          }
        } catch { /* skip */ }
      }
      if (events.length > 0) return events;
    }

    return [];
  } catch (err) {
    console.error(`[Eventbrite] Error scraping ${url}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function scrapeEventbrite(): Promise<RawScrapedEvent[]> {
  console.log('[Eventbrite] Starting scrape...');
  const allEvents: RawScrapedEvent[] = [];

  for (const url of SEARCH_QUERIES) {
    const events = await scrapeEventbritePage(url);
    allEvents.push(...events);
    console.log(`[Eventbrite] ${url} → ${events.length} events`);
  }

  console.log(`[Eventbrite] Total: ${allEvents.length} events`);
  return allEvents;
}
