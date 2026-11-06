(() => {
  const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "PROCESSING"]);
  const elements = {
    loading: document.querySelector("#orders-loading"),
    error: document.querySelector("#orders-error"),
    errorMessage: document.querySelector("#orders-error-message"),
    retry: document.querySelector("#retry-orders"),
    empty: document.querySelector("#orders-empty"),
    list: document.querySelector("#orders-list"),
    message: document.querySelector("#orders-message")
  };
  let orders = [];
  let cancelling = false;

  function formatPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Amount unavailable";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function showMessage(message, type = "error") {
    elements.message.textContent = message;
    elements.message.classList.toggle("is-info", type === "info");
    elements.message.hidden = false;
  }

  function clearMessage() {
    elements.message.textContent = "";
    elements.message.classList.remove("is-info");
    elements.message.hidden = true;
  }

  function statusLabel(status) {
    return String(status || "UNKNOWN").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function createMetric(label, value, extraClass = "") {
    const wrapper = document.createElement("div");
    wrapper.className = "order-card-metric";
    const caption = document.createElement("span");
    caption.textContent = label;
    const content = document.createElement("strong");
    if (extraClass) content.className = extraClass;
    content.textContent = value;
    wrapper.append(caption, content);
    return wrapper;
  }

  function createOrderCard(order) {
    const card = document.createElement("article");
    card.className = "order-card";
    card.dataset.orderId = String(order.id);

    const header = document.createElement("header");
    header.className = "order-card-header";
    const idBlock = document.createElement("div");
    idBlock.className = "order-id-block";
    const idCaption = document.createElement("span");
    idCaption.textContent = "Order number";
    const id = document.createElement("strong");
    id.textContent = `#${order.id}`;
    const date = document.createElement("span");
    date.className = "order-date";
    date.textContent = `Placed ${formatDate(order.createdAt)}`;
    idBlock.append(idCaption, id, date);

    const status = document.createElement("span");
    status.className = "order-status-pill";
    status.dataset.status = String(order.status || "UNKNOWN");
    status.textContent = statusLabel(order.status);
    header.append(idBlock, status);

    const metrics = document.createElement("div");
    metrics.className = "order-card-body";
    metrics.append(
      createMetric("Order total", formatPrice(order.totalAmount)),
      createMetric("Payment method", "Not provided by API", "payment-unavailable"),
      createMetric("Payment status", "Not provided by API", "payment-unavailable")
    );

    const actions = document.createElement("div");
    actions.className = "order-card-actions";
    const view = document.createElement("a");
    view.className = "view-order-link";
    view.href = `order-details.html?id=${encodeURIComponent(order.id)}`;
    view.textContent = "View details";
    actions.append(view);

    if (CANCELLABLE_STATUSES.has(order.status)) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "cancel-order-action";
      cancel.dataset.cancelOrder = String(order.id);
      cancel.textContent = "Cancel order";
      actions.append(cancel);
    }

    card.append(header, metrics, actions);
    return card;
  }

  function renderOrders(response) {
    if (!Array.isArray(response)) throw new Error("The orders response did not match the backend format.");
    if (response.some((order) => !order || !Number.isSafeInteger(Number(order.id)) || order.totalAmount === undefined || !order.status)) {
      throw new Error("An order in the response did not include the expected summary fields.");
    }

    orders = response;
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.empty.hidden = response.length > 0;
    elements.list.hidden = response.length === 0;
    elements.list.replaceChildren(...response.map(createOrderCard));
  }

  function redirectToLogin() {
    const loginUrl = new URL("login.html", window.location.href);
    loginUrl.searchParams.set("returnTo", "orders.html");
    window.location.assign(loginUrl.href);
  }

  async function loadOrders() {
    clearMessage();
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.list.hidden = true;

    if (!window.ShopEaseApi.getAccessToken()) {
      redirectToLogin();
      return;
    }

    try {
      const response = await window.ShopEaseApi.getOrders();
      renderOrders(response);
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      elements.loading.hidden = true;
      elements.errorMessage.textContent = error.message || "Your orders couldn't be loaded. Please try again.";
      elements.error.hidden = false;
    }
  }

  async function cancelOrder(orderId, button) {
    if (cancelling) return;
    const order = orders.find((candidate) => Number(candidate.id) === orderId);
    if (!order || !CANCELLABLE_STATUSES.has(order.status)) return;
    if (!window.confirm(`Cancel order #${orderId}?`)) return;

    cancelling = true;
    button.disabled = true;
    button.textContent = "Cancelling…";
    clearMessage();
    try {
      const updatedOrder = await window.ShopEaseApi.cancelOrder(orderId);
      if (!updatedOrder || Number(updatedOrder.id) !== orderId || updatedOrder.status !== "CANCELLED") {
        throw new Error("The backend did not confirm that this order was cancelled.");
      }
      orders = orders.map((candidate) => Number(candidate.id) === orderId
        ? { ...candidate, status: updatedOrder.status }
        : candidate);
      renderOrders(orders);
      showMessage(`Order #${orderId} was cancelled.`, "info");
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      showMessage(error.message || "The order couldn't be cancelled. Please try again.");
      // Re-read server state in case the response was lost after the cancellation committed.
      await loadOrdersPreservingMessage();
    } finally {
      cancelling = false;
    }
  }

  async function loadOrdersPreservingMessage() {
    const currentMessage = elements.message.textContent;
    const messageIsError = !elements.message.classList.contains("is-info");
    try {
      const response = await window.ShopEaseApi.getOrders();
      renderOrders(response);
      if (currentMessage) showMessage(currentMessage, messageIsError ? "error" : "info");
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      if (currentMessage) showMessage(`${currentMessage} The latest order status couldn't be refreshed.`);
    }
  }

  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cancel-order]");
    if (!button) return;
    const orderId = Number(button.dataset.cancelOrder);
    if (Number.isSafeInteger(orderId) && orderId > 0) cancelOrder(orderId, button);
  });

  elements.retry.addEventListener("click", loadOrders);
  loadOrders();
})();
