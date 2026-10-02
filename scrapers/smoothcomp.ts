import axios from 'axios';
import type { RawScrapedEvent } from '@/types/event';

// Listing pages embed every upcoming event as `var events = [...]` in the HTML.
const LISTING_URLS = [
  'https://smoothcomp.com/en/events/upcoming',
  'https://compnet.smoothcomp.com/en/federation/30/events/upcoming',
  'https://events.uaejjf.org/en/events/upcoming',
];

// Smoothcomp sport groups: 1 = Brazilian Jiu-Jitsu, 3/4/7 = grappling / no-gi / ADCC
const GRAPPLING_GROUPS = new Set(['1', '3', '4', '7']);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface SmoothcompListEvent {
  id: number;
  title: string;
  url: string;
  startdate: string;
  enddate?: string;
  location_city?: string;
  location_country?: string;
  location_country_human?: string;
  categoryGroups?: string[];
}

function extractEventsArray(html: string): SmoothcompListEvent[] {
  const marker = 'var events = ';
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const from = start + marker.length;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(from, i + 1));
    }
  }
  return [];
}

// *.smoothcomp.com subdomains share one event ID space; white-label hosts (e.g. UAEJJF) have their own.
function idNamespace(url: string): string {
  const host = new URL(url).hostname;
  return host.endsWith('smoothcomp.com') ? 'smoothcomp' : host;
}

async function scrapeListing(url: string): Promise<{ namespace: string; events: SmoothcompListEvent[] }> {
  const namespace = idNamespace(url);
  try {
    const { data: html } = await axios.get<string>(url, { timeout: 25000, headers: HEADERS, responseType: 'text' });
    const events = extractEventsArray(html);
    console.log(`[Smoothcomp] ${url} → ${events.length} events`);
    return { namespace, events };
  } catch (err) {
    console.error(`[Smoothcomp] Failed ${url}: ${err instanceof Error ? err.message : err}`);
    return { namespace, events: [] };
  }
}

export async function scrapeSmoothcomp(): Promise<RawScrapedEvent[]> {
  console.log('[Smoothcomp] Starting scrape...');
  const lists = await Promise.all(LISTING_URLS.map(scrapeListing));

  const byId = new Map<string, RawScrapedEvent>();
  for (const { namespace, events } of lists) for (const ev of events) {
    const key = `${namespace}:${ev.id}`;
    if (byId.has(key) || !ev.title || !ev.startdate) continue;
    if (!ev.categoryGroups?.some(g => GRAPPLING_GROUPS.has(String(g)))) continue;

    byId.set(key, {
      name: ev.title.trim(),
      dateStart: ev.startdate,
      dateEnd: ev.enddate || undefined,
      city: ev.location_city?.trim() || '',
      country: ev.location_country_human || ev.location_country || '',
      source: 'smoothcomp',
      sourceUrl: ev.url,
    });
  }

  const events = Array.from(byId.values());
  console.log(`[Smoothcomp] Total: ${events.length} BJJ/grappling events`);
  return events;
}
