const { client, DEFAULT_MODEL } = require("./anthropicClient");

const CALL_TYPES = ["setting_call", "deep_dive_call", "follow_up_call", "other"];

const CLASSIFY_SYSTEM_PROMPT = `You classify sales call transcripts for a high-ticket sales coaching business.

Given a raw transcript, determine which type of call it is:
- setting_call: a short call focused on qualifying a lead and booking them onto a longer deep dive / closing call. No pitch, no close attempted.
- deep_dive_call: the main sales call - discovery, pain stacking, objection handling, pitch, and an attempted close.
- follow_up_call: a call with someone who was already pitched previously, following up on a prior conversation or objection.
- other: anything that doesn't clearly fit the above (e.g. onboarding call, check-in call, unclear/partial transcript).

Also identify a short scenario_tag if relevant (e.g. "price_objection", "spouse_objection", "low_intent", "strong_close", "no_show_reschedule", "timing_objection"). Use null if nothing clear applies.

Respond with ONLY valid JSON, no other text:
{
  "call_type": "setting_call" | "deep_dive_call" | "follow_up_call" | "other",
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
