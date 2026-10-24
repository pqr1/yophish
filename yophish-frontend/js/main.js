document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page || "auth";
  const token = localStorage.getItem("yophishToken");

  if (!token && page !== "auth") {
    window.location.href = "index.html";
    return;
  }

  if (token && page === "auth") {
    window.location.href = "overview.html";
    return;
  }

  highlightActiveLink();
  setupLogout();
  setupAuthForms();
});

function highlightActiveLink() {
  const current = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("active");
    }
  });
}

function setupLogout() {
  const logoutBtn = document.querySelector("[data-logout]");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("yophishToken");
    localStorage.removeItem("yophishUser");
    window.location.href = "index.html";
  });
}

function setupAuthForms() {
  const loginForm = document.querySelector("#loginForm");
  const signupForm = document.querySelector("#signupForm");
  const modeToggle = document.querySelector("[data-switch-mode]");
  const heading = document.querySelector("[data-auth-heading]");
  const signupPasswordInput = signupForm?.querySelector('input[name="password"]') ?? null;
  const signupConfirmInput = signupForm?.querySelector('input[name="confirmPassword"]') ?? null;
  const passwordHint = signupForm?.querySelector("#passwordHint") ?? null;
  const passwordRuleEls = signupForm
    ? Array.from(signupForm.querySelectorAll("[data-password-rule]"))
    : [];

  if (!loginForm || !signupForm || !modeToggle || !heading) return;

  let mode = "login";
  renderMode();

  modeToggle.addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    renderMode();
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const email = loginForm.email.value.trim();
      const password = loginForm.password.value.trim();
      const { token, user } = await api.post("/auth/login", { email, password });
      persistAuth(token, user);
      window.location.href = "overview.html";
    } catch (error) {
      alert(error.message);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const name = signupForm.name.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value.trim();
      const confirmPassword = signupForm.confirmPassword.value.trim();
      const ruleState = getPasswordRuleState(password, confirmPassword);
      const allRulesMet = Object.values(ruleState).every(Boolean);
      if (!allRulesMet) {
        updatePasswordIndicators(ruleState);
        alert("You must follow the password rules written above.");
        return;
      }
      await api.post("/auth/signup", { name, email, password });
      await sendWelcomeEmail(email);
      mode = "login";
      renderMode();
      alert("Account created successfully. You can now log in.");
    } catch (error) {
      alert(error.message);
    }
  });

  async function sendWelcomeEmail(email) {
    try {
      await api.post("/send-email", {
        to: email,
        subject: "Welcome to Yophish",
        html: "<p>Hi! Your account is ready.</p>",
      });
    } catch (error) {
      console.warn("Failed to trigger welcome email:", error.message);
    }
  }

  function renderMode() {
    const loginVisible = mode === "login";
    heading.textContent = loginVisible ? "Welcome back" : "Create your account";
    loginForm.style.display = loginVisible ? "block" : "none";
    signupForm.style.display = loginVisible ? "none" : "block";
    modeToggle.textContent = loginVisible
      ? "Need an account? Create one."
      : "Already registered? Log in.";
  }

  function getPasswordRuleState(password, confirmPassword) {
    return {
      length: password.length >= 10,
      number: /\d/.test(password),
      lower: /[a-z]/.test(password),
      upper: /[A-Z]/.test(password),
      match: confirmPassword.length > 0 && password === confirmPassword,
    };
  }

  function updatePasswordIndicators(state) {
    if (!signupPasswordInput || !signupConfirmInput || !passwordRuleEls.length) return;
    const currentState = state ?? getPasswordRuleState(
      signupPasswordInput.value,
      signupConfirmInput.value,
    );
    passwordRuleEls.forEach((el) => {
      const key = el.dataset.passwordRule;
      if (currentState[key]) {
        el.classList.add("valid");
      } else {
        el.classList.remove("valid");
      }
    });
    if (passwordHint) {
      const allPassed = Object.values(currentState).every(Boolean);
      passwordHint.classList.toggle("valid", allPassed);
    }
  }

  if (signupPasswordInput && signupConfirmInput) {
    signupPasswordInput.addEventListener("input", () => updatePasswordIndicators());
    signupConfirmInput.addEventListener("input", () => updatePasswordIndicators());
    updatePasswordIndicators();
  }
}

function persistAuth(token, user) {
  localStorage.setItem("yophishToken", token);
  localStorage.setItem("yophishUser", JSON.stringify(user));
}
