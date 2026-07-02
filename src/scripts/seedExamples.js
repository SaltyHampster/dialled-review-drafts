// Loads historical call reviews into call_review_examples so the
// generator has real few-shot material from day one.
//
// Usage: node src/scripts/seedExamples.js path/to/examples.json
//
// examples.json shape:
// [
//   {
//     "call_type": "deep_dive_call",
//     "scenario_tag": "price_objection",
//     "transcript_excerpt": "optional short excerpt for context",
//     "review_text": "the full past review, in your voice"
//   },
//   ...
// ]

require("dotenv").config();
const fs = require("fs");
const { pool } = require("../db/pool");

async function seed(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const examples = JSON.parse(raw);

  console.log(`Seeding ${examples.length} examples...`);

  for (const ex of examples) {
    await pool.query(
      `INSERT INTO call_review_examples (call_type, scenario_tag, transcript_excerpt, review_text)
       VALUES ($1, $2, $3, $4)`,
      [ex.call_type, ex.scenario_tag || null, ex.transcript_excerpt || null, ex.review_text]
    );
  }

  console.log("Seeding complete.");
  await pool.end();
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node src/scripts/seedExamples.js path/to/examples.json");
  process.exit(1);
}

seed(filePath).catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
