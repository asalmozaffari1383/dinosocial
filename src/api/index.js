const DEFAULT_BASE_URL = "https://api.dinosocial.ir";

function normalizeBaseUrl(rawValue) {
  const value = (rawValue || "").trim();

  if (!value) return DEFAULT_BASE_URL;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL
);

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
    return response.json();
  }

  const text = await response.text();
  return text ? { raw: text } : {};
}

async function request(path, options = {}, retry = true) {
  const { method = "GET", query, body } = options;

  let response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      headers: body
        ? { "Content-Type": "application/json" }
        : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Failed to reach API at ${API_BASE_URL}`);
  }

  if (response.status === 401 && retry) {
    await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    return request(path, options, false);
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

export const api = {
  getPosts: ({ page = 1, limit = 10 } = {}) =>
    request("/api/posts", {
      query: { page, limit },
    }),
};
