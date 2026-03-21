const { escapeHtml } = require("./escapeHtml");

function storefrontProductUrl(host, handle) {
  return `https://${host}/products/${handle}`;
}

function adminProductUrl(host, productId) {
  return `https://${host}/admin/products/${productId}`;
}

function formatShopHtml(shop, host) {
  const currency = shop.currency || "—";
  const plan = shop.plan_name || shop.plan_display_name || "—";
  const email = shop.email ? escapeHtml(shop.email) : "—";
  return (
    `<b>🏪 Store</b>\n` +
    `<b>Name:</b> ${escapeHtml(shop.name || "—")}\n` +
    `<b>Domain:</b> ${escapeHtml(host)}\n` +
    `<b>Email:</b> ${email}\n` +
    `<b>Currency:</b> ${escapeHtml(String(currency))}\n` +
    `<b>Plan:</b> ${escapeHtml(String(plan))}\n` +
    `<b>Timezone:</b> ${escapeHtml(shop.iana_timezone || shop.timezone || "—")}`
  );
}

function variantPriceLine(variants) {
  if (!variants || !variants.length) return "—";
  const v = variants[0];
  const p = v.price != null ? v.price : "—";
  return `${p}`;
}

function formatProductListHtml(products, host, title) {
  if (!products.length) {
    return `<b>${escapeHtml(title)}</b>\nNo products found.`;
  }
  const lines = products.map((p) => {
    const url = storefrontProductUrl(host, p.handle);
    const admin = adminProductUrl(host, p.id);
    const price = variantPriceLine(p.variants);
    return (
      `• <a href="${escapeHtml(url)}">${escapeHtml(p.title)}</a>\n` +
      `  <code>${p.id}</code> · ${escapeHtml(p.status)} · ${escapeHtml(String(price))}\n` +
      `  <a href="${escapeHtml(admin)}">Admin</a>`
    );
  });
  return `<b>${escapeHtml(title)}</b>\n\n${lines.join("\n\n")}`;
}

function stripHtmlBrief(html, max = 350) {
  const t = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatProductDetailHtml(product, host) {
  const url = storefrontProductUrl(host, product.handle);
  const admin = adminProductUrl(host, product.id);
  const price = variantPriceLine(product.variants);
  const tags = product.tags ? escapeHtml(String(product.tags).slice(0, 200)) : "—";
  const desc = escapeHtml(stripHtmlBrief(product.body_html));
  return (
    `<b>${escapeHtml(product.title)}</b>\n` +
    `<b>ID:</b> <code>${product.id}</code>\n` +
    `<b>Status:</b> ${escapeHtml(product.status)}\n` +
    `<b>Handle:</b> ${escapeHtml(product.handle)}\n` +
    `<b>Price (1st variant):</b> ${escapeHtml(String(price))}\n` +
    `<b>Vendor:</b> ${escapeHtml(product.vendor || "—")}\n` +
    `<b>Type:</b> ${escapeHtml(product.product_type || "—")}\n` +
    `<b>Tags:</b> ${tags}\n\n` +
    `<b>Description:</b>\n${desc}\n\n` +
    `<a href="${escapeHtml(url)}">Storefront</a> · <a href="${escapeHtml(admin)}">Admin</a>`
  );
}

module.exports = {
  formatShopHtml,
  formatProductListHtml,
  formatProductDetailHtml,
  storefrontProductUrl,
  adminProductUrl,
};
