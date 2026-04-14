/**
 * Smoke-test Telegram, Gemini, and Shopify credentials from .env
 * Does not print secrets — only OK / FAIL and safe error hints.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getAccessToken } = require("../services/shopify.js");

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

const GEMINI_TRY_MODELS = [
  process.env.GEMINI_MODEL?.trim(),
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
].filter(Boolean);

async function testGemini() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, detail: "GEMINI_API_KEY is empty" };
  const genAI = new GoogleGenerativeAI(key);
  const tried = [];
  let lastErr = "";

  for (const modelName of [...new Set(GEMINI_TRY_MODELS)]) {
    tried.push(modelName);
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(
        'Reply with JSON only: {"ping":"pong"}'
      );
      const text = result.response.text();
      const parsed = JSON.parse(text);
      if (parsed?.ping !== "pong") {
        lastErr = `${modelName}: unexpected JSON`;
        continue;
      }
      const hint =
        modelName !== GEMINI_TRY_MODELS[0]
          ? ` (set GEMINI_MODEL=${modelName} in .env to skip probing)`
          : "";
      return { ok: true, detail: `${modelName} OK${hint}` };
    } catch (e) {
      lastErr = `${modelName}: ${(e.message || String(e)).split("\n")[0]}`;
    }
  }

  return {
    ok: false,
    detail: `all models failed (tried: ${tried.join(", ")}). Last: ${lastErr}`,
  };
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
    const r = await testGemini();
    line("Gemini (generateContent)", r);
    results.push(r);
  } catch (e) {
    const r = { ok: false, detail: e.message || String(e) };
    line("Gemini (generateContent)", r);
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
