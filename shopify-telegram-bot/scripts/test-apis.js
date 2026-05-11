/**
 * Smoke-test Telegram, xAI (Grok), and Shopify credentials from .env
 * Does not print secrets — only OK / FAIL and safe error hints.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const axios = require("axios");
const { getAccessToken } = require("../services/shopify.js");

const XAI_MODEL = "grok-4.3";

function shopHost() {
  const raw = (process.env.SHOPIFY_STORE || "").trim().replace(/^https?:\/\//i, "");
  if (!raw) return null;
  if (raw.toLowerCase().endsWith(".myshopify.com")) return raw.toLowerCase();
  const sub = raw.split("/")[0];
  return sub ? `${sub.toLowerCase()}.myshopify.com` : null;
}

async function testTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, detail: "TELEGRAM_BOT_TOKEN is empty" };
  const url = `https://api.telegram.org/bot${token}/getMe`;
  const res = await axios.get(url, { timeout: 15000, validateStatus: () => true });
  if (!res.data?.ok) {
    return {
      ok: false,
      detail: res.data?.description || `HTTP ${res.status}`,
    };
  }
  const u = res.data.result?.username;
  return { ok: true, detail: u ? `@${u}` : "bot ok" };
}

async function testXai() {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return { ok: false, detail: "XAI_API_KEY is empty" };

  try {
    const res = await axios.post(
      "https://api.x.ai/v1/chat/completions",
      {
        model: XAI_MODEL,
        messages: [
          {
            role: "user",
            content: 'Reply with JSON only, no other text: {"ping":"pong"}',
          },
        ],
        max_completion_tokens: 100,
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
        validateStatus: () => true,
      }
    );

    if (res.status !== 200) {
      const err =
        res.data?.error?.message ||
        res.data?.message ||
        res.statusText ||
        `HTTP ${res.status}`;
      return {
        ok: false,
        detail: `${XAI_MODEL}: ${String(err).split("\n")[0]}`,
      };
    }

    const text = String(res.data?.choices?.[0]?.message?.content || "")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);
    if (parsed?.ping !== "pong") {
      return { ok: false, detail: `${XAI_MODEL}: unexpected JSON` };
    }
    return { ok: true, detail: `${XAI_MODEL} OK (xAI)` };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || String(e);
    return { ok: false, detail: `${XAI_MODEL}: ${String(msg).split("\n")[0]}` };
  }
}

async function testShopify() {
  const host = shopHost();
  if (!host) {
    return { ok: false, detail: "SHOPIFY_STORE missing or invalid" };
  }
  const hasStatic = Boolean(process.env.SHOPIFY_ACCESS_TOKEN?.trim());
  const hasClient = Boolean(
    process.env.SHOPIFY_CLIENT_ID?.trim() &&
      process.env.SHOPIFY_CLIENT_SECRET?.trim()
  );
  if (!hasStatic && !hasClient) {
    return {
      ok: false,
      detail: "Set SHOPIFY_ACCESS_TOKEN or CLIENT_ID + CLIENT_SECRET",
    };
  }

  const token = await getAccessToken();
  const url = `https://${host}/admin/api/2024-01/shop.json`;
  const res = await axios.get(url, {
    headers: { "X-Shopify-Access-Token": token },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    const err =
      res.data?.errors ||
      res.data?.error ||
      res.statusText ||
      `HTTP ${res.status}`;
    return {
      ok: false,
      detail: typeof err === "string" ? err : JSON.stringify(err).slice(0, 200),
    };
  }
  const name = res.data?.shop?.name || "shop";
  return { ok: true, detail: `${name} (${host})` };
}

function line(label, result) {
  const icon = result.ok ? "OK" : "FAIL";
  console.log(`[${icon}] ${label}${result.detail ? ` — ${result.detail}` : ""}`);
}

async function main() {
  console.log("API smoke tests (reading .env from project root)\n");

  const results = [];

  try {
    const r = await testTelegram();
    line("Telegram (getMe)", r);
    results.push(r);
  } catch (e) {
    const r = { ok: false, detail: e.message || String(e) };
    line("Telegram (getMe)", r);
    results.push(r);
  }

  try {
    const r = await testXai();
    line("xAI (chat/completions)", r);
    results.push(r);
  } catch (e) {
    const r = { ok: false, detail: e.message || String(e) };
    line("xAI (chat/completions)", r);
    results.push(r);
  }

  try {
    const r = await testShopify();
    line("Shopify (shop.json + token)", r);
    results.push(r);
  } catch (e) {
    const r = { ok: false, detail: e.message || String(e) };
    line("Shopify (shop.json + token)", r);
    results.push(r);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed ? `\n${failed} check(s) failed.` : "\nAll checks passed."
  );
  process.exit(failed ? 1 : 0);
}

main();
