import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RawScrapedEvent } from '@/types/event';

// Main listing + federation-specific pages (CompNet, SJJIF, etc.)
const EVENT_LISTING_URLS = [
  'https://smoothcomp.com/en/events',
  'https://compnet.smoothcomp.com/en/federation/30/events/upcoming',
  'https://smoothcomp.com/en/federation/2/events/upcoming',  // SJJIF
  'https://smoothcomp.com/en/federation/1/events/upcoming',  // AJP
];
const MAX_EVENTS_PER_SOURCE = 20; // Keep under Vercel 60s timeout total
const DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getEventUrlsFromPage(listingUrl: string, max: number): Promise<string[]> {
  try {
    const { data: html } = await axios.get(listingUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'BJJAtlas/1.0 (event aggregator)' },
    });
    const $ = cheerio.load(html);

    const urls: string[] = [];
    // Try JSON-LD ItemList first
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        if (json['@type'] === 'ItemList' && Array.isArray(json.itemListElement)) {
          for (const item of json.itemListElement) {
            const url = item.url || item.item?.url;
            if (url && !urls.includes(url)) urls.push(url);
          }
        }
      } catch { /* skip */ }
    });

    // Fallback: extract links from page
    if (urls.length === 0) {
      $('a[href*="/event/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.match(/\/event\/\d+/)) {
          const full = href.startsWith('http') ? href : new URL(href, listingUrl).toString();
          if (!urls.includes(full)) urls.push(full);
        }
      });
    }

    return urls.slice(0, max);
  } catch (err) {
    console.error(`[Smoothcomp] Error fetching ${listingUrl}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function getAllEventUrls(): Promise<string[]> {
  const allUrls = new Set<string>();
  for (const listingUrl of EVENT_LISTING_URLS) {
    const urls = await getEventUrlsFromPage(listingUrl, MAX_EVENTS_PER_SOURCE);
    urls.forEach(u => allUrls.add(u));
    console.log(`[Smoothcomp] ${listingUrl} → ${urls.length} URLs`);
  }
  return Array.from(allUrls);
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
    const urls = await getAllEventUrls();
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
