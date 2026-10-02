// Events store English country names; accept common Portuguese/Spanish names and codes too.
const COUNTRY_ALIASES: Record<string, string> = {
  brasil: 'Brazil',
  br: 'Brazil',
  'estados unidos': 'United States',
  eua: 'United States',
  usa: 'United States',
  us: 'United States',
  portugal: 'Portugal',
  'emirados arabes': 'United Arab Emirates',
  'emirados arabes unidos': 'United Arab Emirates',
  uae: 'United Arab Emirates',
  'reino unido': 'United Kingdom',
  uk: 'United Kingdom',
  japao: 'Japan',
  italia: 'Italy',
  franca: 'France',
  alemanha: 'Germany',
  espanha: 'Spain',
  'nova zelandia': 'New Zealand',
  australia: 'Australia',
  canada: 'Canada',
  mexico: 'Mexico',
  argentina: 'Argentina',
  chile: 'Chile',
  irlanda: 'Ireland',
  suecia: 'Sweden',
};

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function resolveCountry(input: string): string {
  return COUNTRY_ALIASES[fold(input)] ?? input;
}

export function expandCountryWords(words: string[]): string[] {
  const out = new Set(words);
  for (const w of words) {
    const alias = COUNTRY_ALIASES[fold(w)];
    if (alias) for (const part of alias.split(' ')) out.add(part.toLowerCase());
  }
  return [...out];
}
