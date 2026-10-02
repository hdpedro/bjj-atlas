import axios from 'axios';
import type { RawScrapedEvent } from '@/types/event';

const API_URL = 'https://ibjjf.com/api/v1/events/upcomings.json';

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const COUNTRY_NAMES: Record<string, string> = {
  'Brasil': 'Brazil',
  'United States of America': 'United States',
};

interface IbjjfChampionship {
  name: string;
  slug: string;
  eventIntervalDays: string;
  city?: string;
  state?: string;
  country?: string;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The API omits the year ("Oct 2 - Oct 4", "Dec 10* - Dec 12"); take it from the event name.
function parseInterval(interval: string, name: string): { start: string; end?: string } | null {
  const parts = [...interval.matchAll(/([A-Z][a-z]{2})\s+(\d{1,2})/g)];
  if (parts.length === 0) return null;

  const startMonth = MONTHS[parts[0][1]];
  const startDay = Number(parts[0][2]);
  if (!startMonth) return null;

  const year = Number(name.match(/\b(20\d{2})\b/)?.[1]) || new Date().getFullYear();
  const start = iso(year, startMonth, startDay);

  const last = parts[parts.length - 1];
  const endMonth = MONTHS[last[1]];
  if (parts.length < 2 || !endMonth) return { start };
  const endYear = endMonth < startMonth ? year + 1 : year;
  return { start, end: iso(endYear, endMonth, Number(last[2])) };
}

export async function scrapeIbjjf(): Promise<RawScrapedEvent[]> {
  console.log('[IBJJF] Starting scrape...');

  const { data } = await axios.get<{ championships: IbjjfChampionship[] }>(API_URL, {
    timeout: 25000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    },
  });

  const events: RawScrapedEvent[] = [];
  for (const c of data.championships || []) {
    const dates = parseInterval(c.eventIntervalDays || '', c.name);
    if (!c.name || !dates) {
      console.error(`[IBJJF] Skipping "${c.name}": cannot parse "${c.eventIntervalDays}"`);
      continue;
    }
    events.push({
      name: c.name.trim(),
      dateStart: dates.start,
      dateEnd: dates.end,
      city: c.city?.trim() || '',
      country: COUNTRY_NAMES[c.country || ''] || c.country || '',
      organizer: 'IBJJF',
      source: 'ibjjf',
      sourceUrl: `https://ibjjf.com/events/${c.slug}`,
    });
  }

  console.log(`[IBJJF] Total: ${events.length} events`);
  return events;
}
