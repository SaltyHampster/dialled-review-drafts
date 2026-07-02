require("dotenv").config();
const { pool } = require("../db/pool");
const { client, DEFAULT_MODEL } = require("../services/anthropicClient");

const DISTILL_SYSTEM_PROMPT = `You compare a draft sales call review against the coach's final edited version and identify what the coach corrected.

Output a short, reusable, general lesson - not a description of this specific call - that would help an AI avoid making the same kind of mistake on a FUTURE, different call.

If the edits are purely stylistic/wording with no substantive coaching correction, respond with "lesson": null.

Respond with ONLY valid JSON:
{
  "lesson": "string or null",
  "scenario_tag": "short tag or null"
}`;

async function distillOne(edit) {
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 300,
    system: DISTILL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Call type: ${edit.call_type}\n\nDRAFT:\n${JSON.stringify(edit.draft_output, null, 2)}\n\nFINAL (coach-edited):\n${JSON.stringify(edit.final_output, null, 2)}`,
      },
    ],
  });

  const raw = response.content.find((b) => b.type === "text")?.text || "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse distillation for edit", edit.id, cleaned);
    return { lesson: null, scenario_tag: null };
  }
}

async function upsertLesson({ callType, scenarioTag, lesson, editId }) {
  // Simple dedup: if a very similar lesson already exists for this
  // call_type + scenario_tag, reinforce it (bump weight) instead of
  // creating a near-duplicate row.
  const existing = await pool.query(
    `SELECT id, weight, source_edit_ids FROM lessons_learned
     WHERE call_type = $1 AND scenario_tag IS NOT DISTINCT FROM $2
     AND similarity(lesson, $3) > 0.5
     LIMIT 1`,
    [callType, scenarioTag, lesson]
  ).catch(async () => {
    // pg_trgm extension not enabled - fall back to exact-ish match
    return pool.query(
      `SELECT id, weight, source_edit_ids FROM lessons_learned
       WHERE call_type = $1 AND scenario_tag IS NOT DISTINCT FROM $2 AND lesson = $3
       LIMIT 1`,
      [callType, scenarioTag, lesson]
    );
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    await pool.query(
      `UPDATE lessons_learned
       SET weight = weight + 1, last_reinforced_at = now(), source_edit_ids = array_append(source_edit_ids, $1)
       WHERE id = $2`,
      [editId, row.id]
    );
  } else {
    await pool.query(
      `INSERT INTO lessons_learned (call_type, scenario_tag, lesson, source_edit_ids)
       VALUES ($1, $2, $3, ARRAY[$4]::INTEGER[])`,
      [callType, scenarioTag, lesson, editId]
    );
  }
}

async function run() {
  const unprocessed = await pool.query(
    `SELECT * FROM call_review_edits WHERE processed_for_lessons = FALSE ORDER BY submitted_at ASC LIMIT 100`
  );

  console.log(`Distilling ${unprocessed.rows.length} unprocessed edits...`);

  for (const edit of unprocessed.rows) {
    const { lesson, scenario_tag } = await distillOne(edit);

    if (lesson) {
      await upsertLesson({
        callType: edit.call_type,
        scenarioTag: scenario_tag,
        lesson,
        editId: edit.id,
      });
    }

    await pool.query(
      `UPDATE call_review_edits SET processed_for_lessons = TRUE WHERE id = $1`,
      [edit.id]
    );
  }

  console.log("Distillation run complete.");
  await pool.end();
}

run().catch((err) => {
  console.error("Distillation run failed:", err);
  process.exit(1);
});
