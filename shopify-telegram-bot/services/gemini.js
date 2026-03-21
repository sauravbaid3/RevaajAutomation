const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const modelName =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite-preview";

const model = genAI.getGenerativeModel({
  model: modelName,
  generationConfig: {
    responseMimeType: "application/json",
  },
});

/**
 * @param {string} name
 * @param {string|number} price
 */
async function generateProductFields(name, price) {
  const prompt = `You are a Shopify product listing expert for the Indian e-commerce market.

Generate complete Shopify product listing fields for the following product:
Product name: ${name}
Price: ₹${price}

Return a JSON object with exactly these keys:
{
  description: (string, 150 words, persuasive, written for Indian buyers, highlight quality and value),
  tags: (array of 8-10 relevant strings),
  seo_title: (string, under 70 characters, includes product name),
  seo_description: (string, under 160 characters, compelling),
  product_type: (string, e.g. Furniture, Clothing, Electronics),
  vendor: (string, suggest a suitable generic vendor/brand name),
  weight_grams: (number, estimated shipping weight in grams)
}

Respond with valid JSON only. No explanation, no markdown, no backticks.`;

  async function runOnce() {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text);
  }

  try {
    return await runOnce();
  } catch (firstErr) {
    try {
      return await runOnce();
    } catch (secondErr) {
      throw secondErr;
    }
  }
}

module.exports = { generateProductFields };
