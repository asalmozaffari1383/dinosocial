const DEFAULT_BASE_URL = "https://dinosocial.ir";
const ACCESS_TOKEN_KEY = "dinosocial_access_token";
const REFRESH_TOKEN_KEY = "dinosocial_refresh_token";

let unauthorizedHandler = null;
let refreshInFlightPromise = null;

function normalizeBaseUrl(rawValue) {
  const value = (rawValue || "").trim();

  if (!value) return DEFAULT_BASE_URL;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

function readStorage(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc).
  }
}

let accessToken = readStorage(ACCESS_TOKEN_KEY);
let refreshToken = readStorage(REFRESH_TOKEN_KEY);

function setTokens(nextAccessToken, nextRefreshToken = refreshToken) {
  accessToken = nextAccessToken || "";
  refreshToken = nextRefreshToken || "";
  writeStorage(ACCESS_TOKEN_KEY, accessToken);
  writeStorage(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens() {
  setTokens("", "");
}

function buildUrl(path, query) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  const text = await response.text();
  return text ? { raw: text } : {};
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getTokenFromPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  return payload.access_token || payload.token || "";
}

function getRefreshTokenFromPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  return payload.refresh_token || "";
}

async function doRefreshRequest() {
  if (!refreshToken) return false;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(refreshToken),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return false;
  }

  const data = await parseResponse(response);
  if (!response.ok) return false;

  const nextAccessToken = getTokenFromPayload(data);
  const nextRefreshToken = getRefreshTokenFromPayload(data) || refreshToken;

  if (!nextAccessToken) return false;

  setTokens(nextAccessToken, nextRefreshToken);
  return true;
}

async function refreshAccessToken() {
  if (!refreshToken) return false;

  if (!refreshInFlightPromise) {
    refreshInFlightPromise = doRefreshRequest().finally(() => {
      refreshInFlightPromise = null;
    });
  }

  return refreshInFlightPromise;
}

async function request(path, options = {}, retry = true) {
  const { method = "GET", query, body, includeAuth = true } = options;

  const headers = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(includeAuth ? authHeader(accessToken) : {}),
  };

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Failed to reach API at ${API_BASE_URL}`, 0, null);
  }

  if (response.status === 401 && retry && includeAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, options, false);
    }
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && typeof unauthorizedHandler === "function") {
      clearTokens();
      unauthorizedHandler();
    }

    throw new ApiError(
      data?.error || data?.message || `Request failed (${response.status})`,
      response.status,
      data
    );
  }

  return data;
}

export const api = {
  setUnauthorizedHandler: (handler) => {
    unauthorizedHandler = handler;
  },

  hasSession: () => Boolean(accessToken || refreshToken),

  bootstrapAuth: async () => {
    if (accessToken) return true;
    return refreshAccessToken();
  },

  login: async ({ username, password }) => {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: { username, password },
      includeAuth: false,
    });

    const nextAccessToken = getTokenFromPayload(data);
    const nextRefreshToken = getRefreshTokenFromPayload(data);

    if (!nextAccessToken) {
      throw new ApiError("Login succeeded but access token was missing", 500, data);
    }

    setTokens(nextAccessToken, nextRefreshToken);
    return data;
  },

  logout: async () => {
    try {
      await request("/api/auth/logout", {
        method: "POST",
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      });
    } finally {
      clearTokens();
    }
  },

  getMe: () =>
    request("/api/contacts"),

  getPosts: ({ page = 1, limit = 10 } = {}) =>
    request("/api/posts", {
      query: { page, limit },
      includeAuth: false,
    }),

  getComments: ({ postId }) =>
    request(`/api/posts/${postId}/comments`, {
      includeAuth: false,
    }),

  createComment: ({ postId, text, parentId = null }) =>
    request(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: { text, parent_id: parentId },
    }),

  vote: ({ targetType, targetId, value }) =>
    request("/api/votes", {
      method: "POST",
      body: {
        target_type: targetType,
        target_id: targetId,
        value,
      },
    }),
};

export { ApiError };
