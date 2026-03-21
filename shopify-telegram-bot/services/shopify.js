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

/**
 * Legacy: set SHOPIFY_ACCESS_TOKEN (e.g. shpat_… from a custom app).
 * Dev Dashboard: set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET; token is fetched via OAuth client_credentials (24h TTL, cached).
 */
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

/**
 * @param {object} data
 * @param {string} data.name
 * @param {string|number} data.price
 * @param {string[]} data.photos
 * @param {object} data.ai
 */
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
    images.push({ attachment: b64, position: i + 1 });
  }

  const priceStr =
    typeof data.price === "number"
      ? data.price.toFixed(2)
      : String(data.price).trim();

  const payload = {
    product: {
      title: data.name,
      body_html: data.ai.description,
      vendor: data.ai.vendor,
      product_type: data.ai.product_type,
      status: "active",
      tags: data.ai.tags.join(", "),
      variants: [
        {
          price: priceStr,
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
    const msg =
      response.data?.errors ||
      response.statusText ||
      "Shopify API error";
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

async function adminRequest(method, path, { query, data } = {}) {
  const host = shopHost();
  if (!host) throw new Error("SHOPIFY_STORE is not set or invalid");

  const buildConfig = (token) => {
    const headers = { "X-Shopify-Access-Token": token };
    if (method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
    }
    return {
      method,
      url: `https://${host}/admin/api/${API_VERSION}${path}`,
      headers,
      params: query,
      data: data !== undefined ? data : undefined,
      timeout: 60000,
      validateStatus: () => true,
    };
  };

  let token = await getAccessToken();
  let res = await axios(buildConfig(token));

  if (res.status === 401 && process.env.SHOPIFY_CLIENT_ID) {
    invalidateCachedToken();
    token = await getAccessToken();
    res = await axios(buildConfig(token));
  }

  return { res, host };
}

async function getShop() {
  const { res, host } = await adminRequest("GET", "/shop.json");
  if (res.status !== 200) {
    const err = new Error(shopifyErrorMessage(res));
    err.status = res.status;
    throw err;
  }
  return { shop: res.data.shop, host };
}

async function listRecentProducts(limit = 8) {
  const cap = Math.min(50, Math.max(1, limit));
  const { res, host } = await adminRequest("GET", "/products.json", {
    query: {
      limit: cap,
      status: "any",
      fields: "id,title,handle,status,variants,updated_at",
    },
  });
  if (res.status !== 200) {
    const err = new Error(shopifyErrorMessage(res));
    err.status = res.status;
    throw err;
  }
  return { products: res.data.products || [], host };
}

/** Substring match on titles (first page of products, max 250 — fine for small/medium catalogs). */
async function searchProductsByTitle(titleQuery, limit = 10) {
  const q = String(titleQuery).trim().toLowerCase();
  if (!q) return { products: [], host: shopHost() };
  const { res, host } = await adminRequest("GET", "/products.json", {
    query: {
      limit: 250,
      status: "any",
      fields: "id,title,handle,status,variants",
    },
  });
  if (res.status !== 200) {
    const err = new Error(shopifyErrorMessage(res));
    err.status = res.status;
    throw err;
  }
  const matched = (res.data.products || [])
    .filter((p) => p.title && p.title.toLowerCase().includes(q))
    .slice(0, Math.min(15, limit));
  return { products: matched, host };
}

async function getProductsCount() {
  const { res } = await adminRequest("GET", "/products/count.json", {
    query: { published_status: "any" },
  });
  if (res.status !== 200) {
    const err = new Error(shopifyErrorMessage(res));
    err.status = res.status;
    throw err;
  }
  return res.data.count;
}

async function getProductById(productId) {
  const { res, host } = await adminRequest(
    "GET",
    `/products/${productId}.json`,
    { query: { fields: "id,title,handle,status,body_html,vendor,product_type,tags,variants,images" } }
  );
  if (res.status === 404) return null;
  if (res.status !== 200) {
    const err = new Error(shopifyErrorMessage(res));
    err.status = res.status;
    throw err;
  }
  return { product: res.data.product, host };
}

async function setProductStatus(productId, status) {
  const allowed = ["active", "draft", "archived"];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const { res, host } = await adminRequest("PUT", `/products/${productId}.json`, {
    data: { product: { id: Number(productId), status } },
  });
  if (res.status !== 200) {
    const err = new Error(shopifyErrorMessage(res));
    err.status = res.status;
    err.data = res.data;
    throw err;
  }
  return { product: res.data.product, host };
}

function shopifyErrorMessage(res) {
  const d = res.data;
  if (d?.errors) {
    return typeof d.errors === "string"
      ? d.errors
      : JSON.stringify(d.errors);
  }
  return res.statusText || `HTTP ${res.status}`;
}

module.exports = {
  createProduct,
  getAccessToken,
  invalidateCachedToken,
  getShop,
  listRecentProducts,
  searchProductsByTitle,
  getProductsCount,
  getProductById,
  setProductStatus,
  shopHost,
};
