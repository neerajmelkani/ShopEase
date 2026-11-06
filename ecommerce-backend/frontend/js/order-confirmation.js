(() => {
  const params = new URLSearchParams(window.location.search);
  const orderIdValue = params.get("orderId") || "";
  const paymentIdValue = params.get("paymentId") || "";
  const orderId = /^\d+$/.test(orderIdValue) ? Number(orderIdValue) : NaN;
  const paymentId = /^\d+$/.test(paymentIdValue) ? Number(paymentIdValue) : NaN;
  const elements = {
    loading: document.querySelector("#confirmation-loading"),
    error: document.querySelector("#confirmation-error"),
    errorMessage: document.querySelector("#confirmation-error-message"),
    retry: document.querySelector("#retry-confirmation"),
    content: document.querySelector("#confirmation-content"),
    orderId: document.querySelector("#confirmed-order-id"),
    amount: document.querySelector("#confirmed-order-amount"),
    paymentMethod: document.querySelector("#confirmed-payment-method"),
    paymentStatus: document.querySelector("#confirmed-payment-status"),
    viewOrder: document.querySelector("#view-order-button")
  };

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

  function showError(message) {
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.errorMessage.textContent = message;
    elements.error.hidden = false;
  }

  function redirectToLogin() {
    const loginUrl = new URL("login.html", window.location.href);
    const returnTo = `order-confirmation.html?orderId=${encodeURIComponent(orderIdValue)}&paymentId=${encodeURIComponent(paymentIdValue)}`;
    loginUrl.searchParams.set("returnTo", returnTo);
    window.location.assign(loginUrl.href);
  }

  async function loadConfirmation() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.content.hidden = true;
    if (!Number.isSafeInteger(orderId) || orderId < 1 || !Number.isSafeInteger(paymentId) || paymentId < 1) {
      showError("The confirmation link is missing a valid order or payment ID.");
      return;
    }
    if (!window.ShopEaseApi.getAccessToken()) {
      redirectToLogin();
      return;
    }

    try {
      const [order, payment] = await Promise.all([
        window.ShopEaseApi.getOrder(orderId),
        window.ShopEaseApi.getPayment(paymentId)
      ]);
      if (!order || Number(order.id) !== orderId || order.totalAmount === undefined) {
        throw new Error("The order response did not match this confirmation.");
      }
      if (!payment || Number(payment.orderId) !== orderId || payment.paymentMethod !== "COD"
        || payment.paymentStatus !== "PENDING") {
        throw new Error("The COD payment response did not match this confirmation.");
      }

      elements.orderId.textContent = `#${order.id}`;
      elements.amount.textContent = formatPrice(order.totalAmount);
      elements.paymentMethod.textContent = "Cash on Delivery (COD)";
      elements.paymentStatus.textContent = payment.paymentStatus;
      elements.viewOrder.href = `orders.html?orderId=${encodeURIComponent(order.id)}`;
      document.title = `Order #${order.id} confirmed — ShopEase`;
      elements.loading.hidden = true;
      elements.error.hidden = true;
      elements.content.hidden = false;
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      showError(error.message || "Your confirmation couldn't be loaded. Please try again.");
    }
  }

  elements.retry.addEventListener("click", loadConfirmation);
  loadConfirmation();
})();
