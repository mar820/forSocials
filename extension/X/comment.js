async function getAIReply(userComment){
  const blocks = [];
  if (userComment) blocks.push({ type: "text", text: userComment });

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

async function waitForToolbar(container) {
  const selectors = [
    '[data-testid="toolBar"]',
    'div[role="group"][aria-label*="Add"]',
    'div[data-testid="toolBar"]',
    '[data-testid="ScrollSnap-SwipeableList"]'
  ];

  for (let i = 0; i < 15; i++) {
    for (const sel of selectors) {
      const toolbar = container.closest("form")?.querySelector(sel)
                    || container.parentElement?.querySelector(sel)
                    || document.querySelector(sel);
      if (toolbar) return toolbar;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  return null;
}

async function addRewriteButtonX(tweetComposer) {
  const toolbar = await waitForToolbar(tweetComposer);
  if (!toolbar) return;

  if (toolbar.querySelector(".ai-rewrite-button")) return; // avoid duplicates

  const button = document.createElement("button");
  button.type = "button";
  button.innerText = "Rewrite ✍️";
  button.classList.add("ai-rewrite-button");
  button.disabled = true; // start disabled
  button.style.opacity = 0.5;

  const tweetBox = tweetComposer.querySelector('[data-testid^="tweetTextarea"]') || document.querySelector('[data-testid^="tweetTextarea"]');
  if (!tweetBox) return;

  button.onclick = async () => {

    const userComment = tweetBox.innerText.trim();
    if (!userComment) {
      alert("Please make sure you already have a comment writen!");
      return;
    }

    button.innerText = "Rewriting...";

    const { replies, error } = await getAIReply(userComment);


    if (error) {
      switch(error) {
        case "trial_expired":
          alert("🚫 Trial expired — Upgrade to use AI");
          button.style.opacity = "0.6";
          button.style.cursor = "not-allowed";
          button.disabled = true;
          return;
        case "limit_reached":
          alert("⚠️ Plan limit reached — Upgrade to re-write");
          button.style.opacity = "0.6";
          button.disabled = true;
          return;
        default:
          alert("❌ AI failed — Try again");
          button.disabled = false;
          return;
      }
    }
    else if (replies && replies.length > 0) {
      const rewritten = replies[0];

      tweetBox.focus();
      tweetBox.click();

      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, rewritten);

      // Fire an InputEvent
      const inputEvent = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: rewritten,
      });
      tweetBox.dispatchEvent(inputEvent);

      // Fire key events to trigger React internal state
      ['keydown', 'keyup', 'keypress'].forEach(type => {
        const e = new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: 'a',
          code: 'KeyA',
        });
        tweetBox.dispatchEvent(e);
      });

      tweetBox.dispatchEvent(inputEvent);
    }

    button.innerText = "Rewrite ✍️";
  };

  toolbar.appendChild(button);
}
