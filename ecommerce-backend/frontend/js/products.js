(() => {
  const PAGE_SIZE = 12;
  const DEFAULT_SORT = { sortBy: "price", direction: "ASC" };
  const ALLOWED_SORTS = new Set(["price:ASC", "price:DESC", "name:ASC", "createdAt:DESC"]);
  const params = new URLSearchParams(window.location.search);
  const requestedCategoryId = Number(params.get("categoryId"));

  const state = {
    name: (params.get("q") || "").trim(),
    categoryId: Number.isSafeInteger(requestedCategoryId) && requestedCategoryId > 0 ? requestedCategoryId : null,
    categorySlug: params.get("category") || "",
    page: 0,
    size: PAGE_SIZE,
    sortBy: DEFAULT_SORT.sortBy,
    direction: DEFAULT_SORT.direction,
    totalPages: 0,
    totalElements: 0
  };

  const elements = {
    searchForm: document.querySelector("#product-search-form"),
    searchInput: document.querySelector("#product-search"),
    categoryOptions: document.querySelector("#category-options"),
    sort: document.querySelector("#sort-products"),
    clearFilters: document.querySelector("#clear-filters"),
    emptyClearFilters: document.querySelector("#empty-clear-filters"),
    resultSummary: document.querySelector("#result-summary"),
    listingMessage: document.querySelector("#listing-message"),
    grid: document.querySelector("#product-grid"),
    emptyState: document.querySelector("#empty-state"),
    pagination: document.querySelector("#pagination"),
    title: document.querySelector("#listing-title")
  };
  let cartMutationInProgress = false;

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function showListingMessage(message, type = "info", retry = false) {
    const box = elements.listingMessage;
    if (!box) return;
    box.className = `listing-message${type === "info" ? " is-info" : " is-error"}`;
    box.replaceChildren();
    const text = document.createElement("span");
    text.textContent = message;
    box.append(text);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "retry-button";
      button.dataset.retryProducts = "true";
      button.textContent = "Try again";
      box.append(button);
    }
    box.hidden = false;
  }

  function clearListingMessage() {
    elements.listingMessage.hidden = true;
    elements.listingMessage.replaceChildren();
    elements.listingMessage.className = "listing-message";
  }

  function showSkeletons() {
    elements.grid.setAttribute("aria-busy", "true");
    elements.grid.innerHTML = Array.from({ length: 6 }, () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-block skeleton-image"></div>
        <div class="skeleton-block skeleton-line short"></div>
        <div class="skeleton-block skeleton-line medium"></div>
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-actions"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>
      </div>`).join("");
  }

  function renderCategories(categories) {
    if (!Array.isArray(categories)) throw new Error("Categories response was not a list.");
    const validCategories = categories.filter((category) =>
      category && Number.isSafeInteger(Number(category.id)) && Number(category.id) > 0 && typeof category.name === "string");

    elements.categoryOptions.replaceChildren();
    elements.categoryOptions.append(createCategoryRadio("", "All products", state.categoryId === null));
    validCategories.forEach((category) => {
      elements.categoryOptions.append(createCategoryRadio(String(category.id), category.name, Number(category.id) === state.categoryId));
    });

    if (state.categoryId === null && state.categorySlug) {
      const match = validCategories.find((category) => {
        const categoryName = slugify(category.name);
        return categoryName === state.categorySlug || categoryName.startsWith(`${state.categorySlug}-`);
      });
      if (match) {
        state.categoryId = Number(match.id);
        state.categorySlug = "";
        const radio = elements.categoryOptions.querySelector(`input[value="${state.categoryId}"]`);
        if (radio) radio.checked = true;
      }
    }
  }

  function createCategoryRadio(value, label, checked) {
    const wrapper = document.createElement("label");
    wrapper.className = "category-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "categoryId";
    radio.value = value;
    radio.checked = checked;
    const text = document.createElement("span");
    text.textContent = label;
    wrapper.append(radio, text);
    return wrapper;
  }

  function formatPrice(price) {
    const amount = Number(price);
    if (!Number.isFinite(amount)) return "Price unavailable";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-tile";

    const artwork = document.createElement("div");
    artwork.className = "product-artwork product-photo-frame";
    const imageUrls = Array.isArray(product.imageUrls)
      ? [...new Set(product.imageUrls.filter((url) => {
        if (typeof url !== "string") return false;
        try {
          const parsed = new URL(url);
          return parsed.protocol === "https:" && Boolean(parsed.hostname);
        } catch {
          return false;
        }
      }))]
      : [];
    if (imageUrls.length > 0) {
      const image = document.createElement("img");
      image.className = "product-photo";
      image.alt = product.name ? `${product.name} product photo` : "Product photo";
      image.loading = "lazy";
      let nextImage = 0;
      image.addEventListener("error", () => {
        if (nextImage < imageUrls.length) {
          image.src = imageUrls[nextImage++];
          return;
        }
        image.remove();
        artwork.classList.add("has-image-error");
        artwork.textContent = "Product image unavailable";
        artwork.setAttribute("aria-label", "Product images unavailable");
      });
      artwork.append(image);
      image.src = imageUrls[nextImage++];
    } else {
      artwork.classList.add("has-no-image");
      artwork.textContent = "No product image is configured";
      artwork.setAttribute("aria-label", "No product image is configured");
    }

    const details = document.createElement("div");
    details.className = "product-details";
    const category = document.createElement("span");
    category.className = "product-category-name";
    category.textContent = product.categoryName || "ShopEase find";

    const titleLine = document.createElement("div");
    titleLine.className = "product-title-line";
    const title = document.createElement("h2");
    title.textContent = product.name || "Untitled product";
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = formatPrice(product.price);
    titleLine.append(title, price);

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description || "A thoughtful find for your everyday.";

    const availability = document.createElement("p");
    availability.className = "product-availability";
    const inStock = Number(product.stockQuantity) > 0;
    availability.textContent = inStock ? "Available" : "Currently out of stock";
    if (!inStock) availability.classList.add("is-out");

    const actions = document.createElement("div");
    actions.className = "product-actions";
    const viewDetails = document.createElement("a");
    viewDetails.className = "view-details";
    viewDetails.href = `product-details.html?id=${encodeURIComponent(product.id)}`;
    viewDetails.textContent = "View details";
    const addToCart = document.createElement("button");
    addToCart.type = "button";
    addToCart.className = "add-to-cart";
    addToCart.dataset.addToCart = String(product.id);
    addToCart.textContent = "Add to cart";
    addToCart.disabled = !inStock;
    if (inStock) addToCart.setAttribute("aria-label", `Add ${product.name || "product"} to cart`);
    actions.append(viewDetails, addToCart);

    details.append(category, titleLine, description, availability, actions);
    card.append(artwork, details);
    return card;
  }

  function renderProducts(result) {
    if (!result || !Array.isArray(result.content)
      || !Number.isFinite(Number(result.totalPages))
      || !Number.isFinite(Number(result.totalElements))
      || !Number.isFinite(Number(result.number))) {
      throw new Error("Products response did not match the backend page format.");
    }

    const products = result.content;
    state.page = Number(result.number);
    state.totalPages = Number(result.totalPages);
    state.totalElements = Number(result.totalElements);
    elements.grid.replaceChildren(...products.map(createProductCard));
    elements.grid.setAttribute("aria-busy", "false");
    elements.emptyState.hidden = products.length > 0;

    if (products.length > 0) {
      const first = state.page * Number(result.size || state.size) + 1;
      const last = Math.min(first + products.length - 1, state.totalElements);
      elements.resultSummary.innerHTML = `Showing <strong>${first}–${last}</strong> of <strong>${state.totalElements}</strong> ${state.totalElements === 1 ? "product" : "products"}`;
    } else {
      setText(elements.resultSummary, "0 products found");
    }

    elements.title.textContent = state.name ? "Search results" : "Shop all products";
    renderPagination();
  }

  function createPageButton(label, page, { disabled = false, current = false, ariaLabel = label } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = disabled;
    button.setAttribute("aria-label", ariaLabel);
    if (current) button.setAttribute("aria-current", "page");
    if (!disabled && !current) button.dataset.page = String(page);
    return button;
  }

  function renderPagination() {
    const nav = elements.pagination;
    nav.replaceChildren();
    if (state.totalPages < 2) {
      nav.hidden = true;
      return;
    }

    nav.hidden = false;
    nav.append(createPageButton("←", state.page - 1, {
      disabled: state.page === 0,
      ariaLabel: "Previous page"
    }));

    const start = Math.max(0, Math.min(state.page - 2, state.totalPages - 5));
    const end = Math.min(state.totalPages - 1, start + 4);
    if (start > 0) {
      nav.append(createPageButton("1", 0, { ariaLabel: "Page 1" }));
      if (start > 1) appendEllipsis(nav);
    }
    for (let page = start; page <= end; page += 1) {
      nav.append(createPageButton(String(page + 1), page, {
        current: page === state.page,
        ariaLabel: `Page ${page + 1}`
      }));
    }
    if (end < state.totalPages - 1) {
      if (end < state.totalPages - 2) appendEllipsis(nav);
      nav.append(createPageButton(String(state.totalPages), state.totalPages - 1, {
        ariaLabel: `Page ${state.totalPages}`
      }));
    }
    nav.append(createPageButton("→", state.page + 1, {
      disabled: state.page >= state.totalPages - 1,
      ariaLabel: "Next page"
    }));
  }

  function appendEllipsis(nav) {
    const span = document.createElement("span");
    span.className = "page-ellipsis";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "…";
    nav.append(span);
  }

  function updateAddressBar() {
    const url = new URL(window.location.href);
    url.search = "";
    if (state.name) url.searchParams.set("q", state.name);
    if (state.categoryId !== null) url.searchParams.set("categoryId", String(state.categoryId));
    if (state.page > 0) url.searchParams.set("page", String(state.page));
    if (state.sortBy !== DEFAULT_SORT.sortBy) url.searchParams.set("sortBy", state.sortBy);
    if (state.direction !== DEFAULT_SORT.direction) url.searchParams.set("direction", state.direction);
    window.history.replaceState({}, "", url);
  }

  function readInitialControls() {
    elements.searchInput.value = state.name;
    const requestedPage = Number(params.get("page"));
    if (Number.isSafeInteger(requestedPage) && requestedPage >= 0) state.page = requestedPage;
    const requestedSortBy = params.get("sortBy") || DEFAULT_SORT.sortBy;
    const requestedDirection = (params.get("direction") || DEFAULT_SORT.direction).toUpperCase();
    const sortValue = `${requestedSortBy}:${requestedDirection}`;
    if (ALLOWED_SORTS.has(sortValue)) {
      state.sortBy = requestedSortBy;
      state.direction = requestedDirection;
      elements.sort.value = sortValue;
    }
  }

  async function loadCategories() {
    try {
      const categories = await window.ShopEaseApi.getCategories();
      renderCategories(categories);
      return true;
    } catch (error) {
      elements.categoryOptions.replaceChildren();
      elements.categoryOptions.append(createCategoryRadio("", "All products", state.categoryId === null));
      const message = document.createElement("p");
      message.className = "filter-error";
      message.textContent = `${error.message} Categories are unavailable.`;
      elements.categoryOptions.append(message);
      return false;
    }
  }

  async function loadProducts() {
    clearListingMessage();
    elements.emptyState.hidden = true;
    elements.pagination.hidden = true;
    setText(elements.resultSummary, "Loading products…");
    showSkeletons();
    updateAddressBar();

    try {
      const result = await window.ShopEaseApi.getProducts(state);
      const totalPages = Number(result?.totalPages);
      const returnedPage = Number(result?.number);
      if (totalPages > 0 && returnedPage >= totalPages) {
        state.page = totalPages - 1;
        await loadProducts();
        return;
      }
      renderProducts(result);
    } catch (error) {
      elements.grid.replaceChildren();
      elements.grid.setAttribute("aria-busy", "false");
      setText(elements.resultSummary, "Products unavailable");
      showListingMessage(error.message || "Products couldn't be loaded. Please try again.", "error", true);
    }
  }

  function clearFilters() {
    state.name = "";
    state.categoryId = null;
    state.categorySlug = "";
    state.page = 0;
    state.sortBy = DEFAULT_SORT.sortBy;
    state.direction = DEFAULT_SORT.direction;
    elements.searchInput.value = "";
    elements.sort.value = `${DEFAULT_SORT.sortBy}:${DEFAULT_SORT.direction}`;
    const allRadio = elements.categoryOptions.querySelector('input[name="categoryId"][value=""]');
    if (allRadio) allRadio.checked = true;
    loadProducts();
  }

  async function initialize() {
    readInitialControls();
    showSkeletons();
    await loadCategories();
    const selectedCategory = elements.categoryOptions.querySelector('input[name="categoryId"]:checked');
    if (selectedCategory) state.categoryId = selectedCategory.value ? Number(selectedCategory.value) : null;
    await loadProducts();
  }

  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.name = elements.searchInput.value.trim();
    state.page = 0;
    loadProducts();
  });

  elements.categoryOptions.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="categoryId"]')) return;
    state.categoryId = event.target.value ? Number(event.target.value) : null;
    state.categorySlug = "";
    state.page = 0;
    loadProducts();
  });

  elements.sort.addEventListener("change", () => {
    const [sortBy, direction] = elements.sort.value.split(":");
    if (!ALLOWED_SORTS.has(`${sortBy}:${direction}`)) return;
    state.sortBy = sortBy;
    state.direction = direction;
    state.page = 0;
    loadProducts();
  });

  elements.clearFilters.addEventListener("click", clearFilters);
  elements.emptyClearFilters.addEventListener("click", clearFilters);

  elements.pagination.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button) return;
    const page = Number(button.dataset.page);
    if (!Number.isSafeInteger(page) || page < 0 || page >= state.totalPages || page === state.page) return;
    state.page = page;
    loadProducts();
  });

  elements.listingMessage.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-products]")) loadProducts();
  });

  elements.grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-to-cart]");
    if (!button || button.disabled || cartMutationInProgress) return;
    const productId = Number(button.dataset.addToCart);
    if (!Number.isSafeInteger(productId) || productId <= 0) return;

    const token = window.ShopEaseApi.getAccessToken();
    const role = window.ShopEaseApi.getAccessTokenRole();
    if (!token) {
      const loginUrl = new URL("login.html", window.location.href);
      loginUrl.searchParams.set("returnTo", `product-details.html?id=${productId}`);
      window.location.assign(loginUrl.href);
      return;
    }
    if (role !== "CUSTOMER") {
      showListingMessage("Cart access is available to customer accounts. No item was added.", "error");
      return;
    }

    cartMutationInProgress = true;
    button.disabled = true;
    button.textContent = "Adding…";
    clearListingMessage();
    window.ShopEaseApi.addToCart(productId, 1).then((cart) => {
      if (!cart || !Array.isArray(cart.items) || cart.totalAmount === undefined) {
        throw new Error("The cart response didn't match the backend format.");
      }
      const count = cart.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
      const cartCount = document.querySelector(".cart-count");
      const cartLink = document.querySelector(".cart-link");
      if (cartCount) cartCount.textContent = String(count);
      if (cartLink) cartLink.setAttribute("aria-label", `Shopping cart, ${count} ${count === 1 ? "item" : "items"}`);
      showListingMessage("Product added to your cart.", "info");
    }).catch((error) => {
      if (error.status === 401) {
        const loginUrl = new URL("login.html", window.location.href);
        loginUrl.searchParams.set("returnTo", `product-details.html?id=${productId}`);
        window.location.assign(loginUrl.href);
        return;
      }
      showListingMessage(error.message || "The product couldn't be added to your cart.", "error");
    }).finally(() => {
      cartMutationInProgress = false;
      button.textContent = "Add to cart";
      button.disabled = Number(button.closest(".product-tile")?.dataset.stockQuantity) === 0;
    });
  });

  initialize();
})();
