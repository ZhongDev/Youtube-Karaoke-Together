import { getBackendUrl } from "../../config";

function cookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

export async function adminRequest(path, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method)) headers["X-CSRF-Token"] = decodeURIComponent(cookie("ytkt_admin_csrf"));
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

export const adminApi = {
  bootstrapStatus: () => adminRequest("/api/admin/bootstrap/status"),
  loginGoogle: (body) => adminRequest("/api/admin/login/google", { method: "POST", body }),
  session: () => adminRequest("/api/admin/session"),
  logout: () => adminRequest("/api/admin/logout", { method: "POST" }),
  activeRooms: ({ offset = 0, limit = 50 } = {}) => adminRequest(`/api/admin/rooms?offset=${offset}&limit=${limit}`),
  history: ({ offset = 0, limit = 50 } = {}) => adminRequest(`/api/admin/history?offset=${offset}&limit=${limit}`),
  room: (roomId) => adminRequest(`/api/admin/rooms/${encodeURIComponent(roomId)}`),
  usage: () => adminRequest("/api/admin/usage?days=30"),
  users: () => adminRequest("/api/admin/users"),
  audit: () => adminRequest("/api/admin/audit"),
  invite: (body) => adminRequest("/api/admin/invites", { method: "POST", body }),
  updateUser: (userId, body) => adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", body }),
  revokeSessions: (userId) => adminRequest(`/api/admin/users/${encodeURIComponent(userId)}/sessions`, { method: "DELETE" }),
};
