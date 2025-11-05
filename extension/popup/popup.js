let currentUser = null;
let remaining = 0;
let timeLeft = null;

const PLAN_LIMITS = {
  free: 20,
  starter: 500,
  pro: 2500,
  power: 10000,
  lifetime: 2500
};

async function createStripePayment(plan){
  try {
    const { token } = await chrome.storage.local.get("token");
    if (!token) console.log("Token was not found");

    const response = await fetch(`https://api.forsocials.com/createCheckoutSession`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({plan})
    });

    const data = await response.json();

    if (!data.url) throw new Error("Stripe session creation failed");

    window.open(data.url, "_blank");
  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    showAutoFadeAlert("Unable to start payment. Try again later.");
  }
}

async function fetchAndPrepareUserData(token) {

  const response = await fetch("https://api.forsocials.com/me", {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!response.ok) throw new Error("Failed to fetch user data");

  const userData = await response.json();
  currentUser = userData;

  remaining = PLAN_LIMITS[userData.subscription_plan] - userData.ai_requests_used_last_month;
  timeLeft = userData.time_left_for_ai_requests;

  // 🧠 Handle trial expiry globally
  if (
    !timeLeft ||
    timeLeft === "00:00:00" ||
    timeLeft === 0 ||
    (userData.subscription_plan === "free" && remaining <= 0)
  ) {
    remaining = 0;
    timeLeft = "Trial expired.";
  }

  return { userData, remaining, timeLeft };
}

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes.token) {
    if (changes.token.newValue) {
      // 🟢 User just logged in — fetch their data before rendering
      try {
        await new Promise(r => setTimeout(r, 150));
        await fetchAndPrepareUserData(changes.token.newValue);
        renderCurrentPlan(currentUser.subscription_plan, remaining, timeLeft);
        console.log(currentUser.subscription_plan);
      } catch (error) {
        console.error("Error fetching user data after login:", error);
        renderHome();
      }
    } else {
      // User logged out
      renderHome();
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {

  const { token } = await chrome.storage.local.get("token");
  if (!token) return renderHome();

  try {
    await fetchAndPrepareUserData(token);
    renderCurrentPlan(currentUser.subscription_plan, remaining, timeLeft);
    console.log(currentUser.subscription_plan);
  } catch (err) {
    console.error(err);
    renderHome();
  }
});



function renderHome(){
  const app = document.getElementById("app");
  app.innerHTML = `
    <h3>Welcome to <strong>ForSocials</strong></h3>
    <div class="container-holding-buttons">
      <button id="login">Log In</button>
      <button id="signup">Sign Up</button>
    </div>

    <p class="firstParagraph">We use your email solely for automated messages, information, and receipts. <strong>We never spam.<strong></p>
  `;

  document.getElementById("login").addEventListener("click", renderLogin);
  document.getElementById("signup").addEventListener("click", renderSignup);

}

function renderLogin(){
  const app = document.getElementById("app");
  app.innerHTML = `
    <h2>Log <strong>In</strong></h2>
    <div class="container-holding-input-login">
      <input type="email" id="email" placeholder="Email"/>
      <div style="position: relative;">
        <input type="password" id="password" placeholder="Password" style="padding-right: 30px;"/>
        <span id="togglePassword" style="
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          cursor: pointer;
          user-select: none;
        ">
          <!-- Eye SVG -->
          <svg id="eyeIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </span>
      </div>
    </div>
    <div class="container-holding-buttons-login">
      <button id="submitLogin">Log In</button>
      <button id="backHome">Back</button>
    </div>
  `;

  document.getElementById("backHome").addEventListener("click", renderHome);

  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  togglePassword.addEventListener("click", () => {
    const eyeIcon = document.getElementById("eyeIcon");
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      eyeIcon.style.fill = "#2563eb"; // optional color change
    } else {
      passwordInput.type = "password";
      eyeIcon.style.fill = "black";
    }
  });

  document.getElementById("submitLogin").addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("https://api.forsocials.com/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({email, password})
      })

      const data = await response.json();

      if (response.ok){
        chrome.storage.local.set({ token: data.token }, () => {
          console.log("JWT saved:", data.token);
        });
        showAutoFadeAlert(data.message);
        // renderFreePlan();
        chrome.tabs.query({ url: "*://*.linkedin.com/*" }, (tabs) => {
          tabs.forEach((tab) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => location.reload()
            });
          });
        });

        chrome.tabs.query({ url: "*://*.x.com/*" }, (tabs) => {
          tabs.forEach((tab) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => location.reload()
            });
          });
        });
      }else{
        showAutoFadeAlert(data.message);
      }

    } catch (error) {
      console.error(error);
      showAutoFadeAlert("An error occurred. Please try again.");
    }
  });
}


function renderSignup(){
  const app = document.getElementById("app");
  app.innerHTML = `
    <h2>Sign <strong>Up</strong></h2>
    <div class="container-holding-input-signup">
      <input type="email" id="email" placeholder="Email"/>
      <div style="position: relative;">
        <input type="password" id="password" placeholder="Password" style="padding-right: 30px;"/>
        <span id="togglePassword" style="
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          cursor: pointer;
          user-select: none;
        ">
          <!-- Eye SVG -->
          <svg id="eyeIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </span>
      </div>
    </div>
    <div class="container-holding-buttons-signup">
      <button id="submitSignup">Sign Up</button>
      <button id="backHome">Back</button>
    </div>
  `;

  document.getElementById("backHome").addEventListener("click", renderHome);

  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  togglePassword.addEventListener("click", () => {
    const eyeIcon = document.getElementById("eyeIcon");
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      eyeIcon.style.fill = "#2563eb"; // optional color change
    } else {
      passwordInput.type = "password";
      eyeIcon.style.fill = "black";
    }
  });

  document.getElementById("submitSignup").addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    console.log("Sending signup request:", { email, password });

    try {

      const response = await fetch("https://api.forsocials.com/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({email, password})
      });

      const data = await response.json();

      if (response.ok) {
        showAutoFadeAlert(data.message);
        renderHome();
      }else{
        showAutoFadeAlert(data.message);
      }

    } catch (error) {
      console.error(error);
      showAutoFadeAlert("An error occurred. Please try again later.");
    }
  });
}

