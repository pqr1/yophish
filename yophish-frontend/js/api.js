const API_BASE_URL = "http://localhost:3000/api";

function authHeader() {
  const token = localStorage.getItem("yophishToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(options.headers ?? {}),
    },
    ...options,
  };

  if (options.body && typeof options.body !== "string") {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, config);

  if (!response.ok) {
    const message = (await response.json().catch(() => ({}))).message;
    throw new Error(message || `API request failed with status ${response.status}`);
  }

  return response.json();
}

window.api = {
  request,
  get: (path) => request(path, { method: "GET" }),
  post: (path, body) => request(path, { method: "POST", body }),
};
