import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RawScrapedEvent } from '@/types/event';

const EVENTS_URL = 'https://smoothcomp.com/en/events';
const MAX_EVENTS = 30; // Keep under Vercel 60s timeout
const DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getEventUrls(): Promise<string[]> {
  const { data: html } = await axios.get(EVENTS_URL, {
    timeout: 15000,
    headers: { 'User-Agent': 'BJJAtlas/1.0 (event aggregator)' },
  });
  const $ = cheerio.load(html);

  // Try JSON-LD ItemList first
  const urls: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      if (json['@type'] === 'ItemList' && Array.isArray(json.itemListElement)) {
        for (const item of json.itemListElement) {
          const url = item.url || item.item?.url;
          if (url) urls.push(url);
        }
      }
    } catch { /* skip */ }
  });

  // Fallback: extract links from page
  if (urls.length === 0) {
    $('a[href*="/en/event/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const full = href.startsWith('http') ? href : `https://smoothcomp.com${href}`;
        if (!urls.includes(full)) urls.push(full);
      }
    });
  }

  return urls.slice(0, MAX_EVENTS);
}

async function scrapeEventPage(url: string): Promise<RawScrapedEvent | null> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'BJJAtlas/1.0 (event aggregator)' },
    });
    const $ = cheerio.load(html);

    // Try JSON-LD Event data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        if (json['@type'] === 'Event' || json['@type'] === 'SportsEvent') {
          event = json;
        }
      } catch { /* skip */ }
    });

    if (event) {
      const location = event.location as Record<string, unknown> | undefined;
      const address = location?.address as Record<string, unknown> | undefined;

      return {
        name: (event.name as string) || '',
        dateStart: (event.startDate as string) || '',
        dateEnd: (event.endDate as string) || undefined,
        city: (address?.addressLocality as string) || '',
        country: (address?.addressCountry as string) || '',
        venue: (location?.name as string) || '',
        organizer: typeof event.organizer === 'object'
          ? ((event.organizer as Record<string, unknown>).name as string) || ''
          : '',
        source: 'smoothcomp',
        sourceUrl: url,
        description: (event.description as string) || '',
        rawData: event,
      };
    }

    // Fallback: parse from HTML meta/content
    const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
    if (!name) return null;

    return {
      name,
      dateStart: $('meta[property="event:start_time"]').attr('content') || '',
      dateEnd: $('meta[property="event:end_time"]').attr('content') || undefined,
      city: '',
      country: '',
      source: 'smoothcomp',
      sourceUrl: url,
      description: $('meta[property="og:description"]').attr('content') || '',
    };
  } catch {
    return null;
  }
}

export async function scrapeSmoothcomp(): Promise<RawScrapedEvent[]> {
  console.log('[Smoothcomp] Starting scrape...');
  const events: RawScrapedEvent[] = [];

  try {
    const urls = await getEventUrls();
    console.log(`[Smoothcomp] Found ${urls.length} event URLs`);

    for (const url of urls) {
      const event = await scrapeEventPage(url);
      if (event && event.name && event.dateStart) {
        events.push(event);
      }
      await sleep(DELAY_MS);
    }
  } catch (err) {
    console.error('[Smoothcomp] Error:', err instanceof Error ? err.message : err);
  }

  console.log(`[Smoothcomp] Scraped ${events.length} events`);
  return events;
}