function renderCurrentPlan(plan, remaining, timeLeft) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <h3><strong>ForSocials</strong></h3>
    <div class="container-holding-p-freePlan">
      <div class="container-holding-h2">
        <h2>Plan: ${capitalize(plan)}</h2>
      </div>
      <div class="container-holdinginfo">
        <p>AI replies left: <strong>${remaining}</strong></p>
        <p>Time left: ${timeLeft}</p>
      </div>
    </div>
    <div class="container-holding-buttons-freePlan">
      <button id="upgrade">Upgrade</button>
      <button id="logout">Log Out</button>
    </div>
  `;

  document.getElementById("logout").addEventListener("click", logout);
  document.getElementById("upgrade").addEventListener("click", renderAllPlan);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


function showPlanForUpgrade(plan, price, requests) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div>
      <h2>${capitalize(plan)}</h2>
      <div class="container-holding-info">
        <p>Price: $${price}</p>
        <p>Time: 1 month</p>
        <p>AI requests: ${requests}</p>
      </div>
      <div class="container-holding-buttons-Plan">
        <button id="start">Start</button>
        <button id="back">Back</button>
      </div>
    </div>
  `;

  document.getElementById("start").addEventListener("click", () => createStripePayment(plan));
  document.getElementById("back").addEventListener("click", renderAllPlan);
}


function renderAllPlan() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <h2>Upgrade Plan</h2>
    <div class="container-holding-allPlan">
      <button id="starter">Starter</button>
      <button id="pro">Pro</button>
      <button id="power">Power</button>
      <button id="lifetime">Lifetime</button>
    </div>
    <button id="backAllPlan">Back</button>
  `;

  document.getElementById("starter").addEventListener("click", () => showPlanForUpgrade("starter", 3, 500));
  document.getElementById("pro").addEventListener("click", () => showPlanForUpgrade("pro", 10, 2500));
  document.getElementById("power").addEventListener("click", () => showPlanForUpgrade("power", 20, 10000));
  document.getElementById("lifetime").addEventListener("click", () => showPlanForUpgrade("lifetime", 699, "2500 per month"));

  document.getElementById("backAllPlan").addEventListener("click", () => {
    renderCurrentPlan(currentUser.subscription_plan, remaining, timeLeft);
  });
}


async function logout() {
  try {
    await fetch("https://api.forsocials.com/logout", {
      method: "POST",
      credentials: "include"
    });

    // 🧹 Also remove the local token
    await chrome.storage.local.remove("token");

    showAutoFadeAlert("You logged out from ReplyRiser");

    chrome.tabs.query({ url: "*://*.linkedin.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => location.reload()
        });
      });
    });

    chrome.tabs.query({ url: "*://*.x.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => location.reload()
        });
      });
    });

    // renderHome();
  } catch (error) {
    console.error("Logout failed:", error);
    showAutoFadeAlert("Logout failed. Please try again.");
  }
}






// ////////////////////////////////////////////////////////////////
// AUTO CLOSING ALERT




// 🌟 Global Floating Alert with Circular Timer
function showAutoFadeAlert(message, color = "#2563eb", duration = 4000) {
  const alert = document.createElement("div");
  alert.className = "ai-alert";
  alert.innerHTML = `
    <span class="ai-alert-text">${message}</span>
    <button class="ai-alert-close" aria-label="Close alert">
      <svg class="ai-alert-ring" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" stroke="rgba(255,255,255,0.3)" stroke-width="3" fill="none"/>
        <circle cx="18" cy="18" r="16" stroke="white" stroke-width="3" fill="none" stroke-dasharray="100" stroke-dashoffset="0" stroke-linecap="round"/>
      </svg>
      <span class="ai-alert-x">×</span>
    </button>
  `;

  Object.assign(alert.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: color,
    color: "white",
    padding: "12px 16px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 999999,
    opacity: "1",
    transition: "opacity 0.5s ease, transform 0.5s ease",
  });

  document.body.appendChild(alert);

  // Animate circular timer
  const ring = alert.querySelector(".ai-alert-ring circle:nth-child(2)");
  let start = Date.now();
  const interval = setInterval(() => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    ring.setAttribute("stroke-dashoffset", 100 - progress * 100);
    if (progress >= 1) clearInterval(interval);
  }, 50);

  // Close logic
  const close = () => {
    alert.style.opacity = "0";
    alert.style.transform = "translateY(-20px)";
    setTimeout(() => alert.remove(), 500);
  };

  alert.querySelector(".ai-alert-close").onclick = close;
  setTimeout(close, duration);
}

// Inject minimal CSS
const style = document.createElement("style");
style.textContent = `
.ai-alert-close {
  position: relative;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.ai-alert-close svg {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
}
.ai-alert-x {
  position: relative;
  z-index: 2;
  font-size: 14px;
  line-height: 24px;
}
`;
document.head.appendChild(style);
// ////////////////////////////////////////////////////////////////
