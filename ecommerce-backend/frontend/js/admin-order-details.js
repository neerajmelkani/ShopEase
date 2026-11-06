(() => {
  const api = window.ShopEaseApi;
  const VALID_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
  const TRANSITIONS = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: []
  };
  const queryId = new URLSearchParams(window.location.search).get("id");
  const orderId = /^\d+$/.test(queryId || "") ? Number(queryId) : NaN;
  let currentOrder = null;
  let nextStatus = null;
  let updating = false;
  const el = {
    sidebar: document.querySelector("#admin-sidebar"), menu: document.querySelector("#sidebar-toggle"),
    loading: document.querySelector("#order-loading"), error: document.querySelector("#order-error"),
    content: document.querySelector("#order-content"), id: document.querySelector("#detail-order-id"),
    date: document.querySelector("#detail-order-date"), status: document.querySelector("#detail-order-status"),
    message: document.querySelector("#order-message"), summaryId: document.querySelector("#summary-order-id"),
    summaryDate: document.querySelector("#summary-order-date"), total: document.querySelector("#summary-total"),
    statusForm: document.querySelector("#status-form"), statusSelect: document.querySelector("#next-status"),
    statusButton: document.querySelector("#update-status-button"), terminalNote: document.querySelector("#status-terminal-note"),
    itemsUnavailable: document.querySelector("#items-unavailable"), itemsTable: document.querySelector("#items-table-wrap"),
    itemsBody: document.querySelector("#order-items-body"), itemNote: document.querySelector("#item-source-note"),
    confirmDialog: document.querySelector("#status-confirm-dialog"), confirmText: document.querySelector("#status-confirm-text"),
    confirmButton: document.querySelector("#confirm-status-update")
  };

  function loginUrl() {
    return `../login.html?returnTo=${encodeURIComponent(`admin/order-details.html?id=${encodeURIComponent(queryId || "")}`)}`;
  }

  function redirectToLogin() {
    window.location.replace(loginUrl());
  }

  function handleUnauthorized(error) {
    if (error?.status !== 401 && error?.status !== 403) return false;
    api.clearAccessToken();
    redirectToLogin();
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
    return String(status).toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function announce(message, isError = false) {
    el.message.textContent = message;
    el.message.classList.toggle("is-error", isError);
    el.message.hidden = false;
  }

  function renderOrderItems(items) {
    if (!Array.isArray(items) || items.some((item) => !item || !item.productName
        || item.quantity === undefined || item.price === undefined || item.subtotal === undefined)) {
      return false;
    }
    const rows = items.map((item) => {
      const row = document.createElement("tr");
      for (const [value, className] of [
        [item.productName, "item-product-name"],
        [String(item.quantity), ""],
        [formatMoney(item.price), ""],
        [formatMoney(item.subtotal), "item-subtotal"]
      ]) {
        const cell = document.createElement("td");
        if (className) cell.className = className;
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    el.itemsBody.replaceChildren(...rows);
    el.itemsUnavailable.hidden = true;
    el.itemsTable.hidden = false;
    el.itemNote.textContent = "Included in the confirmed status-update response";
    return true;
  }

  function renderStatusControls() {
    el.status.dataset.status = currentOrder.status;
    el.status.textContent = statusLabel(currentOrder.status);
    const choices = TRANSITIONS[currentOrder.status] || [];
    el.statusSelect.replaceChildren();
    if (choices.length) {
      const placeholder = new Option("Select next status", "");
      placeholder.disabled = true;
      placeholder.selected = true;
      el.statusSelect.append(placeholder, ...choices.map((status) => new Option(statusLabel(status), status)));
      el.statusForm.hidden = false;
      el.terminalNote.hidden = true;
      el.statusButton.disabled = false;
    } else {
      el.statusForm.hidden = true;
      el.terminalNote.hidden = false;
    }
  }

  function renderSummary(order) {
    currentOrder = order;
    el.id.textContent = `#${order.id}`;
    el.date.textContent = `Placed ${formatDate(order.createdAt)}`;
    el.summaryId.textContent = `#${order.id}`;
    el.summaryDate.textContent = formatDate(order.createdAt);
    el.total.textContent = formatMoney(order.totalAmount);
    renderStatusControls();
  }

  async function loadOrderSummary() {
    el.loading.hidden = false;
    el.error.hidden = true;
    el.content.hidden = true;
    try {
      const orders = await api.getAdminOrders();
      if (!Array.isArray(orders)) throw new Error("The admin order endpoint didn't return an order list.");
      const order = orders.find((candidate) => Number(candidate.id) === orderId);
      if (!order) throw new Error(`Order #${orderId} wasn't found in the admin order list.`);
      if (order.totalAmount === undefined || !VALID_STATUSES.includes(order.status) || typeof order.createdAt !== "string") {
        throw new Error("The order summary didn't match the fields supported by the backend.");
      }
      renderSummary(order);
      el.loading.hidden = true;
      el.content.hidden = false;
    } catch (error) {
      el.loading.hidden = true;
      el.error.textContent = error.message || "Order details couldn't be loaded.";
      el.error.hidden = false;
      if (handleUnauthorized(error)) return;
    }
  }

  function requestStatusConfirmation(event) {
    event.preventDefault();
    if (!currentOrder || updating) return;
    const selected = el.statusSelect.value;
    if (!TRANSITIONS[currentOrder.status]?.includes(selected)) {
      announce("Choose a status that is valid for the current order status.", true);
      return;
    }
    nextStatus = selected;
    const isCancelling = selected === "CANCELLED";
    el.confirmText.textContent = isCancelling
      ? `Change order #${currentOrder.id} from ${statusLabel(currentOrder.status)} to Cancelled? The backend restores this order's product stock as part of cancellation.`
      : `Change order #${currentOrder.id} from ${statusLabel(currentOrder.status)} to ${statusLabel(selected)}?`;
    el.confirmDialog.showModal();
  }

  async function confirmStatusUpdate() {
    if (updating || !currentOrder || !nextStatus) return;
    const requestedStatus = nextStatus;
    updating = true;
    el.confirmButton.disabled = true;
    el.confirmButton.textContent = "Updating…";
    el.statusButton.disabled = true;
    try {
      const response = await api.updateAdminOrderStatus(currentOrder.id, requestedStatus);
      if (!response || Number(response.id) !== Number(currentOrder.id) || response.status !== requestedStatus) {
        throw new Error("The backend response didn't confirm the requested order status.");
      }
      el.confirmDialog.close();
      renderSummary(response);
      if (Array.isArray(response.items)) renderOrderItems(response.items);
      announce(`Order #${response.id} status updated to ${statusLabel(response.status)}.`);
    } catch (error) {
      el.confirmDialog.close();
      if (handleUnauthorized(error)) return;
      announce(error.message || "The order status couldn't be updated.", true);
      // A conflict can mean the status changed concurrently; reload the authoritative summary.
      if (error.status === 409) await loadOrderSummary();
    } finally {
      updating = false;
      nextStatus = null;
      el.confirmButton.disabled = false;
      el.confirmButton.textContent = "Confirm update";
      el.statusButton.disabled = false;
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
      redirectToLogin();
      return;
    }
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      el.loading.hidden = true;
      el.error.textContent = "A valid order ID is required in the page URL.";
      el.error.hidden = false;
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
    el.statusForm.addEventListener("submit", requestStatusConfirmation);
    el.confirmButton.addEventListener("click", confirmStatusUpdate);
    document.querySelector("#cancel-status-update").addEventListener("click", () => el.confirmDialog.close());
    document.querySelector("#close-status-dialog").addEventListener("click", () => el.confirmDialog.close());
    void loadOrderSummary();
  }

  initialize();
})();
