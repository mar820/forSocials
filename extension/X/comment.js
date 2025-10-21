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

  if (toolbar.querySelector(".ai-rewrite-button")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.innerText = "Rewrite ✍️";
  button.classList.add("ai-rewrite-button");

  button.onclick = async () => {

    const tweetBox = document.querySelector('[data-testid^="tweetTextarea"] div[contenteditable="true"]');
     const userComment = tweetBox.textContent.trim();
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

      const rewrittenText = replies[0];

      if (typeof rewrittenText !== "string" || rewrittenText.length === 0) {
        alert("❌ Invalid rewritten text received");
        button.disabled = false;
        button.innerText = "Rewrite ✍️";
        return;
      }

      tweetBox.focus();
      tweetBox.click();

      // small helper to wait a tick
      const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

      let succeeded = false;
      let lastError = null;

      // Strategy 1: Select all via Range + execCommand('insertText')
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(tweetBox);
        sel.removeAllRanges();
        sel.addRange(range);

        // Delete current contents first (helps React's model)
        document.execCommand("delete", false, null);

        // Insert new text
        const ok = document.execCommand("insertText", false, rewrittenText);
        await tick(30); // let browser/React breathe
        if (ok) {
          // dispatch final input event to sync frameworks
          tweetBox.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertFromPaste",
            data: rewrittenText
          }));
          succeeded = true;
        } else {
          // not supported in some browsers — not fatal
          lastError = new Error("execCommand('insertText') returned false");
        }
      } catch (err) {
        lastError = err;
        console.warn("Strategy 1 failed:", err);
      }

      // Strategy 2: beforeinput + input (without dataTransfer) — gentler than before
      if (!succeeded) {
        try {
          // clear via deleteContentBackward to signal deletion
          tweetBox.textContent = "";
          tweetBox.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward",
            data: null
          }));

          // dispatch beforeinput (no dataTransfer)
          const before = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: rewrittenText
          });
          const dispatchedBefore = tweetBox.dispatchEvent(before);

          // update visible DOM (some builds ignore beforeinput)
          tweetBox.textContent = rewrittenText;

          // final input event
          tweetBox.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: rewrittenText
          }));

          await tick(30);
          succeeded = true;
        } catch (err) {
          lastError = err;
          console.warn("Strategy 2 failed:", err);
        }
      }

      // Strategy 3: Clipboard + paste fallback (if allowed)
      if (!succeeded && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(rewrittenText);
          // select all
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(tweetBox);
          sel.removeAllRanges();
          sel.addRange(range);

          // dispatch paste event — many sites listen to paste
          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer()
          });
          // some browsers won't allow setting clipboardData programmatically; rely on document.execCommand('paste')
          const pasted = tweetBox.dispatchEvent(pasteEvent);
          // also try execCommand('paste') as fallback
          try { document.execCommand("paste"); } catch(e) {}
          await tick(50);

          // sync input event
          tweetBox.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
          succeeded = true;
        } catch (err) {
          lastError = err;
          console.warn("Strategy 3 (clipboard) failed:", err);
        }
      }

      // Strategy 4: Last-resort: set textContent + keyboard event synth
      if (!succeeded) {
        try {
          tweetBox.textContent = rewrittenText;

          tweetBox.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: rewrittenText
          }));

          // synthesize a quick keydown/keyup to nudge React
          ["keydown", "keyup"].forEach(type => {
            const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: "a", code: "KeyA" });
            tweetBox.dispatchEvent(e);
          });

          await tick(30);
          succeeded = true;
        } catch (err) {
          lastError = err;
          console.error("Strategy 4 failed too:", err);
        }
      }

      // Finalize & report
      if (!succeeded) {
        console.error("All insertion strategies failed. Last error:", lastError);
        // Show a helpful message to the user and keep button usable
        alert("❌ Could not insert rewritten text cleanly. Check console for details.");
        button.disabled = false;
        button.innerText = "Rewrite ✍️";
        return;
      }

      // success — re-enable button
      button.innerText = "Rewrite ✍️";
      button.disabled = false;

    }

    button.innerText = "Rewrite ✍️";
  };

  toolbar.appendChild(button);
}
