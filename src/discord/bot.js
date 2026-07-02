// This bot logs in with the SAME token as your other Dialled bots
// (Application ID 1505924516587638876) - it's just a new process listening
// on a new channel, not a new Discord application. Which student a
// transcript belongs to is picked on the portal at edit time, not here,
// since a transcript paste alone doesn't reliably tell you who it's for.
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { pool } = require("../db/pool");
const { classifyCallType } = require("../services/classify");
const { generateDraft } = require("../services/generate");

const CHANNEL_ID = process.env.DISCORD_CALL_REVIEW_DRAFTS_CHANNEL_ID;
const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL;

function createBot() {
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  bot.once("ready", () => {
    console.log(`Call review bot logged in as ${bot.user.tag}`);
  });

  bot.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== CHANNEL_ID) return;
    if (!message.content || message.content.trim().length < 50) return; // ignore chatter/short messages

    const transcript = message.content.trim();

    try {
      const processingMsg = await message.reply(
        "Reading the transcript and pulling together a draft review..."
      );

      // 1. Persist raw transcript
      const transcriptResult = await pool.query(
        `INSERT INTO transcripts (discord_channel_id, discord_message_id, discord_author_id, raw_transcript)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [message.channel.id, message.id, message.author.id, transcript]
      );
      const transcriptId = transcriptResult.rows[0].id;

      // 2. Classify
      const classification = await classifyCallType(transcript);
      await pool.query(
        `UPDATE transcripts SET call_type = $1, call_type_confidence = $2 WHERE id = $3`,
        [classification.call_type, classification.confidence, transcriptId]
      );

      // 3. Generate draft
      const { draft, modelUsed } = await generateDraft({
        transcript,
        callType: classification.call_type,
        scenarioTag: classification.scenario_tag,
      });

      const draftResult = await pool.query(
        `INSERT INTO drafts (transcript_id, draft_output, model_used)
         VALUES ($1, $2, $3) RETURNING id`,
        [transcriptId, draft, modelUsed]
      );
      const draftId = draftResult.rows[0].id;

      // 4. Post result back with a link to the edit form on the portal
      const editUrl = `${PORTAL_BASE_URL}/call-review-admin/${transcriptId}`;

      const embed = new EmbedBuilder()
        .setTitle(`Draft ready - ${classification.call_type.replace("_", " ")}`)
        .setDescription(
          draft.main_takeaways?.map((t) => `• ${t}`).join("\n") || "No takeaways generated."
        )
        .addFields(
          (draft.sections || []).map((s) => ({
            name: s.name.replace(/_/g, " "),
            value: s.content.slice(0, 1024),
          }))
        )
        .setFooter({ text: `Confidence: ${Math.round((classification.confidence || 0) * 100)}% · Edit and submit here:` })
        .setColor(0xe24b4a);

      await processingMsg.edit({
        content: `Review the draft below, then finish editing and submit on the portal: ${editUrl}`,
        embeds: [embed],
      });
    } catch (err) {
      console.error("Error processing transcript:", err);
      await message.reply(
        "Something went wrong generating the draft. Check the Railway logs for this service."
      );
    }
  });

  return bot;
}

module.exports = { createBot };
