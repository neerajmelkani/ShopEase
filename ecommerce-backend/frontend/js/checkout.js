(() => {
  const PENDING_ORDER_KEY = "shopease_pending_cod_order_id";
  const params = new URLSearchParams(window.location.search);
  const elements = {
    loading: document.querySelector("#checkout-loading"),
    error: document.querySelector("#checkout-error"),
    errorMessage: document.querySelector("#checkout-error-message"),
    retry: document.querySelector("#retry-checkout"),
    empty: document.querySelector("#checkout-empty"),
    content: document.querySelector("#checkout-content"),
    status: document.querySelector("#checkout-status"),
    form: document.querySelector("#checkout-form"),
    deliverySection: document.querySelector("#delivery-section"),
    paymentSection: document.querySelector("#payment-section"),
    pendingPanel: document.querySelector("#pending-payment-panel"),
    pendingOrderNumber: document.querySelector("#pending-order-number"),
    pendingCopy: document.querySelector("#pending-payment-copy"),
    placeButton: document.querySelector("#place-order"),
    placeLabel: document.querySelector("#place-order-label"),
    retryCod: document.querySelector("#retry-cod"),
    retryCodLabel: document.querySelector("#retry-cod-label"),
    items: document.querySelector("#checkout-items"),
    itemCount: document.querySelector("#summary-item-count"),
    total: document.querySelector("#checkout-total"),
    editCart: document.querySelector("#edit-cart-link")
  };

  let currentCart = null;
  let pendingOrder = null;
  let busy = false;

  function formatPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Price unavailable";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function showStatus(message, type = "error") {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-info", type === "info");
    elements.status.hidden = false;
  }

  function clearStatus() {
    elements.status.textContent = "";
    elements.status.classList.remove("is-info");
    elements.status.hidden = true;
  }

  function setFieldError(input, message) {
    const error = document.getElementById(`${input.id}-error`);
    if (error) error.textContent = message;
    input.setAttribute("aria-invalid", "true");
  }

  function clearFieldError(input) {
    const error = document.getElementById(`${input.id}-error`);
    if (error) error.textContent = "";
    input.removeAttribute("aria-invalid");
  }

  function validateDelivery() {
    const fields = [
      ["delivery-name", "Enter the recipient's full name."],
      ["delivery-phone", "Enter a phone number."],
      ["delivery-pin", "Enter a PIN code."],
      ["delivery-address", "Enter a delivery address."],
      ["delivery-city", "Enter a city."],
      ["delivery-state", "Enter a state."]
    ].map(([id, requiredMessage]) => ({ input: document.getElementById(id), requiredMessage }));

    let firstInvalid = null;
    for (const { input, requiredMessage } of fields) {
      input.value = input.value.trim();
      if (!input.value) {
        setFieldError(input, requiredMessage);
        firstInvalid ||= input;
      } else {
        clearFieldError(input);
      }
    }

    const phone = document.getElementById("delivery-phone");
    const phoneDigits = phone.value.replace(/\D/g, "");
    if (phone.value && (!/^[0-9+().\-\s]+$/.test(phone.value) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
      setFieldError(phone, "Enter a valid phone number with 7 to 15 digits.");
      firstInvalid ||= phone;
    }

    const pin = document.getElementById("delivery-pin");
    if (pin.value && !/^\d{4,10}$/.test(pin.value)) {
      setFieldError(pin, "Enter a PIN code with 4 to 10 digits.");
      firstInvalid ||= pin;
    }

    const address = document.getElementById("delivery-address");
    if (address.value && address.value.length < 5) {
      setFieldError(address, "Enter a more complete street address.");
      firstInvalid ||= address;
    }

    if (firstInvalid) {
      showStatus("Please check the highlighted delivery details.");
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function renderSummary(items, total, countSuffix = "items") {
    if (!Array.isArray(items)) throw new Error("The order items response was not a list.");
    elements.items.replaceChildren();
    const itemCount = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    elements.itemCount.textContent = `${itemCount} ${itemCount === 1 ? "item" : countSuffix}`;
    elements.total.textContent = formatPrice(total);

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "checkout-line-item";
      const copy = document.createElement("div");
      copy.className = "checkout-line-copy";
      const name = document.createElement("strong");
      name.textContent = item.productName || "Product";
      const price = document.createElement("span");
      const unitPrice = item.unitPrice ?? item.price;
      price.textContent = `${item.quantity} × ${formatPrice(unitPrice)}`;
      copy.append(name, price);
      const subtotal = document.createElement("span");
      subtotal.className = "checkout-line-subtotal";
      subtotal.textContent = formatPrice(item.subtotal);
      row.append(copy, subtotal);
      elements.items.append(row);
    });
  }

  function persistPendingOrder(order) {
    pendingOrder = order;
    try {
      window.sessionStorage.setItem(PENDING_ORDER_KEY, String(order.id));
    } catch {
      // The checkout URL also retains the non-sensitive order ID for recovery.
    }
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("orderId", String(order.id));
    window.history.replaceState({}, "", url);
  }

  function clearPendingOrder() {
    try {
      window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    } catch {
      // Nothing else is stored for payment setup recovery.
    }
  }

  function showPendingOrder(order) {
    pendingOrder = order;
    elements.content.hidden = false;
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.deliverySection.hidden = true;
    elements.paymentSection.hidden = true;
    elements.pendingPanel.hidden = false;
    elements.pendingOrderNumber.textContent = `Order #${order.id}`;
    elements.pendingCopy.textContent = "Your order is saved. Retry COD payment setup below; this will not create another order.";
    elements.placeButton.hidden = true;
    elements.retryCod.hidden = false;
    elements.editCart.href = "orders.html";
    renderSummary(order.items, order.totalAmount, "items");
  }

  function showLoadError(message) {
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.empty.hidden = true;
    elements.errorMessage.textContent = message;
    elements.error.hidden = false;
  }

  function isOrderResponse(order, expectedId = null) {
    return order && Number.isSafeInteger(Number(order.id)) && Number(order.id) > 0
      && (expectedId === null || Number(order.id) === Number(expectedId))
      && order.totalAmount !== undefined
      && Array.isArray(order.items);
  }

  async function loadExistingOrder(orderId) {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.content.hidden = true;
    try {
      const order = await window.ShopEaseApi.getOrder(orderId);
      if (!isOrderResponse(order, orderId)) throw new Error("The order response did not match the backend format.");
      persistPendingOrder(order);
      showPendingOrder(order);
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      if (error.status === 404) clearPendingOrder();
      showLoadError(error.message || "This saved order couldn't be recovered.");
    }
  }

  async function loadCart() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.content.hidden = true;

    if (!window.ShopEaseApi.getAccessToken()) {
      redirectToLogin();
      return;
    }

    try {
      const response = await window.ShopEaseApi.getCart();
      if (!response || !Array.isArray(response.items) || response.totalAmount === undefined) {
        throw new Error("The cart response did not match the backend format.");
      }
      currentCart = response;
      elements.loading.hidden = true;
      if (response.items.length === 0) {
        elements.empty.hidden = false;
        return;
      }
      elements.content.hidden = false;
      elements.deliverySection.hidden = false;
      elements.paymentSection.hidden = false;
      elements.pendingPanel.hidden = true;
      elements.placeButton.hidden = false;
      elements.retryCod.hidden = true;
      elements.editCart.href = "cart.html";
      renderSummary(response.items, response.totalAmount);
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      showLoadError(error.message || "Your cart couldn't be loaded. Please try again.");
    }
  }

  function redirectToLogin() {
    const loginUrl = new URL("login.html", window.location.href);
    const returnTo = params.get("orderId")
      ? `checkout.html?orderId=${encodeURIComponent(params.get("orderId"))}`
      : "checkout.html";
    loginUrl.searchParams.set("returnTo", returnTo);
    window.location.assign(loginUrl.href);
  }

  function navigateToConfirmation(order, payment) {
    clearPendingOrder();
    const confirmationUrl = new URL("order-confirmation.html", window.location.href);
    confirmationUrl.searchParams.set("orderId", String(order.id));
    confirmationUrl.searchParams.set("paymentId", String(payment.id));
    window.location.assign(confirmationUrl.href);
  }

  function setBusy(active, label = "Placing order…") {
    busy = active;
    elements.placeButton.disabled = active;
    elements.retryCod.disabled = active;
    elements.placeButton.classList.toggle("is-loading", active);
    elements.retryCod.classList.toggle("is-loading", active);
    elements.placeButton.setAttribute("aria-busy", String(active));
    elements.retryCod.setAttribute("aria-busy", String(active));
    elements.placeLabel.textContent = active ? label : "Place order";
    elements.retryCodLabel.textContent = active ? label : "Retry COD setup";
  }

  async function setupCodPayment(order) {
    setBusy(true, "Setting up COD…");
    clearStatus();
    try {
      const payment = await window.ShopEaseApi.createCodPayment(order.id);
      if (!payment || Number(payment.orderId) !== Number(order.id)
        || payment.paymentMethod !== "COD" || payment.paymentStatus !== "PENDING"
        || !Number.isSafeInteger(Number(payment.id))) {
        throw new Error("COD payment setup returned an unexpected response. Your order ID has been preserved.");
      }
      navigateToConfirmation(order, payment);
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      if (error.status === 409 && /payment record already exists/i.test(error.message)) {
        showStatus("A payment record already exists for this order. The existing API can't look up payment details by order ID, so this page can't confirm setup. Your order is preserved and will not be placed again.");
      } else {
        showStatus(`${error.message || "COD payment setup failed."} Your order is preserved; retrying will not create another order.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    if (busy || pendingOrder) return;
    clearStatus();
    if (!currentCart?.items?.length) {
      showStatus("Your cart is empty. Add an item before placing an order.");
      return;
    }
    if (!validateDelivery()) return;

    setBusy(true, "Placing order…");
    let createdOrder;
    try {
      // Backend places the order from the authenticated customer's cart; it accepts no body.
      createdOrder = await window.ShopEaseApi.createOrder();
      if (!isOrderResponse(createdOrder)) throw new Error("The order response did not match the backend format.");
      persistPendingOrder(createdOrder);
      elements.form.reset();
      showPendingOrder(createdOrder);
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      showStatus(error.message || "We couldn't place your order. Please review your cart and try again.");
      return;
    } finally {
      setBusy(false);
    }

    await setupCodPayment(createdOrder);
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    placeOrder();
  });

  elements.form.addEventListener("input", (event) => {
    if (event.target.matches("input, textarea")) clearFieldError(event.target);
  });

  elements.retryCod.addEventListener("click", () => {
    if (pendingOrder) setupCodPayment(pendingOrder);
  });

  elements.retry.addEventListener("click", () => initialize());

  async function initialize() {
    clearStatus();
    if (!window.ShopEaseApi.getAccessToken()) {
      redirectToLogin();
      return;
    }

    let storedOrderId = null;
    try {
      storedOrderId = window.sessionStorage.getItem(PENDING_ORDER_KEY);
    } catch {
      storedOrderId = null;
    }
    const candidate = params.get("orderId") || storedOrderId;
    const orderId = /^\d+$/.test(candidate || "") ? Number(candidate) : NaN;
    if (Number.isSafeInteger(orderId) && orderId > 0) {
      await loadExistingOrder(orderId);
    } else {
      await loadCart();
    }
  }

  initialize();
})();
