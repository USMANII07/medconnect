
// WELCOME PAGE NAVIGATION
const API_HOST = window.location.hostname || "127.0.0.1";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const API_BASE_URL = `${API_PROTOCOL}//${API_HOST}:5000/api`;
const openLogin = () => { window.location.href = "./pages/login.html"; };
const openSignup = () => { window.location.href = "./pages/signup.html"; };

document.getElementById("navLogin")?.addEventListener("click", openLogin);
document.getElementById("navSignup")?.addEventListener("click", openSignup);
document.getElementById("heroLogin")?.addEventListener("click", openLogin);
document.getElementById("heroSignup")?.addEventListener("click", openSignup);

// SIGNUP FORM
const signupForm = document.getElementById("signupForm");
if (signupForm) {
    const signupMessage = document.getElementById("signupMessage");
    const submitButton = document.getElementById("signupSubmit");
    const confirmPassword = document.getElementById("confirmPassword");

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        signupMessage.textContent = "";
        signupMessage.className = "form-message";

        if (!signupForm.reportValidity()) return;

        const formData = new FormData(signupForm);
        const password = formData.get("password");
        if (password !== confirmPassword.value) {
            showSignupMessage("Passwords do not match. Please check both fields.", "error");
            confirmPassword.focus();
            return;
        }

        const originalLabel = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = "Creating account…";
        submitButton.setAttribute("aria-busy", "true");

        try {
            const response = await fetch(API_BASE_URL + "/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.get("name").trim(),
                    email: formData.get("email").trim(),
                    password,
                    role: formData.get("role")
                })
            });
            const result = await response.json().catch(() => ({}));

            if (response.status === 201) {
                showSignupMessage("Your account has been created successfully.", "success");
                signupForm.reset();
            } else if (response.status === 409) {
                showSignupMessage("An account with this email already exists. Try signing in or use another email.", "error");
            } else if (response.status === 400) {
                showSignupMessage(result.message || "Please check your details and try again.", "error");
            } else {
                showSignupMessage(response.status >= 500
                    ? "The server could not create your account. Please try again shortly."
                    : (result.message || "Registration could not be completed. Please try again."), "error");
            }
        } catch (error) {
            showSignupMessage("Could not connect to MedConnect. Make sure the backend is running and try again.", "error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
            submitButton.removeAttribute("aria-busy");
        }
    });

    function showSignupMessage(message, type) {
        signupMessage.textContent = message;
        signupMessage.className = `form-message ${type}`;
    }
}

// LOGIN FORM
const loginForm = document.getElementById("loginForm");
if (loginForm) {
    const loginMessage = document.getElementById("loginMessage");
    const loginButton = document.getElementById("loginSubmit");
    const passwordInput = document.getElementById("loginPassword");
    const passwordToggle = document.getElementById("toggleLoginPassword");

    passwordToggle?.addEventListener("click", () => {
        const showPassword = passwordInput.type === "password";
        passwordInput.type = showPassword ? "text" : "password";
        passwordToggle.textContent = showPassword ? "Hide" : "Show";
        passwordToggle.setAttribute("aria-pressed", String(showPassword));
    });

    loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        loginMessage.textContent = "";
        loginMessage.className = "form-message";
        if (!loginForm.reportValidity()) return;

        const formData = new FormData(loginForm);
        const originalLabel = loginButton.textContent;
        loginButton.disabled = true;
        loginButton.textContent = "Signing in…";
        loginButton.setAttribute("aria-busy", "true");

        try {
            const response = await fetch(API_BASE_URL + "/auth/login", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: formData.get("email").trim(),
                    password: formData.get("password")
                })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                loginMessage.textContent = result.message ||
                    (response.status >= 500 ? "The server could not sign you in. Please try again." : "Unable to sign in.");
                loginMessage.className = "form-message error";
                return;
            }

            const dashboardByRole = {
                Customer: "./customer-dashboard.html",
                Pharmacist: "./pharmacist-dashboard.html",
                Admin: "./admin-dashboard.html"
            };
            const destination = dashboardByRole[result.user?.role];
            if (!destination) {
                loginMessage.textContent = "This account has an unsupported role. Please contact the administrator.";
                loginMessage.className = "form-message error";
                return;
            }
            window.location.replace(destination);
        } catch (error) {
            loginMessage.textContent = "Could not connect to MedConnect. Make sure the backend is running and try again.";
            loginMessage.className = "form-message error";
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = originalLabel;
            loginButton.removeAttribute("aria-busy");
        }
    });
}
