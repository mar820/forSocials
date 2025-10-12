
async function getApiKey(){

  if (!chrome.runtime || !chrome.runtime.sendMessage) return null;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({action: "getApiKey"}, (response) => {
      resolve(response.key || null);
    });
  });
}


async function getAIReply(usersComment){

  const apiKey = await getApiKey();

    if (!apiKey) {
    alert("OOPS, you might need to have a look at your API_Key.");
  }


  const message = `Rewrite the following LinkedIn comment to be more concise, professional, and engaging, while keeping the original meaning (1-2 sentences):`;

  let usersMessage = [];

  if (usersComment){
    usersMessage.push({type: "text", text: usersComment});
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {role: "system", content: message},
        {role: "user", content: usersMessage}
      ],
      n:1
    })
  });

  const data = await response.json();
  if(!data.choices) return [];
  return data.choices[0].message.content.trim();
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

    const rewritten = await getAIReply(userComment);

    if (rewritten) {
      if (commentBox.tagName === "TEXTAREA"){
        commentBox.value = rewritten
      }else{
        commentBox.textContent = rewritten;
      }
    }

    button.innerText = "Rewrite ✍️";
  };

  container.appendChild(button);
}
