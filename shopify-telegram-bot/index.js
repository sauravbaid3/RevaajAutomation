require("dotenv").config();

const http = require("http");
const { Telegraf } = require("telegraf");
const { registerHandlers } = require("./bot/handlers");

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

const port = process.env.PORT;
const domain = process.env.RENDER_EXTERNAL_URL;

if (domain && port) {
  // Production (Render): Use Webhook
  const webhookPath = `/telegraf-webhook`;
  const webhookCallback = bot.webhookCallback(webhookPath);
  
  const server = http.createServer((req, res) => {
    if (req.url === webhookPath) {
      return webhookCallback(req, res);
    }
    if (req.url === "/" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(Number(port), async () => {
    console.log(`Server listening on port ${port} (Webhook mode)`);
    try {
      await bot.telegram.setWebhook(`${domain}${webhookPath}`, {
        drop_pending_updates: true
      });
      console.log(`Webhook set to ${domain}${webhookPath}`);
    } catch (e) {
      console.error("Failed to set webhook", e);
    }
  });

} else {
  // Development: Long polling
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

  // Clear any existing webhook to ensure polling works securely, avoid 409 errors
  bot.launch({ dropPendingUpdates: true })
    .then(() => {
      console.log("Bot started (polling)");
    })
    .catch((e) => {
      console.error("Failed to launch bot", e);
      process.exit(1);
    });
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
