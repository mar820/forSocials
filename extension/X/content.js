(async () => {

  await new Promise(r => setTimeout(r, 500));

  // 1️⃣ Check login first
  chrome.runtime.sendMessage({ action: "checkLogin" }, async (response) => {
    if (!response?.loggedIn) {
      console.log("❌ User not logged in → AI features disabled");
      return;
    }

    console.log("✅ User logged in → enabling AI reply features");


    async function getAiReply(tweetText, quotedText, images = []) {
      const blocks = [{ type: "text", text: tweetText }];
      if (quotedText) blocks.push({ type: "text", text: quotedText });
      images.forEach(url => blocks.push({ type: "image_url", url }));
      // if (tweetImageUrl && tweetImageUrl.length) { tweetImageUrl.forEach(image => { userPost.push({type: "image_url", image_url: {url: image}}); }) }


      const site = (() => {
        const hostname = window.location.hostname;
        if (hostname.includes("linkedin.com")) return "linkedin";
        if (hostname.includes("x.com")) return "x";
        return "unknown";
      })();

      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getAiReply", blocks, platform: site }, (response) => {
          if (!response) return resolve({ error: "No response" });

          if (response.error && response.error.includes("Free trial expired")) {
            resolve({ error: "trial_expired" });
          } else if (response.error && response.error.includes("AI request limit")) {
            resolve({ error: "limit_reached" });
          } else if (!response?.choices) {
            resolve({ error: "no_choices" });
          } else {
            const replies = response.choices[0].message.content
              .split("\n")
              .filter(line => line.trim() !== "");
            resolve({ replies });
          }
        });
      });
    }



    async function addReplyButton(postElement){

      if (postElement.querySelector(".ai-reply-button")) return;

      const footer = postElement.querySelector('div[role="group"]');
      if (!footer) {
        console.log("No footer found for this post:", postElement);
        return;
      }

      const button = document.createElement("button");
      button.innerText = "💡 AI Reply";
      button.className = "ai-reply-button";

      // const replyButton = postElement.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      const replyButton = postElement.querySelector('button[aria-label*="Reply"][data-testid="reply"]');
      if (!replyButton) return;

      footer.insertAdjacentElement("afterend", button);

      button.onclick = async () => {

        button.innerText = "AI is thinking💡";

        const tweetTextEl = postElement.querySelector("div[data-testid='tweetText']");
        const tweetText = tweetTextEl ? tweetTextEl.innerText.slice(0, 500) : "";

        const quotedEl = postElement.querySelector("div[aria-label='Quoted Tweet'] div[data-testid='tweetText']");
        const quotedText = quotedEl ? quotedEl.innerText.slice(0, 500) : "";

        const imageEls = postElement.querySelectorAll('div[data-testid="tweetPhoto"] img, div[data-testid="card.wrapper"] img');
        console.log("I am reading the image:", imageEls);
        const images = Array.from(imageEls).map(img => img.src);

        console.log("Found Images:", images);

        const aiResult = await getAiReply(tweetText, quotedText, images);


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


        let replyContainer = postElement.querySelector(".ai-replies-box");
        if (!replyContainer){
          replyContainer = document.createElement("div");
          replyContainer.className = "ai-replies-box";
          button.insertAdjacentElement("afterend", replyContainer);
        }


        replyContainer.innerHTML = "";
        replies.forEach(reply => {
          const p = document.createElement("p");
          p.innerText = reply;

          p.onclick = async () => {
            replyButton.click();

            let replyBox = null;
            for (let index = 0; index < 10; index++) {
              await new Promise(r => setTimeout(r, 1000));
              replyBox = document.querySelector('div[contenteditable="true"][data-testid^="tweetTextarea"]');
              if(replyBox) break;
            }

              if (!replyBox) {
                console.log("No reply box found!");
                return;
              }

            replyBox.focus();
            replyBox.click();

            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, reply);

            // Fire an InputEvent
            const inputEvent = new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: reply,
            });
            replyBox.dispatchEvent(inputEvent);

            // Fire key events to trigger React internal state
            ['keydown', 'keyup', 'keypress'].forEach(type => {
              const e = new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                key: 'a',
                code: 'KeyA',
              });
              replyBox.dispatchEvent(e);
            });

            replyBox.dispatchEvent(inputEvent);
            replyBox.style.display = "none";
          }
          replyContainer.appendChild(p);
        });

        replyContainer.style.display = "block";
        button.innerText = "💡 AI Reply";

      }
    }


    const observer = new MutationObserver(() => {
      document.querySelectorAll("article").forEach(post => addReplyButton(post));

      document.querySelectorAll('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"]').forEach(textarea => {
        const composer = textarea.closest('div[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_1"], form, div');
        if (composer) addRewriteButtonX(composer);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

  });
})();
