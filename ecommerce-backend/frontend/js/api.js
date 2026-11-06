(() => {
  const API_BASE_URL = String(window.SHOP_EASE_API_BASE_URL || "http://localhost:8080/api").replace(/\/+$/, "");
  const ACCESS_TOKEN_KEY = "shopease_access_token";

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  async function requestJson(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new ApiError("Can't connect to ShopEase. Check that the backend is running and allows this frontend origin (CORS).");
    }

    const rawBody = await response.text();
    let body = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const message = [body?.error, body?.detail, body?.message].find((value) => typeof value === "string")
        || `The request couldn't be completed (HTTP ${response.status}).`;
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) return null;
    if (body === null) throw new ApiError("ShopEase returned an unreadable response.", response.status);
    return body;
  }

  function getJson(path, options = {}) {
    return requestJson(path, { method: "GET", ...options });
  }

  function postJson(path, payload, headers = {}) {
    return requestJson(path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  }

  function buildQuery(parameters) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    }
    const serialized = query.toString();
    return serialized ? `?${serialized}` : "";
  }

  async function getProducts({ name, categoryId, page = 0, size = 12, sortBy = "price", direction = "ASC" } = {}) {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const endpoint = normalizedName ? "/products/search" : "/products";
    const query = buildQuery({
      ...(normalizedName ? { name: normalizedName } : {}),
      categoryId,
      page,
      size,
      sortBy,
      direction
    });
    return getJson(`${endpoint}${query}`);
  }

  async function getCategories() {
    return getJson("/categories");
  }

  async function getProductById(productId) {
    return getJson(`/products/${encodeURIComponent(productId)}`);
  }

  async function createAdminProduct(product) {
    return authenticatedRequest("/admin/products", { method: "POST", body: JSON.stringify(product) });
  }

  async function updateAdminProduct(productId, product) {
    return authenticatedRequest(`/admin/products/${encodeURIComponent(productId)}`, {
      method: "PUT",
      body: JSON.stringify(product)
    });
  }

  async function deleteAdminProduct(productId) {
    return authenticatedRequest(`/admin/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
  }

  async function createAdminCategory(category) {
    return authenticatedRequest("/admin/categories", { method: "POST", body: JSON.stringify(category) });
  }

  async function updateAdminCategory(categoryId, category) {
    return authenticatedRequest(`/admin/categories/${encodeURIComponent(categoryId)}`, {
      method: "PUT",
      body: JSON.stringify(category)
    });
  }

  async function deleteAdminCategory(categoryId) {
    return authenticatedRequest(`/admin/categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
  }

  async function login(credentials) {
    return postJson("/auth/login", credentials);
  }

  async function register(details) {
    return postJson("/auth/register", details);
  }

  function saveCustomerAccessToken(loginResponse) {
    if (!loginResponse || loginResponse.role !== "CUSTOMER" || typeof loginResponse.accessToken !== "string") {
      throw new ApiError("This account doesn't have customer access.");
    }
    saveAccessToken(loginResponse);
  }

  function saveAccessToken(loginResponse) {
    if (!loginResponse || !["ADMIN", "CUSTOMER"].includes(loginResponse.role)
        || typeof loginResponse.accessToken !== "string" || !loginResponse.accessToken) {
      throw new ApiError("The sign-in response doesn't include a recognized account role.");
    }
    try {
      window.sessionStorage.setItem(ACCESS_TOKEN_KEY, loginResponse.accessToken);
    } catch {
      throw new ApiError("This browser couldn't keep your sign-in active for this tab.");
    }
  }

  function getAccessToken() {
    try {
      return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function clearAccessToken() {
    try {
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // Storage may be unavailable; there is no token copy elsewhere to clear.
    }
  }

  function getAccessTokenRole() {
    const token = getAccessToken();
    if (!token) return null;
    try {
      const payload = token.split(".")[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const claims = JSON.parse(window.atob(padded));
      return typeof claims.role === "string" ? claims.role : null;
    } catch {
      return null;
    }
  }

  async function addToCart(productId, quantity) {
    return customerRequest("/cart/items", {
      method: "POST",
      body: JSON.stringify({ productId, quantity })
    });
  }

  async function getCart() {
    return customerRequest("/cart", { method: "GET" });
  }

  async function updateCartItem(itemId, quantity) {
    return customerRequest(`/cart/items/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      body: JSON.stringify({ quantity })
    });
  }

  async function removeCartItem(itemId) {
    return customerRequest(`/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  }

  async function clearCart() {
    return customerRequest("/cart", { method: "DELETE" });
  }

  async function createOrder() {
    return customerRequest("/orders", { method: "POST" });
  }

  async function getOrders() {
    return customerRequest("/orders", { method: "GET" });
  }

  async function getAdminOrders() {
    return authenticatedRequest("/admin/orders", { method: "GET" });
  }

  async function updateAdminOrderStatus(orderId, status) {
    return authenticatedRequest(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
  }

  async function getOrder(orderId) {
    return customerRequest(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
  }

  async function cancelOrder(orderId) {
    return customerRequest(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: "PUT" });
  }

  async function createCodPayment(orderId) {
    return customerRequest("/payments/cod", {
      method: "POST",
      body: JSON.stringify({ orderId })
    });
  }

  async function getPayment(paymentId) {
    return customerRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
  }

  async function authenticatedRequest(path, options) {
    const token = getAccessToken();
    if (!token) throw new ApiError("Sign in to continue.", 401);

    try {
      return await requestJson(path, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      if (error.status === 401) clearAccessToken();
      throw error;
    }
  }

  async function customerRequest(path, options) {
    const token = getAccessToken();
    if (!token || getAccessTokenRole() !== "CUSTOMER") {
      clearAccessToken();
      throw new ApiError("Sign in with a customer account to continue.", 401);
    }
    try {
      return await authenticatedRequest(path, options);
    } catch (error) {
      if (error.status === 403) {
        clearAccessToken();
        throw new ApiError("Customer access is required. Please sign in again.", 401);
      }
      throw error;
    }
  }

  window.ShopEaseApi = Object.freeze({
    getProducts,
    getCategories,
    getProductById,
    createAdminProduct,
    updateAdminProduct,
    deleteAdminProduct,
    createAdminCategory,
    updateAdminCategory,
    deleteAdminCategory,
    login,
    register,
    saveAccessToken,
    saveCustomerAccessToken,
    getAccessToken,
    getAccessTokenRole,
    clearAccessToken,
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    createOrder,
    getOrders,
    getAdminOrders,
    updateAdminOrderStatus,
    getOrder,
    cancelOrder,
    createCodPayment,
    getPayment,
    ApiError
  });
})();
