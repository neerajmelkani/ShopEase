(() => {
  const api = window.ShopEaseApi;
  const cancellableOrderStatuses = new Set(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]);
  const elements = {
    alert: document.querySelector("#dashboard-alert"),
    date: document.querySelector("#today-date"),
    totalProducts: document.querySelector("#total-products"),
    productsNote: document.querySelector("#products-note"),
    totalCategories: document.querySelector("#total-categories"),
    categoriesNote: document.querySelector("#categories-note"),
    totalOrders: document.querySelector("#total-orders"),
    ordersNote: document.querySelector("#orders-note"),
    pendingOrders: document.querySelector("#pending-orders"),
    pendingNote: document.querySelector("#pending-note"),
    loading: document.querySelector("#orders-loading"),
    error: document.querySelector("#orders-error"),
    empty: document.querySelector("#orders-empty"),
    tableWrap: document.querySelector("#orders-table-wrap"),
    tableBody: document.querySelector("#recent-orders-body"),
    dataNote: document.querySelector("#data-limit-note"),
    sidebar: document.querySelector("#admin-sidebar"),
    menu: document.querySelector("#sidebar-toggle")
  };

  function loginUrl() {
    const returnTo = encodeURIComponent("admin/dashboard.html");
    return `../login.html?returnTo=${returnTo}`;
  }

  function redirectToLogin() {
    window.location.replace(loginUrl());
  }

  function showDashboardAlert(message) {
    elements.alert.textContent = message;
    elements.alert.hidden = false;
  }

  function formatMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Unavailable";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unavailable";
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function statusLabel(status) {
    return String(status).toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function setCount(valueElement, noteElement, count, note) {
    valueElement.textContent = new Intl.NumberFormat("en-IN").format(count);
    noteElement.textContent = note;
  }

  async function loadProductCount() {
    try {
      // The existing paged product response includes totalElements; only one record is requested.
      const page = await api.getProducts({ page: 0, size: 1, sortBy: "id", direction: "ASC" });
      if (!page || !Number.isSafeInteger(Number(page.totalElements)) || Number(page.totalElements) < 0) {
        throw new Error("The product API response doesn't include a valid totalElements count.");
      }
      setCount(elements.totalProducts, elements.productsNote, Number(page.totalElements), "From the product catalog");
    } catch (error) {
      elements.totalProducts.textContent = "—";
      elements.productsNote.textContent = "Product count unavailable";
      showDashboardAlert(`Product count couldn't be loaded: ${error.message}`);
    }
  }

  async function loadCategoryCount() {
    try {
      const categories = await api.getCategories();
      if (!Array.isArray(categories)) throw new Error("The category API response wasn't a list.");
      setCount(elements.totalCategories, elements.categoriesNote, categories.length, "From the category list");
    } catch (error) {
      elements.totalCategories.textContent = "—";
      elements.categoriesNote.textContent = "Category count unavailable";
      showDashboardAlert(`Category count couldn't be loaded: ${error.message}`);
    }
  }

  function buildOrderRow(order) {
    const row = document.createElement("tr");
    const cells = [
      document.createElement("td"), document.createElement("td"), document.createElement("td"),
      document.createElement("td"), document.createElement("td"), document.createElement("td"),
      document.createElement("td")
    ];

    cells[0].className = "order-id-cell";
    cells[0].textContent = `#${order.id}`;
    cells[1].className = "unavailable-cell";
    cells[1].textContent = "Not provided";
    cells[2].textContent = formatDate(order.createdAt);
    cells[3].className = "order-amount";
    cells[3].textContent = formatMoney(order.totalAmount);
    cells[4].className = "unavailable-cell";
    cells[4].textContent = "Not provided";

    const badge = document.createElement("span");
    badge.className = "order-status-badge";
    badge.dataset.status = order.status;
    badge.textContent = statusLabel(order.status);
    cells[5].append(badge);

    const details = document.createElement("a");
    details.className = "row-action order-view-action";
    details.href = `order-details.html?id=${encodeURIComponent(order.id)}`;
    details.textContent = "View details";
    cells[6].append(details);
    row.append(...cells);
    return row;
  }

  async function loadOrders() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.tableWrap.hidden = true;
    elements.dataNote.hidden = true;
    try {
      const orders = await api.getAdminOrders();
      if (!Array.isArray(orders) || orders.some((order) => !order
          || !Number.isSafeInteger(Number(order.id)) || order.totalAmount === undefined
          || typeof order.status !== "string" || typeof order.createdAt !== "string")) {
        throw new Error("The admin order response didn't match the order summary fields.");
      }

      setCount(elements.totalOrders, elements.ordersNote, orders.length, "All orders returned by the admin API");
      setCount(elements.pendingOrders, elements.pendingNote,
        orders.filter((order) => order.status === "PENDING").length, "Orders currently marked pending");

      elements.loading.hidden = true;
      if (orders.length === 0) {
        elements.empty.hidden = false;
        return;
      }

      elements.tableBody.replaceChildren(...orders.slice(0, 8).map(buildOrderRow));
      elements.tableWrap.hidden = false;
      elements.dataNote.hidden = false;
    } catch (error) {
      elements.loading.hidden = true;
      elements.error.textContent = error.message || "Recent orders couldn't be loaded.";
      elements.error.hidden = false;
      elements.totalOrders.textContent = "—";
      elements.pendingOrders.textContent = "—";
      elements.ordersNote.textContent = "Order data unavailable";
      elements.pendingNote.textContent = "Order data unavailable";
      if (error.status === 401 || error.status === 403) {
        api.clearAccessToken();
        redirectToLogin();
      }
    }
  }

  function toggleSidebar(open) {
    elements.sidebar.classList.toggle("is-open", open);
    elements.menu.setAttribute("aria-expanded", String(open));
    elements.menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }

  function initialize() {
    if (!api || !api.getAccessToken()) {
      redirectToLogin();
      return;
    }
    if (api.getAccessTokenRole() !== "ADMIN") {
      api.clearAccessToken();
      redirectToLogin();
      return;
    }

    elements.date.textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date());
    document.querySelector("#logout-button").addEventListener("click", () => {
      api.clearAccessToken();
      window.location.replace("../login.html");
    });
    elements.menu.addEventListener("click", () => {
      toggleSidebar(!elements.sidebar.classList.contains("is-open"));
    });
    document.addEventListener("click", (event) => {
      if (elements.sidebar.classList.contains("is-open")
          && !elements.sidebar.contains(event.target) && !elements.menu.contains(event.target)) {
        toggleSidebar(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") toggleSidebar(false);
    });

    void loadProductCount();
    void loadCategoryCount();
    void loadOrders();
  }

  initialize();
})();
