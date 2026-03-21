# Deploy on Render

## 1. Sign in to the Render plugin (Cursor)

The **Render** MCP needs your account. In Cursor, open the Render plugin / MCP settings and complete **Sign in** so tools like `create_web_service` work. If you skip this, use the dashboard steps below.

## 2. Push this repo to GitHub

Render deploys from Git. Your remote should be the repo that contains this **workspace root** (with `render.yaml` here and `shopify-telegram-bot/` inside).

```bash
git push origin main
```

## 3. Create the service (Blueprint — recommended)

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the same GitHub repo / branch (`main`).
3. Render reads **`render.yaml`** at the repo root: **free** Node web service, **`rootDir`:** `shopify-telegram-bot`, **`/health`** checks.

## 4. Environment variables

In the service → **Environment**, add (copy values from your local `.env`, never commit them):

| Key | Notes |
|-----|--------|
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `GEMINI_API_KEY` | Google AI Studio |
| `SHOPIFY_STORE` | e.g. `store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | *or* use Client ID + Secret below |
| `SHOPIFY_CLIENT_ID` | Only if using dev dashboard app |
| `SHOPIFY_CLIENT_SECRET` | Only if using dev dashboard app |
| `GEMINI_MODEL` | Optional |

**Do not** set `PORT` manually — Render injects it.

Optional: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (only if you use Supabase).

## 5. First deploy

Save env vars → Render builds (`npm install`) and starts (`npm start`). Check **Logs** for `Bot started (polling)` and `Health check on :PORT`.

Your app URL `https://<service-name>.onrender.com/health` should return `ok`.

## Manual Web Service (no Blueprint)

If you prefer **New → Web Service** instead of Blueprint:

- **Root Directory:** `shopify-telegram-bot`
- **Build:** `npm install`
- **Start:** `npm start`
- **Health check path:** `/health`
- **Instance type:** Free
