require("dotenv").config();
const express = require("express");
const { createBot } = require("./discord/bot");
const apiRouter = require("./routes/api");

const app = express();
app.use(express.json({ limit: "2mb" }));

// Log every incoming request - without this, successful requests are
// invisible in the logs, only errors inside route handlers get logged.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use("/api", apiRouter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));

const bot = createBot();
bot.login(process.env.DISCORD_BOT_TOKEN);
