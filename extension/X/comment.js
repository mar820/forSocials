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
  for (let i = 0; i < 10; i++) {
    const toolbar = container.querySelector('[data-testid="ScrollSnap-SwipeableList"]');
    if (toolbar) return toolbar;
    await new Promise(r => setTimeout(r, 300));
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

  button.onclick = async () => {
    const tweetBox = tweetComposer.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"]');
    if (!tweetBox) {
      alert("Could not find the tweet box!");
      return;
    }

    const userComment = tweetBox.innerText.trim();
    if (!userComment) {
      alert("Please type something before rewriting!");
      return;
    }

    button.innerText = "Rewriting...";

    const { replies, error } = await getAIReply(userComment);

    if (error) {
      if (error === "trial_expired") {
        alert("⚠️ Your trial has expired. Please upgrade your account.");
      } else if (error === "limit_reached") {
        alert("⚠️ You’ve reached your AI usage limit. Try again later.");
      } else {
        alert("⚠️ AI Error: " + error);
      }
    } else if (replies && replies.length > 0) {
      const rewritten = replies[0];

      tweetBox.focus();
      tweetBox.innerText = rewritten;
      tweetBox.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    button.innerText = "Rewrite ✍️";
  };

  toolbar.appendChild(button);
}
