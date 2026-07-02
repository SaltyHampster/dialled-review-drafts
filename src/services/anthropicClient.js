const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model for classification + generation. Override per-call if you
// ever want to route a hard case to a stronger model (e.g. "claude-fable-5").
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

module.exports = { client, DEFAULT_MODEL };
