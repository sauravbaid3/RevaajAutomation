const axios = require("axios");

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = "grok-4.3";
const XAI_API_KEY = (process.env.XAI_API_KEY || "").trim();

function parseModelJson(raw) {
  const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function generateProductFields(imageUrls, price, mrp) {
  try {
    if (!XAI_API_KEY) {
      throw new Error("Missing XAI_API_KEY");
    }

    const prompt = `You are an expert product cataloger for "Revaaj", a premium Indian brand.
      Based on these photos, generate a high-converting Shopify listing.
      Selling Price: ₹${price}
      MRP: ₹${mrp}

      Return a JSON object with exactly these keys:
      {
        "name": "Catchy Product Title",
        "description": "HTML description with <b> and <ul> tags",
        "tags": ["array of 8 tags"],
        "seo_title": "SEO title",
        "seo_description": "SEO desc",
        "product_type": "Jewelry",
        "weight_grams": choose between 130 to 200
      }
      Return only valid JSON with no markdown.`;

    const content = [
      { type: "text", text: prompt },
      ...imageUrls.map((url) => ({
        type: "image_url",
        image_url: { url },
      })),
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
