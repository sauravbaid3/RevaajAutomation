const { getSession, resetSession } = require("./sessions");
const { confirmKeyboard, shopMenuKeyboard } = require("./keyboards");
const { generateProductFields } = require("../services/gemini");
const {
  createProduct,
  getShop,
  listRecentProducts,
  searchProductsByTitle,
  getProductsCount,
  getProductById,
  setProductStatus,
} = require("../services/shopify");
const { formatPreview } = require("../utils/formatPreview");
const {
  formatShopHtml,
  formatProductListHtml,
  formatProductDetailHtml,
} = require("../utils/formatShopify");

function log(userId, message) {
  console.log(`[${userId}] ${message}`);
}

function largestPhotoFileId(photos) {
  if (!photos || photos.length === 0) return null;
  return photos[photos.length - 1].file_id;
}

async function sendPreview(ctx, session) {
  const { name, price, mrp, ai } = session.data;
  const text = formatPreview(name, price, mrp, ai);
  await ctx.reply(text, {
    parse_mode: "Markdown",
    ...confirmKeyboard,
  });
}

function restAfterCommand(text) {
  return text.replace(/^\/\w+(@\S+)?\s*/i, "").trim();
}

async function replyShopifyError(ctx, err, userId) {
  log(userId, `shopify cmd error: ${err.message}`);
  const msg = String(err.message || err);
  if (msg.includes("403") || /forbidden/i.test(msg)) {
    await ctx.reply(
      "⚠️ Shopify refused this request. In Dev Dashboard → Versions, add scopes: read_products, write_products — then reinstall the app."
    );
    return;
  }
  if (msg.includes("401")) {
    await ctx.reply("⚠️ Shopify auth failed. Check Client ID/Secret or access token and that the app is installed.");
    return;
  }
  await ctx.reply(`⚠️ Shopify: ${msg.slice(0, 350)}`);
}

async function sendShopMenu(ctx) {
  await ctx.reply("Shopify quick actions:", {
    ...shopMenuKeyboard,
  });
}

function startAddFlow(session) {
  session.step = "ask_name";
  session.data = {};
}

