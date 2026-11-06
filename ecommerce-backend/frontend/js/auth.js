(() => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function showMessage(message, type = "error") {
    const messageBox = document.querySelector("#auth-message");
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.classList.toggle("is-info", type === "info");
    messageBox.setAttribute("role", type === "info" ? "status" : "alert");
    messageBox.setAttribute("aria-live", type === "info" ? "polite" : "assertive");
    messageBox.hidden = false;
  }

  function clearMessage() {
    const messageBox = document.querySelector("#auth-message");
    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.hidden = true;
    messageBox.classList.remove("is-info");
    messageBox.setAttribute("role", "alert");
    messageBox.setAttribute("aria-live", "assertive");
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

  function validateEmail(input) {
    const email = input.value.trim();
    input.value = email;

    if (!email) {
      setFieldError(input, "Enter your email address.");
      return false;
    }
    if (!emailPattern.test(email)) {
      setFieldError(input, "Enter a valid email address, like you@example.com.");
      return false;
    }
    clearFieldError(input);
    return true;
  }

  function validatePassword(input) {
    if (!input.value) {
      setFieldError(input, "Enter your password.");
      return false;
    }
    if (input.value.length < 8) {
      setFieldError(input, "Your password must be at least 8 characters.");
      return false;
    }
    clearFieldError(input);
    return true;
  }

  function validateLogin(form) {
    const email = form.elements.email;
    const password = form.elements.password;
    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password);
    return { valid: emailValid && passwordValid, firstInvalid: !emailValid ? email : !passwordValid ? password : null };
  }

  function validateRegistration(form) {
    const name = form.elements.name;
    const email = form.elements.email;
    const password = form.elements.password;
    const confirmPassword = form.elements.confirmPassword;
    let nameValid = true;

    name.value = name.value.trim();
    if (!name.value) {
      setFieldError(name, "Enter your full name.");
      nameValid = false;
    } else if (name.value.length > 255) {
      setFieldError(name, "Your name must be 255 characters or fewer.");
      nameValid = false;
    } else {
      clearFieldError(name);
    }

    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password);
    let confirmationValid = true;

    if (!confirmPassword.value) {
      setFieldError(confirmPassword, "Confirm your password.");
      confirmationValid = false;
    } else if (confirmPassword.value !== password.value) {
      setFieldError(confirmPassword, "The passwords don't match yet.");
      confirmationValid = false;
    } else {
      clearFieldError(confirmPassword);
    }

    const firstInvalid = !nameValid ? name
      : !emailValid ? email
        : !passwordValid ? password
          : !confirmationValid ? confirmPassword
            : null;

    return { valid: !firstInvalid, firstInvalid };
  }

  function safeReturnUrl(role) {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    const defaultPath = role === "ADMIN" ? "admin/dashboard.html" : "index.html";
    if (!requested || requested.startsWith("//")) return defaultPath;

    try {
      const target = new URL(requested, window.location.href);
      const customerPaths = ["product-details.html", "cart.html", "checkout.html", "order-confirmation.html", "orders.html", "order-details.html", "index.html"];
      const adminPaths = ["admin/dashboard.html", "admin/products.html", "admin/categories.html", "admin/orders.html", "admin/order-details.html", "index.html"];
      const allowedPaths = (role === "ADMIN" ? adminPaths : customerPaths)
        .map((path) => new URL(path, window.location.href).pathname);
      return target.origin === window.location.origin && allowedPaths.includes(target.pathname)
        ? target.href
        : defaultPath;
    } catch {
      return defaultPath;
    }
  }

  async function submitLogin(form, submitButton, buttonLabel) {
    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    submitButton.setAttribute("aria-busy", "true");
    buttonLabel.textContent = "Signing in…";

    try {
      const result = await window.ShopEaseApi.login({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
      });
      window.ShopEaseApi.saveAccessToken(result);
      form.elements.password.value = "";
      window.location.assign(safeReturnUrl(result.role));
    } catch (error) {
      showMessage(error.message || "We couldn't sign you in. Check your details and try again.");
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
      submitButton.removeAttribute("aria-busy");
      buttonLabel.textContent = "Log in";
    }
  }

  async function submitRegistration(form, submitButton, buttonLabel) {
    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    submitButton.setAttribute("aria-busy", "true");
    buttonLabel.textContent = "Creating account…";

    try {
      const result = await window.ShopEaseApi.register({
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
      });
      if (!result || !Number.isSafeInteger(Number(result.id)) || result.role !== "CUSTOMER"
          || typeof result.email !== "string" || typeof result.name !== "string") {
        throw new Error("The registration response didn't match the backend format.");
      }
      form.reset();
      showMessage("Your account is ready. Sign in with your email and password to continue.", "info");
    } catch (error) {
      showMessage(error.message || "We couldn't create your account. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
      submitButton.removeAttribute("aria-busy");
      buttonLabel.textContent = "Create account";
    }
  }

  function handleFormSubmit(form, validation) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage();

      const result = validation(form);
      if (!result.valid) {
        showMessage("Please check the highlighted fields and try again.");
        result.firstInvalid?.focus();
        return;
      }

      const submitButton = form.querySelector(".auth-submit");
      const buttonLabel = submitButton?.querySelector(".button-label");
      if (!submitButton || !buttonLabel) return;

      if (form.id === "login-form") {
        if (!window.ShopEaseApi) {
          showMessage("Sign-in couldn't be loaded. Refresh the page and try again.");
          return;
        }
        await submitLogin(form, submitButton, buttonLabel);
        return;
      }
      if (!window.ShopEaseApi) {
        showMessage("Account creation couldn't be loaded. Refresh the page and try again.");
        return;
      }
      await submitRegistration(form, submitButton, buttonLabel);
    });

    form.addEventListener("input", (event) => {
      if (event.target.matches("input:not([type='checkbox'])")) clearFieldError(event.target);
    });
  }

  document.querySelectorAll("[data-toggle-password]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = document.getElementById(toggle.dataset.togglePassword);
      if (!input) return;

      const revealing = input.type === "password";
      input.type = revealing ? "text" : "password";
      toggle.textContent = revealing ? "Hide" : "Show";
      toggle.setAttribute("aria-label", `${revealing ? "Hide" : "Show"} password`);
      toggle.setAttribute("aria-pressed", String(revealing));
    });
  });

  const loginForm = document.querySelector("#login-form");
  if (loginForm) handleFormSubmit(loginForm, validateLogin);

  const registerForm = document.querySelector("#register-form");
  if (registerForm) handleFormSubmit(registerForm, validateRegistration);

  document.querySelector("#forgot-password-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    showMessage("Password recovery will be available in a future update.", "info");
  });
})();
