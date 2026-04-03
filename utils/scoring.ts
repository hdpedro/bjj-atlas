import type { RawScrapedEvent } from '@/types/event';

const MAJOR_CITIES = new Set([
  'rio de janeiro', 'são paulo', 'sao paulo', 'new york', 'los angeles',
  'las vegas', 'houston', 'miami', 'chicago', 'london', 'paris',
  'tokyo', 'abu dhabi', 'dubai', 'lisbon', 'barcelona', 'amsterdam',
  'austin', 'san diego', 'atlanta', 'dallas', 'orlando', 'long beach',
  'anaheim', 'florianópolis', 'florianopolis', 'brasília', 'brasilia',
  'belo horizonte', 'curitiba', 'porto alegre', 'recife', 'fortaleza',
]);

const PREMIER_KEYWORDS = [
  'world', 'mundial', 'championship', 'campeonato', 'grand prix',
  'open', 'pan', 'european', 'brasileiro', 'national', 'continental',
];

const MAJOR_ORGS = ['ibjjf', 'adcc', 'naga', 'sjjif', 'cbjj', 'uaejjf', 'ajp'];

export function computeRelevance(event: RawScrapedEvent): number {
  let score = 0;
  const nameLower = event.name.toLowerCase();
  const cityLower = (event.city || '').toLowerCase();
  const orgLower = (event.organizer || '').toLowerCase();

  // Source weight
  if (event.source === 'ibjjf') score += 3;
  else if (event.source === 'smoothcomp') score += 2;
  else score += 1;

  // Major city
  if (MAJOR_CITIES.has(cityLower)) score += 3;
  else if (event.city) score += 1;

  // Premier event keywords
  for (const kw of PREMIER_KEYWORDS) {
    if (nameLower.includes(kw)) {
      score += 2;
      break;
    }
  }

  // Major organization
  for (const org of MAJOR_ORGS) {
    if (nameLower.includes(org) || orgLower.includes(org)) {
      score += 2;
      break;
    }
  }

  // Future event bonus
  const eventDate = new Date(event.dateStart);
  if (eventDate > new Date()) score += 1;

  // Has description
  if (event.description) score += 1;

  // Normalize to 0-1 range (max theoretical ~12)
  return Math.min(score / 12, 1);
}