async function registerHandlers(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    log(userId, "command /start");
    await ctx.reply(
      "Welcome! Manage your Shopify store from here.\n\n" +
        "<b>Add products (AI)</b>\n" +
        "/add — name, price ₹, 3 photos → AI preview → publish\n\n" +
        "<b>Shopify</b>\n" +
        "/menu — buttons for common actions\n" +
        "/shop — store name, domain, currency, plan\n" +
        "/products [n] — last n products (default 8, max 15)\n" +
        "/count — total product count\n" +
        "/find &lt;text&gt; — search titles (first 250 products)\n" +
        "/product &lt;id&gt; — details (also /p)\n" +
        "/draft &lt;id&gt; — draft (not published)\n" +
        "/active &lt;id&gt; — active on storefront\n" +
        "/archive &lt;id&gt; — archive product\n\n" +
        "/status — bot wizard step · /cancel — abort add flow",
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "/menu — Shopify menu\n/add — new product with AI\n/shop /products /count /find /product /draft /active /archive\n/status /cancel",
      { parse_mode: "HTML" }
    );
  });

  bot.command("menu", async (ctx) => {
    const userId = ctx.from.id;
    log(userId, "command /menu");
    await sendShopMenu(ctx);
  });

  bot.command("shop", async (ctx) => {
    const userId = ctx.from.id;
    log(userId, "command /shop");
    try {
      const { shop, host } = await getShop();
      await ctx.reply(formatShopHtml(shop, host), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      await replyShopifyError(ctx, e, userId);
    }
  });

  bot.command("products", async (ctx) => {
    const userId = ctx.from.id;
    const arg = restAfterCommand(ctx.message.text).split(/\s+/)[0];
    const n = Math.min(15, Math.max(1, parseInt(arg, 10) || 8));
    log(userId, `command /products limit=${n}`);
    try {
      const { products, host } = await listRecentProducts(n);
      await ctx.reply(
        formatProductListHtml(products, host, `Last ${products.length} products`),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    } catch (e) {
      await replyShopifyError(ctx, e, userId);
    }
  });

  bot.command("count", async (ctx) => {
    const userId = ctx.from.id;
    log(userId, "command /count");
    try {
      const count = await getProductsCount();
      await ctx.reply(`📊 <b>Products in catalog:</b> ${count}`, {
        parse_mode: "HTML",
      });
    } catch (e) {
      await replyShopifyError(ctx, e, userId);
    }
  });

  bot.command("find", async (ctx) => {
    const userId = ctx.from.id;
    const q = restAfterCommand(ctx.message.text);
    log(userId, `command /find q=${q.slice(0, 60)}`);
    if (!q) {
      await ctx.reply("Usage: <code>/find gold ring</code>\n<i>Searches titles among the 250 most recently returned products.</i>", {
        parse_mode: "HTML",
      });
      return;
    }
    try {
      const { products, host } = await searchProductsByTitle(q, 12);
      await ctx.reply(
        formatProductListHtml(products, host, `Search: “${q}”`),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    } catch (e) {
      await replyShopifyError(ctx, e, userId);
    }
  });

  const productDetailHandler = async (ctx) => {
    const userId = ctx.from.id;
    const id = restAfterCommand(ctx.message.text).split(/\s+/)[0];
    log(userId, `command /product id=${id}`);
    if (!id || !/^\d+$/.test(id)) {
      await ctx.reply("Usage: <code>/product 123456789</code> (numeric Shopify product ID)", {
        parse_mode: "HTML",
      });
      return;
    }
    try {
      const row = await getProductById(id);
      if (!row) {
        await ctx.reply("No product with that ID.");
        return;
      }
      await ctx.reply(formatProductDetailHtml(row.product, row.host), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      await replyShopifyError(ctx, e, userId);
    }
  };
  bot.command("product", productDetailHandler);
  bot.command("p", productDetailHandler);

  const statusChangeHandler = (apiStatus, commandLabel) => async (ctx) => {
    const userId = ctx.from.id;
    const label = commandLabel || apiStatus;
    const id = restAfterCommand(ctx.message.text).split(/\s+/)[0];
    log(userId, `command /${label} id=${id}`);
    if (!id || !/^\d+$/.test(id)) {
      await ctx.reply(`Usage: <code>/${label} 123456789</code>`, { parse_mode: "HTML" });
      return;
    }
    try {
      const { product, host } = await setProductStatus(id, apiStatus);
      await ctx.reply(
        `✅ Product <b>${product.title}</b> is now <b>${apiStatus}</b>.\n` +
          `<a href="https://${host}/admin/products/${product.id}">Open in Admin</a>`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    } catch (e) {
      await replyShopifyError(ctx, e, userId);
    }
  };
  bot.command("draft", statusChangeHandler("draft", "draft"));
  bot.command("active", statusChangeHandler("active", "active"));
  bot.command("archive", statusChangeHandler("archived", "archive"));

  bot.command("add", async (ctx) => {
    const userId = ctx.from.id;
    log(userId, "command /add");
    const session = getSession(userId);
    startAddFlow(session);
    await ctx.reply("What is the product name?");
  });

  bot.command("cancel", async (ctx) => {
    const userId = ctx.from.id;
    log(userId, "command /cancel");
    resetSession(userId);
    await ctx.reply("❌ Cancelled. Send /add to start again.");
  });

  bot.command("status", async (ctx) => {
    const userId = ctx.from.id;
    const session = getSession(userId);
    log(userId, `command /status step=${session.step}`);
    await ctx.reply(`Current step: \`${session.step}\``, { parse_mode: "Markdown" });
  });

  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();
    const session = getSession(userId);

    if (data === "shop_menu_store") {
      log(userId, "callback shop_menu_store");
      try {
        const { shop, host } = await getShop();
        await ctx.reply(formatShopHtml(shop, host), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      } catch (e) {
        await replyShopifyError(ctx, e, userId);
      }
      return;
    }

    if (data === "shop_menu_products") {
      log(userId, "callback shop_menu_products");
      try {
        const { products, host } = await listRecentProducts(8);
        await ctx.reply(
          formatProductListHtml(products, host, "Last products"),
          { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
        );
      } catch (e) {
        await replyShopifyError(ctx, e, userId);
      }
      return;
    }

    if (data === "shop_menu_count") {
      log(userId, "callback shop_menu_count");
      try {
        const count = await getProductsCount();
        await ctx.reply(`📊 <b>Products in catalog:</b> ${count}`, {
          parse_mode: "HTML",
        });
      } catch (e) {
        await replyShopifyError(ctx, e, userId);
      }
      return;
    }

    if (data === "shop_menu_add") {
      log(userId, "callback shop_menu_add");
      startAddFlow(session);
      await ctx.reply("What is the product name?");
      return;
    }

    if (data === "publish") {
      if (session.step !== "confirming" || !session.data.ai) {
        log(userId, "callback publish ignored (wrong state)");
        return;
      }
      log(userId, "callback publish");
      try {
        const result = await createProduct(session.data);
        await ctx.reply(`✅ Product is LIVE!\n🔗 ${result.url}`);
        resetSession(userId);
        log(userId, "publish success");
      } catch (err) {
        log(userId, `publish error: ${err.message}`);
        if (err.message && err.message.startsWith("download_failed")) {
          const n = err.photoIndex || "?";
          await ctx.reply(`⚠️ Could not download photo ${n}. Please try again with /add`);
        } else {
          await ctx.reply(
            "⚠️ Could not publish to Shopify. Check your store credentials."
          );
        }
        resetSession(userId);
      }
      return;
    }

    if (data === "edit_description") {
      if (session.step !== "confirming") {
        log(userId, "callback edit_description ignored");
        return;
      }
      log(userId, "callback edit_description");
      session.data.editing = "description";
      await ctx.reply("Send me the new description:");
      return;
    }

    if (data === "cancel") {
      log(userId, "callback cancel");
      resetSession(userId);
      await ctx.reply("❌ Cancelled. Send /add to start again.");
    }
  });

  bot.on("document", async (ctx) => {
    const userId = ctx.from.id;
    const session = getSession(userId);
    if (session.step !== "ask_photos") return;
    log(userId, "document in ask_photos — reject");
    await ctx.reply("Please send a photo, not a file");
  });

  bot.on("photo", async (ctx) => {
    const userId = ctx.from.id;
    const session = getSession(userId);
    if (session.step !== "ask_photos") return;

    const fileId = largestPhotoFileId(ctx.message.photo);
    if (!fileId) return;

    log(userId, `photo received (${(session.data.photos || []).length + 1}/3)`);
    let url;
    try {
      url = await ctx.telegram.getFileLink(fileId);
    } catch (e) {
      log(userId, `getFileLink error: ${e.message}`);
      await ctx.reply("⚠️ Could not read that photo. Please try again with /add");
      resetSession(userId);
      return;
    }

    if (!session.data.photos) session.data.photos = [];
    session.data.photos.push(String(url));

    const n = session.data.photos.length;
    if (n < 3) {
      await ctx.reply(`Got photo ${n}. Send photo ${n + 1} of 3`);
      return;
    }

    session.step = "confirming";
    await ctx.reply("Generating product details with AI...");

    try {
      const ai = await generateProductFields(session.data.name, session.data.price,session.data.mrp);
      session.data.ai = ai;
      log(userId, "AI generation ok");
      await sendPreview(ctx, session);
    } catch (e) {
      log(userId, `AI generation error: ${e.message}`);
      await ctx.reply("⚠️ AI generation failed. Try again with /add");
      resetSession(userId);
    }
  });

  bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const text = (ctx.message.text || "").trim();
    if (text.startsWith("/")) return;

    const session = getSession(userId);

    if (session.step === "ask_name") {
      log(userId, `name: ${text.slice(0, 80)}`);
      session.data.name = text;
      session.step = "ask_mrp"; // Move to MRP first
      await ctx.reply("What is the MRP? (The original strike-through price ₹)");
      return;
    }
    if (session.step === "ask_mrp") {
      const num = parseFloat(text.replace(/,/g, ""));
      if (Number.isNaN(num) || num < 0) {
        await ctx.reply("Please send a valid number for the MRP.");
        return;
      }
      session.data.mrp = num; // This will be 'compare_at_price'
      session.step = "ask_price";
      await ctx.reply("What is the Selling Price? (The actual price the customer pays ₹)");
      return;
    }

    if (session.step === "ask_price") {
      const num = parseFloat(text.replace(/,/g, ""));
      if (Number.isNaN(num) || num < 0) {
        await ctx.reply("Please send a valid number for the selling price.");
        return;
      }
      
      // Validation: Selling price shouldn't really be higher than MRP
      if (num > session.data.mrp) {
        await ctx.reply("⚠️ Note: Selling price is higher than MRP. Is this intended? If not, send the price again.");
      }
    
      session.data.price = num; // This will be 'price'
      session.step = "ask_photos";
      session.data.photos = [];
      await ctx.reply("Send me 3 photos one by one. (Photo 1 of 3)");
      return;
    }
    if (session.step === "ask_photos") {
      log(userId, "text in ask_photos — reject");
      await ctx.reply("Please send a photo right now, not text");
      return;
    }

    if (session.step === "confirming") {
      if (session.data.editing === "description") {
        log(userId, "description edit");
        session.data.ai.description = text;
        delete session.data.editing;
        await sendPreview(ctx, session);
        return;
      }
      await ctx.reply("Please use the buttons above");
      return;
    }

    if (session.step === "idle") {
      await ctx.reply("Use /menu for Shopify tools or /add to create a product.");
    }
  });
}

module.exports = { registerHandlers };
