(() => {
  const elements = {
    loading: document.querySelector("#cart-loading"),
    error: document.querySelector("#cart-error"),
    errorMessage: document.querySelector("#cart-error-message"),
    retry: document.querySelector("#retry-cart"),
    empty: document.querySelector("#empty-cart"),
    layout: document.querySelector("#cart-layout"),
    items: document.querySelector("#cart-items"),
    status: document.querySelector("#cart-status"),
    count: document.querySelector("#cart-item-count"),
    summaryCount: document.querySelector("#summary-item-count"),
    total: document.querySelector("#summary-total"),
    clear: document.querySelector("#clear-cart"),
    checkout: document.querySelector("#checkout-button"),
    actionLoading: document.querySelector("#cart-action-loading"),
    actionLoadingText: document.querySelector("#cart-action-loading-text")
  };

  let cart = null;
  let mutationInProgress = false;

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

  function artForProduct(productName) {
    const name = String(productName || "").toLowerCase();
    if (/(mug|kitchen|home|lamp|candle|decor)/.test(name)) return { type: "home", symbol: "⌂" };
    if (/(tech|phone|headphone|speaker|gadget|electronic)/.test(name)) return { type: "tech", symbol: "◉" };
    if (/(tote|bag|style|shirt|wear|accessor)/.test(name)) return { type: "style", symbol: "✳" };
    if (/(wellness|care|beauty|health|candle)/.test(name)) return { type: "wellness", symbol: "♡" };
    return { type: "other", symbol: "✦" };
  }

  function createCartItem(item) {
    const row = document.createElement("article");
    row.className = "cart-item";
    row.dataset.itemId = String(item.id);

    const art = artForProduct(item.productName);
    const thumbnail = document.createElement("div");
    thumbnail.className = "cart-thumbnail";
    thumbnail.dataset.art = art.type;
    thumbnail.setAttribute("role", "img");
    thumbnail.setAttribute("aria-label", `Decorative thumbnail for ${item.productName}`);
    const symbol = document.createElement("span");
    symbol.className = "thumbnail-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = art.symbol;
    thumbnail.append(symbol);

    const details = document.createElement("div");
    details.className = "cart-item-details";
    const category = document.createElement("p");
    category.className = "cart-item-category";
    category.textContent = "ShopEase find";
    const name = document.createElement("h3");
    name.className = "cart-item-name";
    name.textContent = item.productName || "Product";
    const unitPrice = document.createElement("p");
    unitPrice.className = "cart-item-unit-price";
    unitPrice.textContent = `${formatPrice(item.unitPrice)} each`;

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";
    const quantity = document.createElement("div");
    quantity.className = "cart-quantity";
    quantity.setAttribute("aria-label", `Quantity for ${item.productName}`);
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.dataset.cartAction = "decrease";
    decrease.setAttribute("aria-label", `Decrease quantity of ${item.productName}`);
    decrease.textContent = "−";
    decrease.disabled = Number(item.quantity) <= 1;
    const quantityValue = document.createElement("output");
    quantityValue.textContent = String(item.quantity);
    quantityValue.setAttribute("aria-label", `Quantity ${item.quantity}`);
    const increase = document.createElement("button");
    increase.type = "button";
    increase.dataset.cartAction = "increase";
    increase.setAttribute("aria-label", `Increase quantity of ${item.productName}`);
    increase.textContent = "+";
    quantity.append(decrease, quantityValue, increase);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-cart-item";
    remove.dataset.cartAction = "remove";
    remove.textContent = "Remove";
    controls.append(quantity, remove);
    details.append(category, name, unitPrice, controls);

    const subtotal = document.createElement("strong");
    subtotal.className = "cart-item-subtotal";
    subtotal.textContent = formatPrice(item.subtotal);
    row.append(thumbnail, details, subtotal);
    return row;
  }

  function renderCart(response) {
    if (!response || !Array.isArray(response.items) || response.totalAmount === undefined) {
      throw new Error("The cart response did not match the backend format.");
    }

    cart = response;
    const itemCount = response.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    elements.count.textContent = String(itemCount);
    elements.summaryCount.textContent = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
    elements.total.textContent = formatPrice(response.totalAmount);

    const hasItems = response.items.length > 0;
    elements.empty.hidden = hasItems;
    elements.layout.hidden = !hasItems;
    if (hasItems) elements.items.replaceChildren(...response.items.map(createCartItem));
    else elements.items.replaceChildren();
    elements.items.setAttribute("aria-busy", "false");
  }

  function setMutationState(active, message = "Updating your cart…") {
    mutationInProgress = active;
    elements.actionLoading.hidden = !active;
    elements.actionLoadingText.textContent = message;
    elements.items.setAttribute("aria-busy", String(active));
    elements.clear.disabled = active;
    elements.checkout.disabled = active;
    elements.items.querySelectorAll("button").forEach((button) => {
      button.disabled = active || (button.dataset.cartAction === "decrease"
        && Number(button.parentElement.querySelector("output")?.textContent) <= 1);
    });
    elements.items.querySelectorAll(".cart-item").forEach((row) => row.classList.toggle("is-pending", active));
  }

  function loginForCart() {
    const loginUrl = new URL("login.html", window.location.href);
    loginUrl.searchParams.set("returnTo", "cart.html");
    window.location.assign(loginUrl.href);
  }

  function showLoadError(message) {
    elements.loading.hidden = true;
    elements.layout.hidden = true;
    elements.empty.hidden = true;
    elements.errorMessage.textContent = message;
    elements.error.hidden = false;
  }

  async function loadCart() {
    clearStatus();
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.layout.hidden = true;
    elements.items.setAttribute("aria-busy", "true");

    if (!window.ShopEaseApi.getAccessToken()) {
      loginForCart();
      return;
    }

    try {
      const response = await window.ShopEaseApi.getCart();
      renderCart(response);
      elements.loading.hidden = true;
    } catch (error) {
      if (error.status === 401) {
        loginForCart();
        return;
      }
      showLoadError(error.message || "Your cart couldn't be loaded. Please try again.");
    }
  }

  async function runCartMutation(label, operation, responseIncludesCart = true) {
    if (mutationInProgress) return;
    clearStatus();
    setMutationState(true, label);
    try {
      const result = await operation();
      const updatedCart = responseIncludesCart ? result : await window.ShopEaseApi.getCart();
      renderCart(updatedCart);
      showStatus("Your cart has been updated.", "info");
    } catch (error) {
      if (error.status === 401) {
        loginForCart();
        return;
      }
      showStatus(error.message || "We couldn't update your cart. Please try again.");
      try {
        renderCart(await window.ShopEaseApi.getCart());
      } catch (refreshError) {
        if (refreshError.status === 401) {
          loginForCart();
          return;
        }
        showStatus(`${error.message || "Cart update failed."} The current cart couldn't be refreshed.`, "error");
      }
    } finally {
      setMutationState(false);
    }
  }

  elements.items.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cart-action]");
    if (!button || mutationInProgress || !cart) return;
    const row = button.closest(".cart-item");
    const itemId = Number(row?.dataset.itemId);
    const item = cart.items.find((cartItem) => Number(cartItem.id) === itemId);
    if (!item) return;

    switch (button.dataset.cartAction) {
      case "increase":
        runCartMutation("Updating quantity…", () => window.ShopEaseApi.updateCartItem(itemId, Number(item.quantity) + 1));
        break;
      case "decrease":
        if (Number(item.quantity) > 1) {
          runCartMutation("Updating quantity…", () => window.ShopEaseApi.updateCartItem(itemId, Number(item.quantity) - 1));
        }
        break;
      case "remove":
        runCartMutation("Removing item…", () => window.ShopEaseApi.removeCartItem(itemId), false);
        break;
    }
  });

  elements.clear.addEventListener("click", () => {
    if (mutationInProgress || !cart?.items?.length) return;
    if (!window.confirm("Clear all items from your cart?")) return;
    runCartMutation("Clearing your cart…", () => window.ShopEaseApi.clearCart(), false);
  });

  elements.checkout.addEventListener("click", async () => {
    if (mutationInProgress) return;
    if (!window.ShopEaseApi.getAccessToken()) {
      loginForCart();
      return;
    }

    clearStatus();
    setMutationState(true, "Checking your cart…");
    try {
      const latestCart = await window.ShopEaseApi.getCart();
      renderCart(latestCart);
      if (latestCart.items.length === 0) {
        showStatus("Your cart is empty. Add an item before checkout.", "info");
        return;
      }
      window.location.assign(new URL("checkout.html", window.location.href).href);
    } catch (error) {
      if (error.status === 401) {
        loginForCart();
        return;
      }
      showStatus(error.message || "Checkout couldn't be opened. Please try again.");
    } finally {
      setMutationState(false);
    }
  });

  elements.retry.addEventListener("click", loadCart);
  loadCart();
})();
