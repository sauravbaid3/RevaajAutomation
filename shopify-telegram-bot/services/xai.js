const axios = require("axios");

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = "grok-4.3";
const XAI_API_KEY = (process.env.XAI_API_KEY || "").trim();
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function parseModelJson(raw) {
  const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function inferMimeTypeFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  } catch (_) {}

  return "image/jpeg";
}

async function imageUrlToDataUrl(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const headerMimeType = String(response.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  const mimeType = SUPPORTED_IMAGE_MIME_TYPES.has(headerMimeType)
    ? headerMimeType
    : inferMimeTypeFromUrl(url);

  const base64 = Buffer.from(response.data).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function generateProductFields(imageUrls, price, mrp) {
  try {
    if (!XAI_API_KEY) {
      throw new Error("Missing XAI_API_KEY");
    }

    const prompt = `You are an expert product cataloger for Revaaj, a premium Indian fashion and jewelry brand.

Based on this product photo, generate a high-converting Shopify listing optimized for SEO.

Selling Price: ₹${price}
MRP: ₹${mrp}

Return a JSON object with exactly these keys:
{
  "name": "Catchy Product Title",
  "handle": "seo-friendly-product-handle",
  "description": "HTML description with <b> and <ul> tags",
  "tags": ["array of 8 seo-friendly tags"],
  "seo_title": "SEO optimized title",
  "seo_description": "SEO optimized meta description",
  "image_alt_text": "Descriptive SEO-friendly alt text for product image",
  "product_type": "Jewelry",
  "weight_grams": 150
}

Rules:
- Handle must be lowercase with hyphens only.
- Alt text should clearly describe the product for Google Images SEO.
- Description should be conversion focused.
- Return only valid JSON with no markdown.`;

    const firstImageUrl = imageUrls?.[0];

    if (!firstImageUrl) {
      throw new Error("No product image provided.");
    }

    const normalizedImageUrl = await imageUrlToDataUrl(firstImageUrl);

    const content = [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: { url: normalizedImageUrl },
      },
    ];

    const response = await axios.post(
      XAI_CHAT_URL,
      {
        model: XAI_MODEL,
        messages: [{ role: "user", content }],
        max_completion_tokens: 2048,
        temperature: 0.4,
      },
      {
        headers: {
          Authorization: `Bearer ${XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    const raw = response?.data?.choices?.[0]?.message?.content;
    return parseModelJson(raw);
  } catch (error) {
    console.error(
      "xAI generation error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to generate AI product details.");
  }
}

module.exports = { generateProductFields };
