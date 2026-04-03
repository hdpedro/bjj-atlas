-- BJJ Atlas - Database Schema
-- Run this against your Neon PostgreSQL database

CREATE TABLE IF NOT EXISTS events (
  id            SERIAL PRIMARY KEY,
  hash          VARCHAR(64) UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  date_start    DATE NOT NULL,
  date_end      DATE,
  city          TEXT,
  country       TEXT,
  venue         TEXT,
  organizer     TEXT,
  source        TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  description   TEXT,
  relevance     REAL DEFAULT 0.0,
  raw_data      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_events_date ON events (date_start);
CREATE INDEX IF NOT EXISTS idx_events_city ON events (LOWER(city));
CREATE INDEX IF NOT EXISTS idx_events_source ON events (source);
CREATE INDEX IF NOT EXISTS idx_events_relevance ON events (relevance DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_events_search ON events
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(city, '') || ' ' || COALESCE(description, '')));
