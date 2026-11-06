(() => {
  const query = new URLSearchParams(window.location.search);
  const productIdValue = query.get("id") || "";
  const productId = /^\d+$/.test(productIdValue) ? Number(productIdValue) : NaN;
  const elements = {
    loading: document.querySelector("#details-loading"),
    error: document.querySelector("#details-error"),
    errorText: document.querySelector("#details-error-text"),
    notFound: document.querySelector("#product-not-found"),
    content: document.querySelector("#product-content"),
    breadcrumb: document.querySelector("#breadcrumb-current"),
    mainImage: document.querySelector("#product-main-image"),
    imageFallback: document.querySelector("#product-image-fallback"),
    thumbnails: document.querySelector("#product-thumbnails"),
    category: document.querySelector("#product-category"),
    name: document.querySelector("#product-name"),
    price: document.querySelector("#product-price"),
    description: document.querySelector("#product-description"),
    stockIndicator: document.querySelector("#stock-indicator"),
    stockMessage: document.querySelector("#stock-message"),
    quantity: document.querySelector("#product-quantity"),
    quantityHint: document.querySelector("#quantity-hint"),
    decrease: document.querySelector("#quantity-decrease"),
    increase: document.querySelector("#quantity-increase"),
    addButton: document.querySelector("#add-to-cart"),
    buyButton: document.querySelector("#buy-now"),
    actionMessage: document.querySelector("#cart-action-message"),
    retryButton: document.querySelector("#retry-product")
  };

  let product = null;
  let availableStock = 0;
  let busy = false;

  function formatPrice(value) {
    const price = Number(value);
    if (!Number.isFinite(price)) return "Price unavailable";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  }

  function setActionMessage(message, isError = false) {
    elements.actionMessage.textContent = message;
    elements.actionMessage.classList.toggle("is-error", isError);
    elements.actionMessage.hidden = false;
  }

  function clearActionMessage() {
    elements.actionMessage.textContent = "";
    elements.actionMessage.classList.remove("is-error");
    elements.actionMessage.hidden = true;
  }

  function showGalleryImage(index, imageUrls, name) {
    const candidates = imageUrls.map((_, offset) => (index + offset) % imageUrls.length);
    const loadNextCandidate = () => {
      const candidateIndex = candidates.shift();
      if (candidateIndex === undefined) {
        elements.mainImage.hidden = true;
        elements.imageFallback.hidden = false;
        return;
      }

      elements.mainImage.hidden = false;
      elements.imageFallback.hidden = true;
      elements.mainImage.alt = `${name} product photo ${candidateIndex + 1}`;
      elements.mainImage.onload = () => {
        for (const button of elements.thumbnails.children) {
          const selected = Number(button.dataset.imageIndex) === candidateIndex;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-pressed", String(selected));
        }
      };
      elements.mainImage.onerror = () => {
        const failedThumbnail = [...elements.thumbnails.children]
          .find((button) => Number(button.dataset.imageIndex) === candidateIndex);
        failedThumbnail?.remove();
        loadNextCandidate();
      };
      elements.mainImage.src = imageUrls[candidateIndex];
    };
    loadNextCandidate();
  }

  function renderGallery(selectedProduct) {
    const imageUrls = Array.isArray(selectedProduct.imageUrls)
      ? [...new Set(selectedProduct.imageUrls.filter((url) => {
        if (typeof url !== "string") return false;
        try {
          const parsed = new URL(url);
          return parsed.protocol === "https:" && Boolean(parsed.hostname);
        } catch {
          return false;
        }
      }))]
      : [];
    elements.thumbnails.replaceChildren();

    if (imageUrls.length === 0) {
      elements.mainImage.hidden = true;
      elements.imageFallback.hidden = false;
      return;
    }

    imageUrls.forEach((url, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "product-thumbnail";
      button.dataset.imageIndex = String(index);
      button.setAttribute("aria-label", `Show product photo ${index + 1}`);
      button.setAttribute("aria-pressed", "false");
      const thumbnail = document.createElement("img");
      thumbnail.src = url;
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      thumbnail.addEventListener("error", () => button.remove(), { once: true });
      button.append(thumbnail);
      button.addEventListener("click", () => showGalleryImage(index, imageUrls, selectedProduct.name));
      elements.thumbnails.append(button);
    });

    showGalleryImage(0, imageUrls, selectedProduct.name);
  }

  function updateQuantityControls() {
    const quantity = Number(elements.quantity.value);
    elements.decrease.disabled = availableStock < 1 || !Number.isInteger(quantity) || quantity <= 1;
    elements.increase.disabled = availableStock < 1 || !Number.isInteger(quantity) || quantity >= availableStock;
  }

  function normalizeQuantity({ showMessage = false } = {}) {
    if (availableStock < 1) {
      elements.quantity.value = "1";
      updateQuantityControls();
      return false;
    }

    const requested = Number(elements.quantity.value);
    if (!Number.isInteger(requested) || requested < 1) {
      elements.quantity.value = "1";
      updateQuantityControls();
      if (showMessage) setActionMessage("Choose a quantity of at least 1.", true);
      return false;
    }
    if (requested > availableStock) {
      elements.quantity.value = String(availableStock);
      updateQuantityControls();
      if (showMessage) setActionMessage(`Only ${availableStock} ${availableStock === 1 ? "item is" : "items are"} currently available.`, true);
      return false;
    }

    updateQuantityControls();
    return true;
  }

  function renderProduct(selectedProduct) {
    if (!selectedProduct || Number(selectedProduct.id) !== productId
      || typeof selectedProduct.name !== "string"
      || selectedProduct.price === undefined
      || !Number.isFinite(Number(selectedProduct.price))) {
      throw new Error("The product response did not include the expected product details.");
    }

    product = selectedProduct;
    availableStock = Number(selectedProduct.stockQuantity);
    if (!Number.isSafeInteger(availableStock) || availableStock < 0) {
      throw new Error("The product response included an invalid stock quantity.");
    }

    const categoryName = selectedProduct.categoryName || "Uncategorized";
    renderGallery(selectedProduct);
    elements.category.textContent = categoryName;
    elements.name.textContent = selectedProduct.name;
    elements.price.textContent = formatPrice(selectedProduct.price);
    elements.description.textContent = selectedProduct.description || "No description is available for this product yet.";
    elements.breadcrumb.textContent = selectedProduct.name;
    document.title = `${selectedProduct.name} — ShopEase`;

    elements.quantity.min = "1";
    elements.quantity.max = String(availableStock);
    elements.quantity.value = "1";
    const rememberedQuantity = Number(query.get("quantity"));
    if (Number.isSafeInteger(rememberedQuantity) && rememberedQuantity >= 1 && availableStock > 0) {
      elements.quantity.value = String(Math.min(rememberedQuantity, availableStock));
    }
    elements.quantity.disabled = availableStock === 0;
    elements.quantityHint.textContent = availableStock > 0
      ? `Up to ${availableStock} ${availableStock === 1 ? "item" : "items"} available.`
      : "This product is currently unavailable.";

    const inStock = availableStock > 0;
    elements.stockIndicator.classList.toggle("is-out", !inStock);
    elements.stockMessage.classList.toggle("is-out", !inStock);
    elements.stockMessage.textContent = inStock
      ? `${availableStock} ${availableStock === 1 ? "item" : "items"} available`
      : "Out of stock";
    elements.addButton.disabled = !inStock;
    elements.buyButton.disabled = !inStock;
    elements.content.hidden = false;
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.notFound.hidden = true;
    updateQuantityControls();
  }

  function showNotFound() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.content.hidden = true;
    elements.notFound.hidden = false;
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.notFound.hidden = true;
    elements.content.hidden = true;
    elements.errorText.textContent = message;
    elements.error.hidden = false;
  }

  async function loadProduct() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.notFound.hidden = true;
    elements.content.hidden = true;
    clearActionMessage();

    if (!Number.isSafeInteger(productId) || productId < 1) {
      showNotFound();
      return;
    }

    try {
      const response = await window.ShopEaseApi.getProductById(productId);
      renderProduct(response);
    } catch (error) {
      if (error.status === 404) {
        showNotFound();
      } else {
        showError(error.message || "Please check your connection and try again.");
      }
    }
  }

  function redirectToCustomerLogin() {
    const loginUrl = new URL("login.html", window.location.href);
    const selectedQuantity = Number(elements.quantity.value);
    const quantity = Number.isSafeInteger(selectedQuantity) && selectedQuantity > 0 ? selectedQuantity : 1;
    loginUrl.searchParams.set("returnTo", `product-details.html?id=${productId}&quantity=${quantity}`);
    window.location.assign(loginUrl.href);
  }

  async function addSelectedProduct({ buyNow = false } = {}) {
    if (!product || busy) return;
    clearActionMessage();
    if (!normalizeQuantity({ showMessage: true })) return;

    if (!window.ShopEaseApi.getAccessToken()) {
      redirectToCustomerLogin();
      return;
    }
    if (window.ShopEaseApi.getAccessTokenRole() !== "CUSTOMER") {
      setActionMessage("Cart actions are available to customer accounts only.", true);
      return;
    }

    const quantity = Number(elements.quantity.value);
    busy = true;
    elements.addButton.disabled = true;
    elements.buyButton.disabled = true;
    elements.addButton.classList.add("is-loading");
    elements.buyButton.classList.add("is-loading");
    elements.addButton.textContent = "Adding…";
    elements.buyButton.textContent = "Adding…";

    try {
      await window.ShopEaseApi.addToCart(product.id, quantity);
      if (buyNow) {
        window.location.assign(new URL("cart.html", window.location.href).href);
        return;
      }
      setActionMessage(`${product.name} was added to your cart.`);
    } catch (error) {
      if (error.status === 401) {
        setActionMessage("Your sign-in has expired. Please sign in again.", true);
        redirectToCustomerLogin();
        return;
      }
      setActionMessage(error.message || "We couldn't add this item. Please try again.", true);
    } finally {
      busy = false;
      elements.addButton.classList.remove("is-loading");
      elements.buyButton.classList.remove("is-loading");
      elements.addButton.innerHTML = "<span aria-hidden=\"true\">＋</span> Add to cart";
      elements.buyButton.innerHTML = "Buy now <span aria-hidden=\"true\">→</span>";
      const canBuy = availableStock > 0;
      elements.addButton.disabled = !canBuy;
      elements.buyButton.disabled = !canBuy;
    }
  }

  elements.quantity.addEventListener("input", () => {
    clearActionMessage();
    updateQuantityControls();
  });
  elements.quantity.addEventListener("change", () => normalizeQuantity({ showMessage: true }));
  elements.decrease.addEventListener("click", () => {
    elements.quantity.value = String(Math.max(1, Number(elements.quantity.value || 1) - 1));
    clearActionMessage();
    updateQuantityControls();
  });
  elements.increase.addEventListener("click", () => {
    elements.quantity.value = String(Math.min(availableStock, Number(elements.quantity.value || 1) + 1));
    clearActionMessage();
    updateQuantityControls();
  });
  elements.addButton.addEventListener("click", () => addSelectedProduct());
  elements.buyButton.addEventListener("click", () => addSelectedProduct({ buyNow: true }));
  elements.retryButton.addEventListener("click", loadProduct);

  loadProduct();
})();
