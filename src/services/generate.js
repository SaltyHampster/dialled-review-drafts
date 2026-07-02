const { client, DEFAULT_MODEL } = require("./anthropicClient");
const { getFewShotExamples, getRelevantLessons } = require("./retrieval");

// Menu of possible sections per call type. The model only fills in what's
// actually evidenced in the transcript - it should omit or one-line
// anything not exhibited, never manufacture feedback to fill a slot.
const SECTION_MENU = {
  setting_call: ["opener_rapport", "qualifying_questions", "booking_close", "tonality"],
  deep_dive_call: [
    "discovery",
    "pain_stacking",
    "urgency_building",
    "objection_handling",
    "assumptive_close",
  ],
  follow_up_call: ["objection_recap", "urgency_building", "close_attempt"],
  other: [],
};

function buildSystemPrompt({ callType, examples, lessons }) {
  const allowedSections = SECTION_MENU[callType] || [];

  const examplesBlock = examples
    .map(
      (ex, i) =>
        `Example ${i + 1} (${ex.scenario_tag || "general"}):\n${ex.review_text}`
    )
    .join("\n\n---\n\n");

  const lessonsBlock = lessons
    .map((l) => `- ${l.lesson}`)
    .join("\n");

  return `You are writing a sales call review for a high-ticket sales coaching business, in the coach's own casual, direct, behavioural coaching voice - not generic corporate feedback.

Call type: ${callType}
Allowed sections for this call type: ${allowedSections.join(", ") || "none - use general takeaways only"}

RULES:
1. Only include a section if that skill was actually attempted or exhibited in the transcript. If a section from the allowed list did not occur, omit it entirely - do not write a paragraph explaining its absence, and do not invent feedback to fill it.
2. Never apply a rubric from a different call type (e.g. do not assess pain stacking or assumptive close on a setting call).
3. Always include a short free-text "main_takeaways" block with 2-4 bullet points of the most important coaching notes - this is the catch-all for anything that doesn't fit a named section.
4. No em dashes. No generic AI-sounding phrases ("It's important to note that...", "Overall, this was a great call!"). Write the way a direct, experienced sales coach talks to a student they know.
5. Base every claim strictly on what's in the transcript. Do not assume information that isn't there.

${examples.length ? `Past reviews in this coach's voice, for tone and structure reference:\n\n${examplesBlock}\n` : ""}
${lessons.length ? `\nCorrections this coach has made to past AI-generated drafts - apply these:\n${lessonsBlock}\n` : ""}

Respond with ONLY valid JSON, no other text, in this exact shape:
{
  "call_type": "${callType}",
  "sections": [
    { "name": "section_name", "content": "feedback text" }
  ],
  "main_takeaways": ["bullet 1", "bullet 2"]
}`;
}

async function generateDraft({ transcript, callType, scenarioTag }) {
  const [examples, lessons] = await Promise.all([
    getFewShotExamples(callType, scenarioTag),
    getRelevantLessons(callType, scenarioTag),
  ]);

  const systemPrompt = buildSystemPrompt({ callType, examples, lessons });

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: `Transcript:\n\n${transcript}` }],
  });

  const raw = response.content.find((b) => b.type === "text")?.text || "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return { draft: JSON.parse(cleaned), modelUsed: DEFAULT_MODEL };
  } catch (err) {
    console.error("Failed to parse draft response:", cleaned);
    throw new Error("Draft generation returned invalid JSON");
  }
}

module.exports = { generateDraft, SECTION_MENU };
