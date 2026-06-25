// All backend communication lives in this one file.
// Change BASE_URL to your deployed Render URL when you go live.
const BASE_URL = "http://127.0.0.1:8000";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Something went wrong");
  }
  return data;
}

export const api = {
  register: (payload) => request("/register", { method: "POST", body: payload }),
  login: (payload) => request("/login", { method: "POST", body: payload }),

  createTask: (payload) => request("/tasks", { method: "POST", body: payload, auth: true }),

  listTasks: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.priority) params.append("priority", filters.priority);
    const qs = params.toString();
    return request(`/tasks${qs ? `?${qs}` : ""}`, { auth: true });
  },

  getTask: (id) => request(`/tasks/${id}`, { auth: true }),

  updateTask: (id, payload) =>
    request(`/tasks/${id}`, { method: "PUT", body: payload, auth: true }),

  deleteTask: (id) => request(`/tasks/${id}`, { method: "DELETE", auth: true }),

  assignTask: (id, developer_id) =>
    request(`/tasks/${id}/assign`, {
      method: "PUT",
      body: { developer_id },
      auth: true,
    }),

  updateStatus: (id, status) =>
    request(`/tasks/${id}/status`, {
      method: "PUT",
      body: { status },
      auth: true,
    }),

  dashboard: () => request("/dashboard", { auth: true }),
};
