import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RawScrapedEvent } from '@/types/event';

const IBJJF_URLS = [
  'https://ibjjf.com/events',
  'https://ibjjf.com/events/calendar',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const SEED_EVENTS: RawScrapedEvent[] = [
  {
    name: 'World IBJJF Jiu-Jitsu Championship 2027',
    dateStart: '2027-05-27',
    dateEnd: '2027-06-01',
    city: 'Anaheim',
    country: 'United States',
    venue: 'Anaheim Convention Center',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'The most prestigious BJJ tournament in the world',
  },
  {
    name: 'Pan IBJJF Jiu-Jitsu Championship 2027',
    dateStart: '2027-03-17',
    dateEnd: '2027-03-22',
    city: 'Kissimmee',
    country: 'United States',
    venue: 'Silver Spurs Arena',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'Pan American IBJJF Championship',
  },
  {
    name: 'European IBJJF Jiu-Jitsu Championship 2027',
    dateStart: '2027-01-19',
    dateEnd: '2027-01-25',
    city: 'Lisbon',
    country: 'Portugal',
    venue: 'Altice Arena',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'European IBJJF Championship',
  },
  {
    name: 'Brasileiro IBJJF Jiu-Jitsu Championship 2027',
    dateStart: '2027-04-22',
    dateEnd: '2027-04-27',
    city: 'São Paulo',
    country: 'Brazil',
    venue: 'Ginásio do Ibirapuera',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'Brazilian National IBJJF Championship',
  },
  {
    name: 'World IBJJF Jiu-Jitsu No-Gi Championship 2026',
    dateStart: '2026-12-10',
    dateEnd: '2026-12-14',
    city: 'Anaheim',
    country: 'United States',
    venue: 'Anaheim Convention Center',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'World No-Gi IBJJF Championship',
  },
];

async function scrapeIbjjfPages(): Promise<RawScrapedEvent[]> {
  const events: RawScrapedEvent[] = [];

  for (const url of IBJJF_URLS) {
    try {
      const { data: html } = await axios.get(url, { timeout: 15000, headers: HEADERS });
      const $ = cheerio.load(html);

      // JSON-LD structured data (most reliable)
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).text());
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
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
                organizer: 'IBJJF',
                source: 'ibjjf',
                sourceUrl: item.url || url,
                description: item.description || '',
              });
            }
          }
        } catch { /* skip */ }
      });

      // HTML parsing — accept ALL events found on the IBJJF site
      $('[class*="event"], [class*="calendar"], [class*="card"], article, .tournament, [class*="schedule"]').each((_, el) => {
        const $el = $(el);
        const name = $el.find('h2, h3, h4, h5, [class*="title"], [class*="name"]').first().text().trim();
        const dateText = $el.find('[class*="date"], time, [datetime]').first().text().trim()
          || $el.find('[datetime]').attr('datetime') || '';
        const link = $el.find('a').first().attr('href') || '';
        const locationText = $el.find('[class*="location"], [class*="city"], [class*="venue"]').first().text().trim();

        if (name && name.length > 5) {
          events.push({
            name,
            dateStart: dateText,
            city: locationText || '',
            country: '',
            organizer: 'IBJJF',
            source: 'ibjjf',
            sourceUrl: link.startsWith('http') ? link : `https://ibjjf.com${link}`,
          });
        }
      });

      console.log(`[IBJJF] ${url} → ${events.length} events found so far`);
    } catch (err) {
      console.error(`[IBJJF] Error scraping ${url}:`, err instanceof Error ? err.message : err);
    }
  }

  return events;
}

export async function scrapeIbjjf(): Promise<RawScrapedEvent[]> {
  console.log('[IBJJF] Starting scrape...');

  const liveEvents = await scrapeIbjjfPages();
  console.log(`[IBJJF] Live scraped: ${liveEvents.length} events`);

  const allEvents = [...liveEvents, ...SEED_EVENTS];
  console.log(`[IBJJF] Total (live + seed): ${allEvents.length} events`);
  return allEvents;
}
