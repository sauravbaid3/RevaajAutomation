require("dotenv").config();

const http = require("http");
const { Telegraf } = require("telegraf");
const { registerHandlers } = require("./bot/handlers");

const port = process.env.PORT;
if (port) {
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(Number(port), () => {
    console.log(`Health check on :${port}`);
  });
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    "Missing TELEGRAM_BOT_TOKEN. Set it in your environment (e.g. Render → Environment) or in a local .env file."
  );
  process.exit(1);
}

const bot = new Telegraf(token);

registerHandlers(bot);

bot.catch((err, ctx) => {
  const id = ctx?.from?.id ?? "?";
  console.error(`[${id}] bot error`, err);
});

// Development: long polling. Production: use bot.telegram.setWebhook + createWebhookMiddleware()
// or Telegraf's webhookCallback() behind HTTPS instead of launch().
bot
  .launch()
  .then(() => {
    console.log("Bot started (polling)");
  })
  .catch((e) => {
    console.error("Failed to launch bot", e);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
