require("dotenv").config();
const express = require("express");
const { createBot } = require("./discord/bot");
const apiRouter = require("./routes/api");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", apiRouter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));

const bot = createBot();
bot.login(process.env.DISCORD_BOT_TOKEN);
