export interface RawScrapedEvent {
  name: string;
  dateStart: string;
  dateEnd?: string;
  city?: string;
  country?: string;
  venue?: string;
  organizer?: string;
  source: 'smoothcomp' | 'eventbrite' | 'ibjjf';
  sourceUrl: string;
  description?: string;
  rawData?: Record<string, unknown>;
}

export interface NormalizedEvent extends RawScrapedEvent {
  hash: string;
  relevance: number;
}

export interface DBEvent extends NormalizedEvent {
  id: number;
  createdAt: string;
  updatedAt: string;
}
