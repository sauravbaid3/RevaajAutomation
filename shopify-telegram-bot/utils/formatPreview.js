/**
 * Escape dynamic text for Telegram legacy Markdown (bold/italic use * and _).
 * @param {string} text
 */
function escapeMarkdown(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

/**
 * @param {string} name
 * @param {string|number} price
 * @param {object} ai
 */
function formatPreview(name, price, ai) {
  const tags = Array.isArray(ai.tags) ? ai.tags.map(escapeMarkdown).join(", ") : "";
  const desc = escapeMarkdown(ai.description);
  return (
    `📦 *Product Preview*\n\n` +
    `*Name:* ${escapeMarkdown(name)}\n` +
    `*Price:* ₹${escapeMarkdown(String(price))}\n` +
    `*Type:* ${escapeMarkdown(ai.product_type)}\n` +
    `*Vendor:* ${escapeMarkdown(ai.vendor)}\n\n` +
    `*Description:*\n${desc}\n\n` +
    `🏷️ *Tags:* ${tags}\n\n` +
    `🔍 *SEO Title:* ${escapeMarkdown(ai.seo_title)}\n` +
    `📄 *SEO Description:* ${escapeMarkdown(ai.seo_description)}\n` +
    `📦 *Est. Weight:* ${escapeMarkdown(String(ai.weight_grams))}g\n\n` +
    `_Does everything look good?_`
  );
}

module.exports = { formatPreview };
