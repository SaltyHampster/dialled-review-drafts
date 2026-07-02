-- Raw transcripts posted in the Discord channel
CREATE TABLE IF NOT EXISTS transcripts (
  id SERIAL PRIMARY KEY,
  student_name TEXT,
  discord_channel_id TEXT,
  discord_message_id TEXT,
  discord_author_id TEXT,
  raw_transcript TEXT NOT NULL,
  call_type TEXT,               -- setting_call | deep_dive_call | follow_up_call | other
  call_type_confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Model-generated drafts, one per transcript (can regenerate, so keep history)
CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
  draft_output JSONB NOT NULL,  -- structured: { call_type, sections: [...], takeaways }
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- What actually got submitted, after Ryan's edits, on the portal
CREATE TABLE IF NOT EXISTS call_review_edits (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
  transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
  draft_output JSONB NOT NULL,
  final_output JSONB NOT NULL,
  student_name TEXT,
  call_type TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  processed_for_lessons BOOLEAN DEFAULT FALSE
);

-- Distilled corrections, mined from call_review_edits, fed back into future prompts
CREATE TABLE IF NOT EXISTS lessons_learned (
  id SERIAL PRIMARY KEY,
  call_type TEXT,
  scenario_tag TEXT,
  lesson TEXT NOT NULL,
  source_edit_ids INTEGER[] DEFAULT '{}',
  weight NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_reinforced_at TIMESTAMPTZ DEFAULT now()
);

-- Seed bank of Ryan's best past reviews, used as few-shot examples.
-- Populate this once from historical reviews before going live.
CREATE TABLE IF NOT EXISTS call_review_examples (
  id SERIAL PRIMARY KEY,
  call_type TEXT NOT NULL,
  scenario_tag TEXT,             -- e.g. price_objection, low_intent, strong_close
  transcript_excerpt TEXT,
  review_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_examples_type_scenario ON call_review_examples (call_type, scenario_tag);
CREATE INDEX IF NOT EXISTS idx_lessons_type_scenario ON lessons_learned (call_type, scenario_tag);
CREATE INDEX IF NOT EXISTS idx_edits_unprocessed ON call_review_edits (processed_for_lessons) WHERE processed_for_lessons = FALSE;
