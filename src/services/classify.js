const { client, DEFAULT_MODEL } = require("./anthropicClient");

const CALL_TYPES = ["setting_call", "deep_dive_call", "other"];

const CLASSIFY_SYSTEM_PROMPT = `You classify sales call transcripts for a high-ticket sales coaching business.

There are only two real call types - every transcript you see should be one of these two:
- setting_call: a short call focused on qualifying a lead and booking them onto a closing call. No pitch, no close attempted.
- deep_dive_call: the main sales call (also called a "closing call") - discovery, pain stacking, objection handling, pitch, and an attempted close.

Only use "other" if the transcript is genuinely unclear, garbled, or clearly isn't a sales call at all (e.g. cut off after a few lines with no real content). This should be rare - default to picking setting_call or deep_dive_call whenever the content gives you enough to judge.

Also identify a short scenario_tag if relevant (e.g. "price_objection", "spouse_objection", "low_intent", "strong_close", "no_show_reschedule", "timing_objection"). Use null if nothing clear applies.

Respond with ONLY valid JSON, no other text:
{
  "call_type": "setting_call" | "deep_dive_call" | "other",
  "confidence": 0.0-1.0,
  "scenario_tag": "string or null",
  "reasoning": "one short sentence"
}`;

async function classifyCallType(transcript) {
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 300,
    system: CLASSIFY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transcript:\n\n${transcript}`,
      },
    ],
  });

  const raw = response.content.find((b) => b.type === "text")?.text || "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse classification response:", cleaned);
    parsed = { call_type: "other", confidence: 0, scenario_tag: null, reasoning: "parse_error" };
  }

  if (!CALL_TYPES.includes(parsed.call_type)) {
    parsed.call_type = "other";
  }

  return parsed;
}

module.exports = { classifyCallType, CALL_TYPES };
