import axios from 'axios';
import * as cheerio from 'cheerio';
import type { RawScrapedEvent } from '@/types/event';

const IBJJF_CALENDAR_URL = 'https://ibjjf.com/events/calendar';
const IBJJF_EVENTS_URL = 'https://ibjjf.com/events';

// Known major IBJJF events as seed data (updated periodically)
const SEED_EVENTS: RawScrapedEvent[] = [
  {
    name: 'World IBJJF Jiu-Jitsu Championship 2026',
    dateStart: '2026-05-28',
    dateEnd: '2026-06-01',
    city: 'Anaheim',
    country: 'United States',
    venue: 'Anaheim Convention Center',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'The most prestigious BJJ tournament in the world',
  },
  {
    name: 'Pan IBJJF Jiu-Jitsu Championship 2026',
    dateStart: '2026-03-18',
    dateEnd: '2026-03-22',
    city: 'Kissimmee',
    country: 'United States',
    venue: 'Silver Spurs Arena',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'Pan American IBJJF Championship',
  },
  {
    name: 'European IBJJF Jiu-Jitsu Championship 2026',
    dateStart: '2026-01-20',
    dateEnd: '2026-01-25',
    city: 'Lisbon',
    country: 'Portugal',
    venue: 'Altice Arena',
    organizer: 'IBJJF',
    source: 'ibjjf',
    sourceUrl: 'https://ibjjf.com/events',
    description: 'European IBJJF Championship',
  },
  {
    name: 'Brasileiro IBJJF Jiu-Jitsu Championship 2026',
    dateStart: '2026-04-23',
    dateEnd: '2026-04-27',
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

async function scrapeIbjjfPage(): Promise<RawScrapedEvent[]> {
  const events: RawScrapedEvent[] = [];
  const urls = [IBJJF_EVENTS_URL, IBJJF_CALENDAR_URL];

  for (const url of urls) {
    try {
      const { data: html } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'BJJAtlas/1.0 (event aggregator)' },
      });
      const $ = cheerio.load(html);

      // Try JSON-LD
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

      // Flexible HTML parsing — look for event-like patterns
      $('[class*="event"], [class*="calendar"], [class*="card"], article, .tournament').each((_, el) => {
        const $el = $(el);
        const name = $el.find('h2, h3, h4, [class*="title"], [class*="name"]').first().text().trim();
        const dateText = $el.find('[class*="date"], time, [datetime]').first().text().trim()
          || $el.find('[datetime]').attr('datetime') || '';
        const link = $el.find('a').first().attr('href') || '';

        if (name && name.length > 5 && (name.toLowerCase().includes('jiu') || name.toLowerCase().includes('championship') || name.toLowerCase().includes('open'))) {
          events.push({
            name,
            dateStart: dateText,
            city: '',
            country: '',
            organizer: 'IBJJF',
            source: 'ibjjf',
            sourceUrl: link.startsWith('http') ? link : `https://ibjjf.com${link}`,
          });
        }
      });
    } catch (err) {
      console.error(`[IBJJF] Error scraping ${url}:`, err instanceof Error ? err.message : err);
    }
  }

  return events;
}

export async function scrapeIbjjf(): Promise<RawScrapedEvent[]> {
  console.log('[IBJJF] Starting scrape...');

  // Try live scraping first
  const liveEvents = await scrapeIbjjfPage();
  console.log(`[IBJJF] Live scraped: ${liveEvents.length} events`);

  // Merge with seed data (seed data serves as fallback)
  const allEvents = [...liveEvents, ...SEED_EVENTS];

  console.log(`[IBJJF] Total (live + seed): ${allEvents.length} events`);
  return allEvents;
}
