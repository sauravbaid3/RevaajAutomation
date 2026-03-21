const { Markup } = require("telegraf");

const confirmKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("✅ Publish now", "publish")],
  [Markup.button.callback("✏️ Edit description", "edit_description")],
  [Markup.button.callback("❌ Cancel", "cancel")],
]);

const shopMenuKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🏪 Store info", "shop_menu_store"),
    Markup.button.callback("📦 Recent products", "shop_menu_products"),
  ],
  [
    Markup.button.callback("🔢 Product count", "shop_menu_count"),
    Markup.button.callback("➕ Add product", "shop_menu_add"),
  ],
]);

module.exports = { confirmKeyboard, shopMenuKeyboard };
