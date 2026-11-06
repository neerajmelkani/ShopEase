(() => {
  const api = window.ShopEaseApi;
  const state = { categories: [], editingId: null, loading: false, saving: false, deleting: new Set() };
  const el = {
    sidebar: document.querySelector("#admin-sidebar"), menu: document.querySelector("#sidebar-toggle"),
    message: document.querySelector("#categories-message"), loading: document.querySelector("#categories-loading"),
    error: document.querySelector("#categories-error"), empty: document.querySelector("#categories-empty"),
    tableWrap: document.querySelector("#categories-table-wrap"), tableBody: document.querySelector("#categories-table-body"),
    count: document.querySelector("#category-count"), dialog: document.querySelector("#category-dialog"),
    form: document.querySelector("#category-form"), dialogTitle: document.querySelector("#category-dialog-title"),
    formMessage: document.querySelector("#category-form-message"), name: document.querySelector("#category-name"),
    description: document.querySelector("#category-description"), save: document.querySelector("#save-category")
  };

  function loginUrl() {
    return `../login.html?returnTo=${encodeURIComponent("admin/categories.html")}`;
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

  function showFormError(message) {
    el.formMessage.textContent = message;
    el.formMessage.hidden = false;
  }

  async function loadCategories() {
    state.loading = true;
    el.loading.hidden = false;
    el.error.hidden = true;
    el.empty.hidden = true;
    el.tableWrap.hidden = true;
    try {
      const categories = await api.getCategories();
      if (!Array.isArray(categories) || categories.some((category) => !category
          || !Number.isSafeInteger(Number(category.id)) || typeof category.name !== "string")) {
        throw new Error("The category API response didn't match the expected category fields.");
      }
      state.categories = categories;
      el.count.textContent = `${new Intl.NumberFormat("en-IN").format(categories.length)} ${categories.length === 1 ? "category" : "categories"}`;
      el.loading.hidden = true;
      if (categories.length === 0) {
        el.empty.hidden = false;
        el.tableBody.replaceChildren();
        return;
      }
      el.tableBody.replaceChildren(...categories.map(categoryRow));
      el.tableWrap.hidden = false;
    } catch (error) {
      el.loading.hidden = true;
      el.count.textContent = "Categories unavailable";
      el.error.textContent = error.message || "Categories couldn't be loaded.";
      el.error.hidden = false;
      if (handleUnauthorized(error)) return;
    } finally {
      state.loading = false;
    }
  }

  function categoryRow(category) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "category-name-cell";
    const name = document.createElement("strong");
    name.textContent = category.name;
    const id = document.createElement("small");
    id.className = "category-row-id";
    id.textContent = `Category #${category.id}`;
    nameCell.append(name, id);

    const description = document.createElement("td");
    description.textContent = category.description || "No description";
    const actions = document.createElement("td");
    const actionGroup = document.createElement("div");
    actionGroup.className = "row-actions";
    for (const [action, label, className] of [["edit", "Edit", ""], ["delete", "Delete", "is-danger"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `row-action ${className}`.trim();
      button.dataset.action = action;
      button.dataset.id = String(category.id);
      button.textContent = label;
      actionGroup.append(button);
    }
    actions.append(actionGroup);
    row.append(nameCell, description, actions);
    return row;
  }

  function openDialog(category = null) {
    el.form.reset();
    el.formMessage.hidden = true;
    el.formMessage.textContent = "";
    state.editingId = category ? Number(category.id) : null;
    el.dialogTitle.textContent = category ? "Edit category" : "Add category";
    el.save.textContent = category ? "Save changes" : "Save category";
    if (category) {
      el.name.value = category.name || "";
      el.description.value = category.description || "";
    }
    el.dialog.showModal();
    el.name.focus();
  }

  function validate() {
    const name = el.name.value.trim();
    const description = el.description.value.trim();
    if (!name) return "Enter a category name.";
    if (name.length > 255) return "Category name must be at most 255 characters.";
    if (description.length > 2000) return "Description must be at most 2,000 characters.";
    const duplicate = state.categories.some((category) => Number(category.id) !== state.editingId
      && category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) return "A category with this name already exists.";
    return "";
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (state.saving) return;
    const validationMessage = validate();
    if (validationMessage) {
      showFormError(validationMessage);
      return;
    }
    const payload = { name: el.name.value.trim(), description: el.description.value.trim() || null };
    const editingId = state.editingId;
    state.saving = true;
    el.save.disabled = true;
    el.save.textContent = editingId ? "Saving…" : "Adding…";
    try {
      const result = editingId
        ? await api.updateAdminCategory(editingId, payload)
        : await api.createAdminCategory(payload);
      if (!result || Number(result.id) <= 0 || result.name !== payload.name) {
        throw new Error("The backend response didn't confirm the saved category.");
      }
      el.dialog.close();
      announce(editingId ? "Category updated." : "Category added.");
      await loadCategories();
    } catch (error) {
      if (handleUnauthorized(error)) return;
      showFormError(error.status === 409
        ? `${error.message} Check the name and whether products still use this category.`
        : error.message || "The category couldn't be saved.");
    } finally {
      state.saving = false;
      el.save.disabled = false;
      el.save.textContent = state.editingId ? "Save changes" : "Save category";
    }
  }

  async function deleteCategory(id, button) {
    const category = state.categories.find((item) => Number(item.id) === id);
    if (!category || state.deleting.has(id)) return;
    if (!window.confirm(`Delete “${category.name}”? Categories with associated products cannot be deleted.`)) return;
    state.deleting.add(id);
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
      await api.deleteAdminCategory(id);
      announce(`Category “${category.name}” deleted.`);
      await loadCategories();
    } catch (error) {
      if (handleUnauthorized(error)) return;
      announce(error.status === 409
        ? `Category “${category.name}” could not be deleted because products are associated with it.`
        : error.message || "The category couldn't be deleted.", true);
      button.disabled = false;
      button.textContent = "Delete";
    } finally {
      state.deleting.delete(id);
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
    document.querySelector("#add-category-button").addEventListener("click", () => openDialog());
    document.querySelector("#close-category-dialog").addEventListener("click", () => el.dialog.close());
    document.querySelector("#cancel-category").addEventListener("click", () => el.dialog.close());
    el.form.addEventListener("submit", saveCategory);
    el.tableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = Number(button.dataset.id);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      if (button.dataset.action === "edit") {
        const category = state.categories.find((item) => Number(item.id) === id);
        if (category) openDialog(category);
      }
      if (button.dataset.action === "delete") void deleteCategory(id, button);
    });
    void loadCategories();
  }

  initialize();
})();
