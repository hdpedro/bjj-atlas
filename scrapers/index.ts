import { scrapeSmoothcomp } from './smoothcomp';
import { scrapeEventbrite } from './eventbrite';
import { scrapeIbjjf } from './ibjjf';
import type { RawScrapedEvent } from '@/types/event';

export interface ScrapeResult {
  source: string;
  events: RawScrapedEvent[];
  error?: string;
}

export async function runAllScrapers(): Promise<ScrapeResult[]> {
  console.log('[Scrapers] Running all scrapers...');

  const results = await Promise.allSettled([
    scrapeSmoothcomp().then((events) => ({ source: 'smoothcomp', events })),
    scrapeEventbrite().then((events) => ({ source: 'eventbrite', events })),
    scrapeIbjjf().then((events) => ({ source: 'ibjjf', events })),
  ]);

  const scrapeResults: ScrapeResult[] = results.map((result, i) => {
    const sources = ['smoothcomp', 'eventbrite', 'ibjjf'];
    if (result.status === 'fulfilled') {
      return result.value;
    }
    const err = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.error(`[Scrapers] ${sources[i]} failed:`, err);
    return { source: sources[i], events: [], error: err };
  });

  const total = scrapeResults.reduce((sum, r) => sum + r.events.length, 0);
  console.log(`[Scrapers] Total events collected: ${total}`);

  return scrapeResults;
}

export async function runScraper(source: string): Promise<ScrapeResult> {
  const scrapers: Record<string, () => Promise<RawScrapedEvent[]>> = {
    smoothcomp: scrapeSmoothcomp,
    eventbrite: scrapeEventbrite,
    ibjjf: scrapeIbjjf,
  };

  const scraper = scrapers[source];
  if (!scraper) {
    return { source, events: [], error: `Unknown source: ${source}` };
  }

  try {
    const events = await scraper();
    return { source, events };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source, events: [], error: msg };
  }
}
