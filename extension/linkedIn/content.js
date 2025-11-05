(async () => {
  await new Promise(r => setTimeout(r, 500));

  // We set the image as null so its optional
  async function getAiReplies(postText, urlImage = null){
    const blocks = [];
    if (postText) blocks.push({ type: "text", text: postText });
    if (urlImage) blocks.push({ type: "image_url", image_url: { url: urlImage } });

    const site = (() => {
      const hostname = window.location.hostname;
      if (hostname.includes("linkedin.com")) return "linkedin";
      if (hostname.includes("x.com")) return "x";
      return "unknown";
    })();

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAiReply", blocks, platform: site }, (data) => {

        if (!data) return resolve({ error: "No response" });

        // ⚠️ Detect backend trial expiration
        if (data.error && data.error.includes("Free trial expired")) {
          resolve({ error: "trial_expired" });
        } else if (data.error && data.error.includes("AI request limit")) {
          resolve({ error: "limit_reached" });
        } else if (!data?.choices) {
          resolve({ error: "no_choices" });
        } else {
          const replies = data.choices[0].message.content
            .split("\n")
            .filter(line => line.trim() !== "");
          resolve({ replies });
        }
      });
    });
  }



  async function addReplyButton(postElement) {
    if (postElement.querySelector(".ai-reply-button")) return;

    const button = document.createElement("button");
    button.innerText = "💡 AI Reply";
    button.className = "ai-reply-button";

    button.onclick = async () => {
      button.innerText = "AI is thinking💡";

      const postText = postElement.innerText.slice(0, 500);
      const image = postElement.querySelector(".update-components-image__image, .update-components-article__image");
      const imageUrl = image ? image.src : null;

      const aiResult = await getAiReplies(postText, imageUrl);


      if (aiResult.error) {
        switch(aiResult.error) {
          case "trial_expired":
            button.innerText = "🚫 Trial expired — Upgrade to use AI";
            button.style.opacity = "0.6";
            button.style.cursor = "not-allowed";
            button.disabled = true;
            return;
          case "limit_reached":
            button.innerText = "⚠️ Plan limit reached — Upgrade";
            button.style.opacity = "0.6";
            button.disabled = true;
            return;
          default:
            button.innerText = "❌ AI failed — Try again";
            button.disabled = false;
            return;
        }
      }

      const replies = aiResult.replies || [];

      let replyBox = postElement.querySelector(".ai-replies-box");
      if (!replyBox){
        replyBox = document.createElement("div");
        replyBox.className = "ai-replies-box";
        postElement.appendChild(replyBox);
      }

      replyBox.innerHTML = "";
      replies.forEach(reply => {
        const p = document.createElement("p");
        p.innerText = reply;

        p.onclick = async () => {
          const commentButton = postElement.querySelector("button.comment-button");
          if (!commentButton) return;

          commentButton.click();

          await new Promise(r => setTimeout(r, 1000));

          const commentBox = postElement.querySelector("textarea, [contenteditable='true']");
          if (!commentBox) return;

          commentBox.focus();
          if (commentBox.tagName === 'TEXTAREA') {
            commentBox.value = reply;
          } else {
            commentBox.textContent = reply;
          }

          const inputEvent = new Event('input', { bubbles: true });
          commentBox.dispatchEvent(inputEvent);
          replyBox.style.display = "none";
        };

        replyBox.appendChild(p);
      });

      replyBox.style.display = "block";
      button.innerText = "💡 AI Reply";
    };

    postElement.appendChild(button);
  }

  chrome.runtime.sendMessage({ action: "checkLogin" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("⚠️ Message error:", chrome.runtime.lastError);
    }

    if (response && response.loggedIn) {
      console.log("✅ User is logged in. Activating AI Reply buttons...");
      const observer = new MutationObserver(() => {
        document.querySelectorAll(".feed-shared-update-v2").forEach(post => {
          addReplyButton(post);
          addRewriteButton(post);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      console.log("❌ User not logged in. AI features disabled.");
    }
  });


  chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "showGlobalAlert") {
    showGlobalAlert(msg.message, msg.type);
  }
});

function showGlobalAlert(message, type = "info") {
  const existing = document.getElementById("forsocials-global-alert");
  if (existing) existing.remove();

  const alert = document.createElement("div");
  alert.id = "forsocials-global-alert";
  alert.innerText = message;

  const colors = {
    success: "#4caf50",
    error: "#f44336",
    warning: "#ff9800",
    info: "#2196f3"
  };

  alert.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type] || colors.info};
    color: white;
    font-weight: 500;
    padding: 12px 22px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.25);
    z-index: 999999;
    opacity: 0;
    transition: opacity 0.4s ease, top 0.4s ease;
  `;

  document.body.appendChild(alert);

  requestAnimationFrame(() => {
    alert.style.opacity = "1";
    alert.style.top = "40px";
  });

  setTimeout(() => {
    alert.style.opacity = "0";
    alert.style.top = "20px";
    setTimeout(() => alert.remove(), 500);
  }, 3000);
}

})();
