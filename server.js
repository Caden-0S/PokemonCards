const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { URL } = require("url");

const port = Number(process.env.PORT || 8080);
const root = path.join(__dirname, "public");
const clientId = process.env.EBAY_CLIENT_ID;
const clientSecret = process.env.EBAY_CLIENT_SECRET;
const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
const oauthScope =
  process.env.EBAY_OAUTH_SCOPE ||
  "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI ||
  `http://localhost:${port}/auth/google/callback`;
const userDataDirectory = path.join(root, ".data");
const userDataPath = path.join(userDataDirectory, "users.json");
let tokenCache = null;
const googleStates = new Map();
const googleSessions = new Map();
fs.mkdirSync(userDataDirectory, { recursive: true });

function readUserStore() {
  try {
    return JSON.parse(fs.readFileSync(userDataPath, "utf8"));
  } catch (error) {
    return {};
  }
}

const userStore = readUserStore();

function saveUserStore() {
  fs.writeFileSync(userDataPath, JSON.stringify(userStore, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function requestJson(options, body = "") {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (responseBody += chunk));
      response.on("end", () => {
        let payload;
        try {
          payload = JSON.parse(responseBody);
        } catch (error) {
          reject(
            new Error(`eBay returned invalid JSON (${response.statusCode})`),
          );
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(
            new Error(
              payload.errors?.[0]?.longMessage ||
                `eBay request failed (${response.statusCode})`,
            ),
          );
          return;
        }
        resolve(payload);
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: oauthScope,
  }).toString();
  const payload = await requestJson(
    {
      hostname: "api.ebay.com",
      path: "/identity/v1/oauth2/token",
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body,
  );
  tokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(payload.expires_in - 60, 60) * 1000,
  };
  return tokenCache.value;
}

function getPrice(item) {
  const value = Number(item.salePrice?.value || item.price?.value || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "").split(";").flatMap((cookie) => {
      const separator = cookie.indexOf("=");
      if (separator < 0) return [];
      return [
        [
          cookie.slice(0, separator).trim(),
          decodeURIComponent(cookie.slice(separator + 1).trim()),
        ],
      ];
    }),
  );
}

function getSessionUser(request) {
  const session = googleSessions.get(
    parseCookies(request).binderly_google_session,
  );
  return session ? userStore[session.userId] : null;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function redirectWithError(response, message) {
  response.writeHead(302, {
    Location: `/?auth_error=${encodeURIComponent(message)}`,
  });
  response.end();
}

async function exchangeGoogleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId,
    client_secret: googleClientSecret,
    redirect_uri: googleRedirectUri,
    grant_type: "authorization_code",
  }).toString();
  const token = await requestJson(
    {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body,
  );
  return requestJson({
    hostname: "openidconnect.googleapis.com",
    path: "/v1/userinfo",
    method: "GET",
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
}

async function getLastSoldPrice(query) {
  const token = await getAccessToken();
  const search = new URLSearchParams({
    q: query,
    limit: "20",
    sort: "-saleDate",
  });
  const payload = await requestJson({
    hostname: "api.ebay.com",
    path: `/buy/marketplace-insights/v1_beta/item_sales/search?${search}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
    },
  });
  const sale = (payload.itemSales || []).find((item) => getPrice(item));
  if (!sale) return { price: null, sampleSize: 0 };
  return {
    price: getPrice(sale),
    currency: sale.salePrice?.currency || sale.price?.currency || "USD",
    soldAt: sale.soldDate || sale.saleDate || null,
    sampleSize: payload.total ?? payload.itemSales?.length ?? 0,
  };
}

function serveStatic(request, response) {
  const requestPath = new URL(request.url, `http://${request.headers.host}`)
    .pathname;
  const relativePath =
    requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const types = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    response.writeHead(200, {
      "Content-Type":
        types[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && requestUrl.pathname === "/auth/google") {
    if (!googleClientId || !googleClientSecret) {
      redirectWithError(response, "Google authentication is not configured.");
      return;
    }
    const state = randomUUID();
    googleStates.set(state, Date.now());
    const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleUrl.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: googleRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });
    response.writeHead(302, { Location: googleUrl.toString() });
    response.end();
    return;
  }
  if (
    request.method === "GET" &&
    requestUrl.pathname === "/auth/google/callback"
  ) {
    const stateCreatedAt = googleStates.get(
      requestUrl.searchParams.get("state"),
    );
    googleStates.delete(requestUrl.searchParams.get("state"));
    if (!stateCreatedAt || Date.now() - stateCreatedAt > 10 * 60 * 1000) {
      redirectWithError(response, "Google authentication expired. Try again.");
      return;
    }
    if (requestUrl.searchParams.get("error")) {
      redirectWithError(response, "Google authentication was cancelled.");
      return;
    }
    try {
      const user = await exchangeGoogleCode(
        requestUrl.searchParams.get("code"),
      );
      const userId = `google:${user.sub}`;
      if (!userStore[userId]) {
        userStore[userId] = {
          id: userId,
          email: user.email,
          displayName: user.name || user.email,
          wishlist: [],
          psaGrades: {},
          ownedIds: [],
        };
      } else {
        userStore[userId].email = user.email;
      }
      saveUserStore();
      const sessionId = randomUUID();
      googleSessions.set(sessionId, { userId });
      response.writeHead(302, {
        "Set-Cookie": `binderly_google_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`,
        Location: "/",
      });
      response.end();
    } catch (error) {
      redirectWithError(
        response,
        "Google authentication could not be completed.",
      );
    }
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/auth/session") {
    const user = getSessionUser(request);
    if (!user) {
      sendJson(response, 401, { authenticated: false });
      return;
    }
    sendJson(response, 200, {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/account") {
    const user = getSessionUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Authentication required" });
      return;
    }
    sendJson(response, 200, {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      data: {
        wishlist: user.wishlist,
        psaGrades: user.psaGrades,
        ownedIds: user.ownedIds,
      },
    });
    return;
  }
  if (request.method === "PUT" && requestUrl.pathname === "/api/account") {
    const user = getSessionUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Authentication required" });
      return;
    }
    try {
      const payload = await readRequestBody(request);
      if (typeof payload.displayName === "string") {
        const displayName = payload.displayName.trim();
        if (!displayName || displayName.length > 40) {
          sendJson(response, 400, {
            error: "Display name must be 1-40 characters",
          });
          return;
        }
        user.displayName = displayName;
      }
      if (payload.data) {
        if (Array.isArray(payload.data.wishlist))
          user.wishlist = payload.data.wishlist;
        if (
          payload.data.psaGrades &&
          typeof payload.data.psaGrades === "object"
        )
          user.psaGrades = payload.data.psaGrades;
        if (Array.isArray(payload.data.ownedIds))
          user.ownedIds = payload.data.ownedIds;
      }
      saveUserStore();
      sendJson(response, 200, {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        data: {
          wishlist: user.wishlist,
          psaGrades: user.psaGrades,
          ownedIds: user.ownedIds,
        },
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    const sessionId = parseCookies(request).binderly_google_session;
    googleSessions.delete(sessionId);
    response.writeHead(204, {
      "Set-Cookie":
        "binderly_google_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/",
    });
    response.end();
    return;
  }
  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/ebay-last-sold"
  ) {
    if (!clientId || !clientSecret) {
      sendJson(response, 503, {
        error: "eBay API credentials are not configured",
      });
      return;
    }
    const query = requestUrl.searchParams.get("query")?.trim();
    if (!query) {
      sendJson(response, 400, { error: "A card query is required" });
      return;
    }
    try {
      sendJson(response, 200, await getLastSoldPrice(query));
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }
  if (request.method === "GET") serveStatic(request, response);
  else sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`Binderly running at http://localhost:${port}`);
});
