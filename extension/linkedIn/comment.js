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


async function addRewriteButton(postComment){
  const container = postComment.querySelector(".comments-comment-box__detour-container");

  if (!container) return;
  if (container.querySelector(".ai-rewrite-button")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.innerText = "Rewrite ✍️";
  button.classList.add("ai-rewrite-button");


  // Async because everything that happens inside the button, happens when the user clicks it.
  button.onclick = async () => {
    const commentBox = postComment.querySelector("textarea, [contenteditable='true']");

    if (!commentBox) return;

    const userComment = commentBox.tagName === "TEXTAREA" ? commentBox.value.trim() : commentBox.textContent.trim();

    if(!userComment.trim()){
      alert("Please make sure you already have a comment writen!");
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
      if (commentBox.tagName === "TEXTAREA") {
        commentBox.value = rewritten;
      } else {
        commentBox.textContent = rewritten;
      }
    }

    button.innerText = "Rewrite ✍️";
  };

  container.appendChild(button);
}
