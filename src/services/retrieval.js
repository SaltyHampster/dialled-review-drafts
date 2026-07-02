const { pool } = require("../db/pool");

// Pull best-matching past reviews: same call_type + scenario_tag first,
// then fall back to same call_type only if not enough scenario matches.
async function getFewShotExamples(callType, scenarioTag, limit = 4) {
  const scenarioMatches = await pool.query(
    `SELECT review_text, transcript_excerpt, scenario_tag
     FROM call_review_examples
     WHERE call_type = $1 AND scenario_tag = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [callType, scenarioTag, limit]
  );

  if (scenarioMatches.rows.length >= limit || !scenarioTag) {
    return scenarioMatches.rows;
  }

  const remaining = limit - scenarioMatches.rows.length;
  const fallback = await pool.query(
    `SELECT review_text, transcript_excerpt, scenario_tag
     FROM call_review_examples
     WHERE call_type = $1 AND (scenario_tag IS DISTINCT FROM $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [callType, scenarioTag, remaining]
  );

  return [...scenarioMatches.rows, ...fallback.rows];
}

// Pull relevant distilled lessons, weighted toward frequently-reinforced,
// recently-reinforced corrections.
async function getRelevantLessons(callType, scenarioTag, limit = 8) {
  const result = await pool.query(
    `SELECT lesson, scenario_tag, weight
     FROM lessons_learned
     WHERE call_type = $1
     ORDER BY weight DESC, last_reinforced_at DESC
     LIMIT $2`,
    [callType, limit]
  );
  return result.rows;
}

module.exports = { getFewShotExamples, getRelevantLessons };
