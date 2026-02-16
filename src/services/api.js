const DEFAULT_BASE_URL = "https://dinosocial.ir";

function normalizeBaseUrl(rawValue) {
  const value = (rawValue || "").trim();

  if (!value) {
    return DEFAULT_BASE_URL;
  }

  const malformedProtocolMatch = value.match(/^(https?):(?!\/\/)(.+)$/i);
  if (malformedProtocolMatch) {
    const protocol = malformedProtocolMatch[1].toLowerCase();
    const hostPart = malformedProtocolMatch[2].replace(/^\/+/, "").replace(/\/+$/, "");
    return `${protocol}://${hostPart}`;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

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

async function request(path, { method = "GET", query, body, token } = {}) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error(
      `Failed to reach API at ${API_BASE_URL}. Check server availability, CORS, or VITE_API_BASE_URL.`
    );
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }

  return data;
}

export const api = {
  login: ({ username, password }) =>
    request("/api/auth/login", { method: "POST", body: { username, password } }),
  getPosts: ({ page = 1, limit = 10 } = {}) => request("/api/posts", { query: { page, limit } }),
  getComments: ({ postId }) => request(`/api/posts/${postId}/comments`),
  createComment: ({ postId, text, token, parentId = null }) =>
    request(`/api/posts/${postId}/comments`, {
      method: "POST",
      token,
      body: { text, parent_id: parentId }
    })
};
