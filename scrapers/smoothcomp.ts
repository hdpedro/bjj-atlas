import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RawScrapedEvent } from '@/types/event';

const LISTING_URLS = [
  'https://smoothcomp.com/en/events',
  'https://smoothcomp.com/en/events?page=2',
  'https://smoothcomp.com/en/events?page=3',
  'https://smoothcomp.com/en/events?page=4',
  'https://smoothcomp.com/en/events?page=5',
  'https://compnet.smoothcomp.com/en/federation/30/events/upcoming',
  'https://smoothcomp.com/en/federation/2/events/upcoming',  // SJJIF
  'https://smoothcomp.com/en/federation/1/events/upcoming',  // AJP
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function parseJsonLdEvents($: cheerio.CheerioAPI, pageUrl: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());

      // ItemList containing events
      if (json['@type'] === 'ItemList' && Array.isArray(json.itemListElement)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const entry of json.itemListElement) {
          const item = entry.item || entry;
          if ((item['@type'] === 'Event' || item['@type'] === 'SportsEvent') && item.name) {
            const loc = item.location || {};
            const addr = loc.address || {};
            events.push({
              name: item.name,
              dateStart: item.startDate || '',
              dateEnd: item.endDate || undefined,
              city: addr.addressLocality || '',
              country: addr.addressCountry || '',
              venue: loc.name || '',
              organizer: typeof item.organizer === 'object' ? item.organizer?.name || '' : String(item.organizer || ''),
              source: 'smoothcomp',
              sourceUrl: item.url || pageUrl,
              description: item.description || '',
            });
          }
        }
      }

      // Single event
      if ((json['@type'] === 'Event' || json['@type'] === 'SportsEvent') && json.name) {
        const loc = json.location || {};
        const addr = loc.address || {};
        events.push({
          name: json.name,
          dateStart: json.startDate || '',
          dateEnd: json.endDate || undefined,
          city: addr.addressLocality || '',
          country: addr.addressCountry || '',
          venue: loc.name || '',
          organizer: typeof json.organizer === 'object' ? json.organizer?.name || '' : String(json.organizer || ''),
          source: 'smoothcomp',
          sourceUrl: json.url || pageUrl,
          description: json.description || '',
        });
      }
    } catch { /* skip malformed JSON-LD */ }
  });
  return events;
}

function parseHtmlEventCards($: cheerio.CheerioAPI, pageUrl: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];
  const seen = new Set<string>();
  const baseUrl = new URL(pageUrl).origin;

  // Find all links to event detail pages
  $('a[href*="/event/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.match(/\/event\/\d+/)) return;

    const eventId = href.match(/\/event\/(\d+)/)?.[1];
    if (!eventId || seen.has(eventId)) return;
    seen.add(eventId);

    const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
    const $link = $(el);
    const $card = $link.closest('[class*="card"], [class*="event"], [class*="item"], [class*="row"], .col, li, article, tr, div').first();
    const $context = $card.length ? $card : $link.parent().parent();

    // Extract name from heading or link text
    let name = '';
    $context.find('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"]').each((_, h) => {
      const text = $(h).text().trim();
      if (text.length > name.length && text.length > 5) name = text;
    });
    if (!name) name = $link.text().trim();
    if (!name || name.length < 5) return;
    if (/^(view|details|read more|register|sign up|more info)/i.test(name)) return;

    // Extract date
    let dateStart = '';
    const timeEl = $context.find('time, [datetime]').first();
    if (timeEl.length) {
      dateStart = timeEl.attr('datetime') || timeEl.text().trim();
    }
    if (!dateStart) {
      $context.find('[class*="date"], [class*="time"]').each((_, d) => {
        const text = $(d).text().trim();
        if (text && !dateStart && text.length < 50) dateStart = text;
      });
    }

    // Extract location
    let city = '';
    $context.find('[class*="location"], [class*="venue"], [class*="city"], [class*="place"], [class*="address"]').each((_, loc) => {
      const text = $(loc).text().trim();
      if (text && !city && text.length < 100) city = text;
    });

    events.push({
      name,
      dateStart,
      city,
      country: '',
      source: 'smoothcomp',
      sourceUrl: fullUrl,
    });
  });

  return events;
}

async function scrapePage(url: string): Promise<RawScrapedEvent[]> {
  try {
    const { data: html } = await axios.get(url, { timeout: 12000, headers: HEADERS });
    const $ = cheerio.load(html);

    const jsonLdEvents = parseJsonLdEvents($, url);
    if (jsonLdEvents.length > 0) {
      console.log(`[Smoothcomp] ${url} → ${jsonLdEvents.length} events (JSON-LD)`);
      return jsonLdEvents;
    }

    const htmlEvents = parseHtmlEventCards($, url);
    console.log(`[Smoothcomp] ${url} → ${htmlEvents.length} events (HTML)`);
    return htmlEvents;
  } catch (err) {
    console.error(`[Smoothcomp] Failed ${url}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function scrapeSmoothcomp(): Promise<RawScrapedEvent[]> {
  console.log('[Smoothcomp] Starting scrape...');

  // Fetch all listing pages concurrently to stay within Vercel timeout
  const results = await Promise.allSettled(
    LISTING_URLS.map(url => scrapePage(url))
  );

  const allEvents: RawScrapedEvent[] = [];
  const seenIds = new Set<string>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const event of result.value) {
      const id = event.sourceUrl.match(/\/event\/(\d+)/)?.[1] || event.sourceUrl;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allEvents.push(event);
      }
    }
  }

  console.log(`[Smoothcomp] Total: ${allEvents.length} unique events`);
  return allEvents;
}
