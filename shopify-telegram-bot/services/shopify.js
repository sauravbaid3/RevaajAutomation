const axios = require("axios");

const STORE = process.env.SHOPIFY_STORE?.trim();
const API_VERSION = "2024-01";

/** @type {string|null} */
let cachedAccessToken = null;
/** @type {number} */
let cachedTokenExpiresAt = 0;

function shopSubdomain() {
  if (!STORE) return null;
  const s = STORE.toLowerCase().replace(/^https?:\/\//, "");
  if (s.endsWith(".myshopify.com")) {
    return s.slice(0, -".myshopify.com".length);
  }
  return s.split("/")[0] || null;
}

function shopHost() {
  const sub = shopSubdomain();
  return sub ? `${sub}.myshopify.com` : null;
}

async function getAccessToken() {
  const staticToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (staticToken) return staticToken;

  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set SHOPIFY_ACCESS_TOKEN or both SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET"
    );
  }

  const shop = shopSubdomain();
  if (!shop) {
    throw new Error("SHOPIFY_STORE must be your-store or your-store.myshopify.com");
  }

  const now = Date.now();
  if (cachedAccessToken && now < cachedTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const tokenUrl = `https://${shop}.myshopify.com/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post(tokenUrl, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (res.status < 200 || res.status >= 300) {
    const raw = String(res.data || res.statusText || "");
    const oauth =
      raw.match(/Oauth error ([^<\n]+)/i)?.[1]?.trim() ||
      raw.match(/<title>[^<]*Oauth error[^<]*<\/title>/i)?.[0];
    const detail = oauth
      ? `Oauth error ${oauth}`
      : raw.length > 200
        ? `${raw.slice(0, 200)}…`
        : raw;
    throw new Error(`Shopify token request failed (${res.status}): ${detail}`);
  }

  const { access_token, expires_in } = res.data;
  if (!access_token) {
    throw new Error("Shopify token response missing access_token");
  }

  cachedAccessToken = access_token;
  cachedTokenExpiresAt = now + (Number(expires_in) || 86400) * 1000;
  return cachedAccessToken;
}

function invalidateCachedToken() {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
}

async function createProduct(data) {
  const images = [];

  for (let i = 0; i < data.photos.length; i++) {
    const url = data.photos[i];

    let res;
    try {
      res = await axios.get(url, {
        responseType: "arraybuffer",
        maxRedirects: 5,
        timeout: 60000,
        validateStatus: () => true,
      });
    } catch {
      const err = new Error(`download_failed_${i + 1}`);
      err.photoIndex = i + 1;
      throw err;
    }

    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`download_failed_${i + 1}`);
      err.photoIndex = i + 1;
      throw err;
    }

    const b64 = Buffer.from(res.data).toString("base64");

    images.push({
      attachment: b64,
      position: i + 1,
      alt: `${data.ai.image_alt_text || data.name} ${i + 1}`,
    });
  }

  const priceStr = typeof data.price === "number"
    ? data.price.toFixed(2)
    : String(data.price).trim();

  const mrpStr = typeof data.mrp === "number"
    ? data.mrp.toFixed(2)
    : String(data.mrp).trim();

  const payload = {
    product: {
      title: data.name,
      handle: data.ai.handle,
      body_html: data.ai.description,
      vendor: "Revaaj",
      product_type: data.ai.product_type,
      status: "active",
      tags: data.ai.tags.join(", "),
      variants: [
        {
          price: priceStr,
          compare_at_price: mrpStr,
          weight: data.ai.weight_grams,
          weight_unit: "g",
          inventory_management: "shopify",
          inventory_quantity: 100,
        },
      ],
      images,
      metafields: [
        {
          namespace: "global",
          key: "title_tag",
          value: data.ai.seo_title,
          type: "single_line_text_field",
        },
        {
          namespace: "global",
          key: "description_tag",
          value: data.ai.seo_description,
          type: "single_line_text_field",
        },
      ],
    },
  };

  const host = shopHost();

  if (!host) {
    throw new Error("SHOPIFY_STORE is not set or invalid");
  }

  const endpoint = `https://${host}/admin/api/${API_VERSION}/products.json`;

  const postOnce = (token) =>
    axios.post(endpoint, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      timeout: 120000,
      validateStatus: () => true,
    });

  let token = await getAccessToken();
  let response = await postOnce(token);

  if (response.status === 401 && process.env.SHOPIFY_CLIENT_ID) {
    invalidateCachedToken();
    token = await getAccessToken();
    response = await postOnce(token);
  }

  if (response.status < 200 || response.status >= 300) {
    const msg = response.data?.errors || response.statusText || "Shopify API error";
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = response.status;
    err.data = response.data;
    throw err;
  }

  const product = response.data.product;
  const handle = product.handle;
  const url = `https://${host}/products/${handle}`;

  return {
    id: product.id,
    title: product.title,
    url,
  };
}

module.exports = {
  createProduct,
  getAccessToken,
  invalidateCachedToken,
  shopHost,
};
