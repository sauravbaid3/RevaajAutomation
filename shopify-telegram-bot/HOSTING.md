# Hosting the bot (Railway, Render, others)

This app is a **long-running Node process** (Telegram long polling). **Supabase** is optional (Postgres only); the bot itself runs on a generic host.

## Environment variables

Set these in the host’s dashboard (never commit `.env`):

| Variable | Required |
|----------|----------|
| `TELEGRAM_BOT_TOKEN` | Yes |
| `GEMINI_API_KEY` | Yes |
| `SHOPIFY_STORE` | Yes |
| `SHOPIFY_ACCESS_TOKEN` *or* `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` | Yes (one path) |
| `GEMINI_MODEL` | No |
| `PORT` | Auto-set on many hosts; enables `/` and `/health` when present |

Optional Supabase (see bottom): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Monorepo / repo layout

If the Git root is **`shopify-telegram-workspace`** (this layout), set **Root Directory** to `shopify-telegram-bot` in Railway or Render.

---

## Railway

1. Push this project to GitHub/GitLab (or deploy from local with Railway CLI).
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** (or empty project + deploy).
3. Set **Root Directory** to `shopify-telegram-bot` if needed.
4. **Variables** → add all secrets from the table above.
5. **Start command** is already `npm start` via `package.json` / `railway.json`.

Railway usually sets **`PORT`** and expects something to listen; `index.js` starts a small **health server** on `PORT` when it is set, alongside the bot.

> Railway’s free tier has changed over time (trial credits vs always-free). Check [Railway pricing](https://railway.app/pricing) for current terms.

---

## Render (free Web Service)

Render’s **free** tier applies to **Web Services**, not Background Workers. This repo includes **`render.yaml`** for a **free Web Service** with **`healthCheckPath: /health`** so Render can probe the app.

1. Push to Git and connect the repo on [Render](https://render.com).
2. **New** → **Blueprint** (or **Web Service** manually).
3. **Build:** `npm install` — **Start:** `npm start`
4. Add the same env vars.

**Limits:** Free web apps can **spin down** when idle; Render’s health checks help but behavior can still interrupt a 24/7 bot. For something stricter, use a paid instance or another host.

---

## Other free / low-cost options

- **[Fly.io](https://fly.io/docs/js/the-basics/)** — free allowance for small VMs; good for always-on workers.
- **[Koyeb](https://www.koyeb.com/)**, **Oracle Cloud Free Tier** (VM), etc.

For **webhook mode** later (instead of polling), you’d expose Telegraf’s webhook on `PORT` and point Telegram at your public URL; the same hosts apply.

---

## Optional: Supabase

If you use the Supabase project created for this app, it holds **Postgres** only (e.g. future `bot_sessions`). It does **not** run the Node bot.

Project API URL: `https://zauegebnjizsniorbnsu.supabase.co` — keys under **Settings → API** in the Supabase dashboard.
