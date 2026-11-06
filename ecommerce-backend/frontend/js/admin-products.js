(() => {
  const api = window.ShopEaseApi;
  const PAGE_SIZE = 20;
  const state = { page: 0, name: "", categoryId: "", categories: [], editingId: null, loading: false, saving: false };
  const el = {
    sidebar: document.querySelector("#admin-sidebar"), menu: document.querySelector("#sidebar-toggle"),
    message: document.querySelector("#products-message"), search: document.querySelector("#product-search"),
    categoryFilter: document.querySelector("#category-filter"), categoryInput: document.querySelector("#product-category"),
    filterForm: document.querySelector("#product-filter-form"), clearFilters: document.querySelector("#clear-filters"),
    loading: document.querySelector("#products-loading"), error: document.querySelector("#products-error"),
    empty: document.querySelector("#products-empty"), tableWrap: document.querySelector("#products-table-wrap"),
    tableBody: document.querySelector("#products-table-body"), pagination: document.querySelector("#products-pagination"),
    pageSummary: document.querySelector("#page-summary"), previous: document.querySelector("#previous-page"), next: document.querySelector("#next-page"),
    dialog: document.querySelector("#product-dialog"), form: document.querySelector("#product-form"),
    dialogTitle: document.querySelector("#product-dialog-title"), formMessage: document.querySelector("#product-form-message"),
    name: document.querySelector("#product-name"), description: document.querySelector("#product-description"),
    price: document.querySelector("#product-price"), stock: document.querySelector("#product-stock"),
    imageUrls: document.querySelector("#product-image-urls"),
    save: document.querySelector("#save-product"), add: document.querySelector("#add-product-button")
  };

  function loginUrl() {
    return `../login.html?returnTo=${encodeURIComponent("admin/products.html")}`;
  }

  function handleUnauthorized(error) {
    if (error?.status !== 401 && error?.status !== 403) return false;
    api.clearAccessToken();
    window.location.replace(loginUrl());
    return true;
  }

  function announce(message, isError = false) {
    el.message.textContent = message;
    el.message.classList.toggle("is-error", isError);
    el.message.hidden = false;
  }

  function clearAnnouncement() {
    el.message.hidden = true;
    el.message.textContent = "";
    el.message.classList.remove("is-error");
  }

  function formatMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount)
      : "Unavailable";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
  }

  function updateCategorySelects() {
    const options = state.categories.map((category) => {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = category.name;
      return option;
    });
    const filterOptions = [new Option("All categories", ""), ...options.map((option) => option.cloneNode(true))];
    const formOptions = [new Option("No category", ""), ...options];
    el.categoryFilter.replaceChildren(...filterOptions);
    el.categoryInput.replaceChildren(...formOptions);
    el.categoryFilter.value = state.categoryId;
  }

  async function loadCategories() {
    try {
      const categories = await api.getCategories();
      if (!Array.isArray(categories) || categories.some((category) => !category || category.id == null || !category.name)) {
        throw new Error("The category API response didn't match the expected category fields.");
      }
      state.categories = categories;
      updateCategorySelects();
    } catch (error) {
      if (handleUnauthorized(error)) return;
      announce(`Categories couldn't be loaded. Product category filtering and assignment may be unavailable: ${error.message}`, true);
    }
  }

  function productRow(product) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "product-name-cell";
    const name = document.createElement("strong");
    name.textContent = product.name;
    const id = document.createElement("small");
    id.textContent = `Product #${product.id}`;
    nameCell.append(name, id);

    const category = document.createElement("td");
    category.className = "category-name-cell";
    category.textContent = product.categoryName || "Uncategorized";
    const price = document.createElement("td");
    price.textContent = formatMoney(product.price);
    const stock = document.createElement("td");
    stock.className = "stock-cell";
    stock.textContent = String(product.stockQuantity);
    const availability = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `availability-badge${Number(product.stockQuantity) > 0 ? "" : " is-out"}`;
    badge.textContent = Number(product.stockQuantity) > 0 ? "In stock" : "Out of stock";
    availability.append(badge);
    const updated = document.createElement("td");
    updated.textContent = formatDate(product.updatedAt);

    const actions = document.createElement("td");
    const actionGroup = document.createElement("div");
    actionGroup.className = "row-actions";
    for (const [action, label, className] of [["edit", "Edit", ""], ["delete", "Delete", "is-danger"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `row-action ${className}`.trim();
      button.dataset.action = action;
      button.dataset.id = String(product.id);
      button.textContent = label;
      actionGroup.append(button);
    }
    actions.append(actionGroup);
    row.append(nameCell, category, price, stock, availability, updated, actions);
    return row;
  }

  function showListState({ loading = false, error = "", empty = false, hasRows = false, page = null } = {}) {
    el.loading.hidden = !loading;
    el.error.hidden = !error;
    el.error.textContent = error;
    el.empty.hidden = !empty;
    el.tableWrap.hidden = !hasRows;
    el.pagination.hidden = !hasRows || !page || page.totalPages <= 1;
    if (page && hasRows) {
      el.pageSummary.textContent = `Page ${page.number + 1} of ${page.totalPages} · ${new Intl.NumberFormat("en-IN").format(page.totalElements)} products`;
      el.previous.disabled = state.loading || page.first;
      el.next.disabled = state.loading || page.last;
    }
  }

  async function loadProducts() {
    if (state.loading) return;
    state.loading = true;
    showListState({ loading: true });
    el.previous.disabled = true;
    el.next.disabled = true;
    try {
      const page = await api.getProducts({
        name: state.name,
        categoryId: state.categoryId,
        page: state.page,
        size: PAGE_SIZE,
        sortBy: "id",
        direction: "ASC"
      });
      if (!page || !Array.isArray(page.content) || !Number.isInteger(page.number)
          || !Number.isInteger(page.totalPages) || !Number.isSafeInteger(Number(page.totalElements))) {
        throw new Error("The product API response didn't match the expected paginated product fields.");
      }
      state.loading = false;
      if (page.content.length === 0) {
        el.tableBody.replaceChildren();
        showListState({ empty: true });
        return;
      }
      if (page.content.some((product) => !product || product.id == null || !product.name
          || product.price === undefined || product.stockQuantity === undefined)) {
        throw new Error("A product in the API response is missing required display fields.");
      }
      el.tableBody.replaceChildren(...page.content.map(productRow));
      showListState({ hasRows: true, page });
    } catch (error) {
      state.loading = false;
      if (handleUnauthorized(error)) return;
      showListState({ error: error.message || "Products couldn't be loaded." });
    }
  }

  function openDialog(product = null) {
    clearAnnouncement();
    el.formMessage.hidden = true;
    el.formMessage.textContent = "";
    el.form.reset();
    state.editingId = product ? Number(product.id) : null;
    el.dialogTitle.textContent = product ? "Edit product" : "Add product";
    el.save.textContent = product ? "Save changes" : "Save product";
    if (product) {
      el.name.value = product.name || "";
      el.description.value = product.description || "";
      el.price.value = product.price ?? "";
      el.stock.value = product.stockQuantity ?? "";
      el.categoryInput.value = product.categoryId == null ? "" : String(product.categoryId);
      el.imageUrls.value = Array.isArray(product.imageUrls) ? product.imageUrls.join("\n") : "";
    }
    el.dialog.showModal();
    el.name.focus();
  }

  function showFormError(message) {
    el.formMessage.textContent = message;
    el.formMessage.hidden = false;
  }

  function validateProductForm() {
    const name = el.name.value.trim();
    const description = el.description.value.trim();
    const priceText = el.price.value.trim();
    const stockText = el.stock.value.trim();
    const price = Number(priceText);
    const stockQuantity = Number(stockText);
    const imageUrls = el.imageUrls.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (!name) return "Enter a product name.";
    if (name.length > 255) return "Product name must be at most 255 characters.";
    if (description.length > 2000) return "Description must be at most 2,000 characters.";
    if (!priceText || !Number.isFinite(price) || price <= 0 || price > 9999999999.99) return "Enter a price greater than zero with at most 10 integer digits.";
    if (!/^\d+(?:\.\d{1,2})?$/.test(priceText)) return "Price can have up to two decimal places.";
    if (!stockText || !Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 2147483647) return "Enter a whole stock quantity between 0 and 2,147,483,647.";
    if (el.categoryInput.value && !state.categories.some((category) => String(category.id) === el.categoryInput.value)) return "Choose a valid category.";
    if (imageUrls.length > 20) return "A product can have at most 20 images.";
    if (imageUrls.some((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol !== "https:" || !parsed.hostname;
      } catch {
        return true;
      }
    })) return "Enter valid HTTPS photo URLs.";
    if (new Set(imageUrls).size !== imageUrls.length) return "Product photo URLs must be distinct.";
    return "";
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (state.saving) return;
    const validationMessage = validateProductForm();
    if (validationMessage) {
      showFormError(validationMessage);
      return;
    }
    const payload = {
      name: el.name.value.trim(),
      description: el.description.value.trim() || null,
      price: Number(el.price.value),
      stockQuantity: Number(el.stock.value),
      categoryId: el.categoryInput.value ? Number(el.categoryInput.value) : null,
      imageUrls: el.imageUrls.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean)
    };
    const editingId = state.editingId;
    state.saving = true;
    el.save.disabled = true;
    el.save.textContent = editingId ? "Saving…" : "Adding…";
    try {
      const saved = editingId
        ? await api.updateAdminProduct(editingId, payload)
        : await api.createAdminProduct(payload);
      if (!saved || Number(saved.id) <= 0 || saved.name !== payload.name) {
        throw new Error("The backend response didn't confirm the saved product.");
      }
      el.dialog.close();
      announce(editingId ? "Product updated." : "Product added.");
      await loadProducts();
    } catch (error) {
      if (handleUnauthorized(error)) return;
      showFormError(error.message || "The product couldn't be saved.");
    } finally {
      state.saving = false;
      el.save.disabled = false;
      el.save.textContent = state.editingId ? "Save changes" : "Save product";
    }
  }

  async function editProduct(id) {
    try {
      const product = await api.getProductById(id);
      if (!product || Number(product.id) !== id) throw new Error("The product couldn't be confirmed by the backend.");
      openDialog(product);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      announce(error.message || "Product details couldn't be loaded.", true);
    }
  }

  async function deleteProduct(id, button) {
    if (!window.confirm(`Delete product #${id}? This action cannot be undone.`)) return;
    button.disabled = true;
    try {
      await api.deleteAdminProduct(id);
      announce(`Product #${id} deleted.`);
      await loadProducts();
    } catch (error) {
      if (handleUnauthorized(error)) return;
      announce(error.message || "The product couldn't be deleted.", true);
      button.disabled = false;
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
    el.add.addEventListener("click", () => openDialog());
    document.querySelector("#close-product-dialog").addEventListener("click", () => el.dialog.close());
    document.querySelector("#cancel-product").addEventListener("click", () => el.dialog.close());
    el.form.addEventListener("submit", saveProduct);
    el.filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.name = el.search.value.trim();
      state.categoryId = el.categoryFilter.value;
      state.page = 0;
      clearAnnouncement();
      void loadProducts();
    });
    el.clearFilters.addEventListener("click", () => {
      el.search.value = "";
      el.categoryFilter.value = "";
      state.name = "";
      state.categoryId = "";
      state.page = 0;
      clearAnnouncement();
      void loadProducts();
    });
    el.previous.addEventListener("click", () => { if (state.page > 0) { state.page -= 1; void loadProducts(); } });
    el.next.addEventListener("click", () => { state.page += 1; void loadProducts(); });
    el.tableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = Number(button.dataset.id);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      if (button.dataset.action === "edit") void editProduct(id);
      if (button.dataset.action === "delete") void deleteProduct(id, button);
    });
    void loadCategories().then(() => loadProducts());
  }

  initialize();
})();
