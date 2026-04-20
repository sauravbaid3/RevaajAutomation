const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Enforce JSON mode natively so the model never outputs markdown or conversational text
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  }
});

async function generateProductFields(imageUrls, price, mrp) {
  try {
    // 1. Download images and convert to Base64 for Gemini
    const imageParts = await Promise.all(
      imageUrls.map(async (url) => {
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 15000 // Prevents the bot from hanging if Telegram servers are slow
        });

        return {
          inlineData: {
            data: Buffer.from(response.data).toString("base64"),
            mimeType: "image/jpeg",
          },
        };
      })
    );

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
      }`;

    const result = await model.generateContent([prompt, ...imageParts]);
    let text = result.response.text();

    // Fallback cleanup (usually unnecessary with responseMimeType, but good for safety)
    text = text.replace(/```json|```/g, "").trim();

    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Generation Error:", error.message);
    throw new Error("Failed to generate AI product details.");
  }
}

module.exports = { generateProductFields };