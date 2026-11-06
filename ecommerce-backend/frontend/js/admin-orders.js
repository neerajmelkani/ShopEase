(() => {
  const api = window.ShopEaseApi;
  const STATUS_LABELS = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
  let allOrders = [];
  const el = {
    sidebar: document.querySelector("#admin-sidebar"), menu: document.querySelector("#sidebar-toggle"),
    message: document.querySelector("#orders-message"), form: document.querySelector("#orders-filter-form"),
    search: document.querySelector("#order-search"), status: document.querySelector("#order-status-filter"),
    clear: document.querySelector("#clear-order-filters"), loading: document.querySelector("#orders-loading"),
    error: document.querySelector("#orders-error"), empty: document.querySelector("#orders-empty"),
    table: document.querySelector("#orders-table-wrap"), body: document.querySelector("#orders-table-body")
  };

  function loginUrl() {
    return `../login.html?returnTo=${encodeURIComponent("admin/orders.html")}`;
  }

  function handleUnauthorized(error) {
    if (error?.status !== 401 && error?.status !== 403) return false;
    api.clearAccessToken();
    window.location.replace(loginUrl());
    return true;
  }

  function formatMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount)
      : "Unavailable";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function statusLabel(status) {
    return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function createRow(order) {
    const row = document.createElement("tr");
    const orderCell = document.createElement("td");
    orderCell.className = "order-id-cell";
    orderCell.textContent = `#${order.id}`;
    const customerCell = document.createElement("td");
    customerCell.className = "unavailable-value";
    customerCell.textContent = "Not provided";
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(order.createdAt);
    const amountCell = document.createElement("td");
    amountCell.className = "order-amount-cell";
    amountCell.textContent = formatMoney(order.totalAmount);
    const paymentCell = document.createElement("td");
    paymentCell.className = "unavailable-value";
    paymentCell.textContent = "Not provided";
    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "order-status-badge";
    badge.dataset.status = order.status;
    badge.textContent = statusLabel(order.status);
    statusCell.append(badge);
    const actionCell = document.createElement("td");
    const details = document.createElement("a");
    details.className = "row-action order-view-action";
    details.href = `order-details.html?id=${encodeURIComponent(order.id)}`;
    details.textContent = "View details";
    details.setAttribute("aria-label", `View details for order ${order.id}`);
    actionCell.append(details);
    row.append(orderCell, customerCell, dateCell, amountCell, paymentCell, statusCell, actionCell);
    return row;
  }

  function renderOrders() {
    const search = el.search.value.trim().toLowerCase();
    const selectedStatus = el.status.value;
    const filtered = allOrders.filter((order) => {
      const orderMatches = !search || String(order.id).includes(search);
      const statusMatches = !selectedStatus || order.status === selectedStatus;
      return orderMatches && statusMatches;
    });
    el.body.replaceChildren(...filtered.map(createRow));
    el.error.hidden = true;
    el.loading.hidden = true;
    el.table.hidden = filtered.length === 0;
    el.empty.hidden = filtered.length !== 0;
    if (!allOrders.length && !search && !selectedStatus) {
      el.empty.querySelector("strong").textContent = "No orders yet";
      el.empty.querySelector("span").textContent = "Orders will appear here after customers place orders.";
    } else {
      el.empty.querySelector("strong").textContent = "No matching orders";
      el.empty.querySelector("span").textContent = "Try a different order ID or status filter.";
    }
  }

  async function loadOrders() {
    el.loading.hidden = false;
    el.error.hidden = true;
    el.empty.hidden = true;
    el.table.hidden = true;
    try {
      const orders = await api.getAdminOrders();
      if (!Array.isArray(orders) || orders.some((order) => !order
          || !Number.isSafeInteger(Number(order.id)) || Number(order.id) <= 0
          || order.totalAmount === undefined || !STATUS_LABELS.includes(order.status)
          || typeof order.createdAt !== "string")) {
        throw new Error("The admin order list didn't match the order summary fields supported by the backend.");
      }
      allOrders = orders;
      renderOrders();
    } catch (error) {
      el.loading.hidden = true;
      el.table.hidden = true;
      el.error.textContent = error.message || "Orders couldn't be loaded.";
      el.error.hidden = false;
      if (handleUnauthorized(error)) return;
    }
  }

  function toggleSidebar(open) {
    el.sidebar.classList.toggle("is-open", open);
    el.menu.setAttribute("aria-expanded", String(open));
    el.menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }

  function initialize() {
    if (!api || !api.getAccessToken() || api.getAccessTokenRole() !== "ADMIN") {
      api?.clearAccessToken();
      window.location.replace(loginUrl());
      return;
    }
    document.querySelector("#logout-button").addEventListener("click", () => {
      api.clearAccessToken();
      window.location.replace("../login.html");
    });
    el.menu.addEventListener("click", () => toggleSidebar(!el.sidebar.classList.contains("is-open")));
    document.addEventListener("click", (event) => {
      if (el.sidebar.classList.contains("is-open") && !el.sidebar.contains(event.target) && !el.menu.contains(event.target)) toggleSidebar(false);
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") toggleSidebar(false); });
    el.form.addEventListener("submit", (event) => { event.preventDefault(); renderOrders(); });
    el.clear.addEventListener("click", () => { el.search.value = ""; el.status.value = ""; renderOrders(); });
    void loadOrders();
  }

  initialize();
})();
