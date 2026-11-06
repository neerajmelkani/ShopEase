(() => {
  const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "PROCESSING"]);
  const PROGRESS_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const query = new URLSearchParams(window.location.search);
  const orderIdValue = query.get("id") || "";
  const orderId = /^\d+$/.test(orderIdValue) ? Number(orderIdValue) : NaN;
  const elements = {
    loading: document.querySelector("#detail-loading"),
    error: document.querySelector("#detail-error"),
    errorTitle: document.querySelector("#detail-error-title"),
    errorMessage: document.querySelector("#detail-error-message"),
    retry: document.querySelector("#retry-order"),
    message: document.querySelector("#detail-message"),
    content: document.querySelector("#order-detail-content"),
    title: document.querySelector("#detail-order-title"),
    date: document.querySelector("#detail-order-date"),
    status: document.querySelector("#detail-order-status"),
    progressCaption: document.querySelector("#progress-caption"),
    progressStatus: document.querySelector("#progress-status-label"),
    progress: document.querySelector("#order-progress"),
    cancelledProgress: document.querySelector("#cancelled-progress"),
    items: document.querySelector("#detail-items"),
    itemCount: document.querySelector("#detail-item-count"),
    summaryOrderId: document.querySelector("#summary-order-id"),
    total: document.querySelector("#detail-total"),
    cancel: document.querySelector("#cancel-order")
  };

  let currentOrder = null;
  let cancellationInProgress = false;

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
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function statusLabel(status) {
    return String(status || "UNKNOWN").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  function createItem(item) {
    const row = document.createElement("article");
    row.className = "detail-order-item";
    const copy = document.createElement("div");
    const name = document.createElement("h3");
    name.className = "detail-item-name";
    name.textContent = item.productName || "Product";
    const meta = document.createElement("p");
    meta.className = "detail-item-meta";
    meta.textContent = `Quantity ${item.quantity} · ${formatPrice(item.price)} each`;
    copy.append(name, meta);
    const subtotal = document.createElement("strong");
    subtotal.className = "detail-item-subtotal";
    subtotal.textContent = formatPrice(item.subtotal);
    row.append(copy, subtotal);
    return row;
  }

  function renderProgress(status) {
    const isCancelled = status === "CANCELLED";
    elements.progress.hidden = isCancelled;
    elements.cancelledProgress.hidden = !isCancelled;
    elements.progressStatus.textContent = statusLabel(status);

    if (isCancelled) {
      elements.progressCaption.textContent = "This order has been cancelled.";
      return;
    }

    const currentIndex = PROGRESS_STATUSES.indexOf(status);
    elements.progressCaption.textContent = currentIndex >= 0
      ? `Current order status: ${statusLabel(status)}.`
      : "The backend returned a status not shown in the standard progress steps.";

    elements.progress.querySelectorAll("li[data-progress]").forEach((step) => {
      const stepIndex = PROGRESS_STATUSES.indexOf(step.dataset.progress);
      step.classList.toggle("is-complete", currentIndex >= 0 && stepIndex < currentIndex);
      step.classList.toggle("is-current", currentIndex >= 0 && stepIndex === currentIndex);
      step.classList.toggle("is-future", currentIndex < 0 || stepIndex > currentIndex);
      if (stepIndex === currentIndex) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
  }

  function isOrderResponse(order) {
    return order && Number(order.id) === orderId && order.totalAmount !== undefined
      && typeof order.status === "string" && Array.isArray(order.items)
      && order.items.every((item) => item && item.productName && item.quantity !== undefined
        && item.price !== undefined && item.subtotal !== undefined);
  }

  function renderOrder(order) {
    if (!isOrderResponse(order)) throw new Error("The order response did not match the backend format.");
    currentOrder = order;
    elements.title.textContent = `Order #${order.id}`;
    elements.date.textContent = `Placed ${formatDate(order.createdAt)}`;
    elements.status.textContent = statusLabel(order.status);
    elements.status.dataset.status = order.status;
    elements.summaryOrderId.textContent = `#${order.id}`;
    elements.total.textContent = formatPrice(order.totalAmount);
    elements.itemCount.textContent = `${order.items.length} ${order.items.length === 1 ? "line item" : "line items"}`;
    elements.items.replaceChildren(...order.items.map(createItem));
    renderProgress(order.status);
    elements.cancel.hidden = !CANCELLABLE_STATUSES.has(order.status);
    elements.cancel.disabled = false;
    elements.cancel.textContent = "Cancel order";
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.content.hidden = false;
    document.title = `Order #${order.id} — ShopEase`;
  }

  function redirectToLogin() {
    const loginUrl = new URL("login.html", window.location.href);
    loginUrl.searchParams.set("returnTo", `order-details.html?id=${encodeURIComponent(orderIdValue)}`);
    window.location.assign(loginUrl.href);
  }

  function showError(message, title = "We couldn't load this order") {
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.errorTitle.textContent = title;
    elements.errorMessage.textContent = message;
    elements.error.hidden = false;
  }

  async function loadOrder() {
    clearMessage();
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.content.hidden = true;

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      showError("The link must include a valid order ID.", "Order not found");
      return;
    }
    if (!window.ShopEaseApi.getAccessToken()) {
      redirectToLogin();
      return;
    }

    try {
      renderOrder(await window.ShopEaseApi.getOrder(orderId));
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      if (error.status === 404) {
        showError("This order may not exist or may not belong to your account.", "Order not found");
        return;
      }
      showError(error.message || "Your order couldn't be loaded. Please try again.");
    }
  }

  async function cancelOrder() {
    if (cancellationInProgress || !currentOrder || !CANCELLABLE_STATUSES.has(currentOrder.status)) return;
    if (!window.confirm(`Cancel order #${orderId}?`)) return;

    cancellationInProgress = true;
    elements.cancel.disabled = true;
    elements.cancel.textContent = "Cancelling…";
    clearMessage();
    try {
      const updatedOrder = await window.ShopEaseApi.cancelOrder(orderId);
      if (!updatedOrder || Number(updatedOrder.id) !== orderId || updatedOrder.status !== "CANCELLED") {
        throw new Error("The backend did not confirm that this order was cancelled.");
      }
      renderOrder(updatedOrder);
      showMessage(`Order #${orderId} was cancelled.`, "info");
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      showMessage(error.message || "The order couldn't be cancelled. Please try again.");
      // A fresh read may confirm cancellation if the original response was lost.
      try {
        const latestOrder = await window.ShopEaseApi.getOrder(orderId);
        renderOrder(latestOrder);
      } catch (refreshError) {
        if (refreshError.status === 401) redirectToLogin();
      }
    } finally {
      cancellationInProgress = false;
    }
  }

  elements.cancel.addEventListener("click", cancelOrder);
  elements.retry.addEventListener("click", loadOrder);
  loadOrder();
})();
