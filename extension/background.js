chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "checkLogin") {
    // Get token directly using callback
    chrome.storage.local.get("token", (result) => {
      const token = result.token;

      if (!token) {
        console.log("🚫 No token found");
        sendResponse({ loggedIn: false });
        return;
      }

      console.log("🔑 checkLogin token:", token);

      fetch("https://forsocials.com/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          console.log("📡 /me response:", res.status);
          sendResponse({ loggedIn: res.ok });
        })
        .catch(err => {
          console.error("❌ checkLogin error:", err);
          sendResponse({ loggedIn: false });
        });
    });

    return true;
  }

  if (message.action === "getAiReply") {
    console.log("🚀 Sending to server:", message.blocks);
    chrome.storage.local.get("token", (result) => {
      const token = result.token;
      console.log("🔑 Token for request:", token);

      fetch("https://forsocials.com/getAiReply", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          blocks: message.blocks,
          platform: message.platform
         })
      })
        .then(async (res) => {
          console.log("📡 getAiReply status:", res.status);
          const text = await res.text();
          console.log("🌐 Server raw response:", text);
          try {
            sendResponse(JSON.parse(text));
          } catch {
            sendResponse({ error: "Invalid JSON from server" });
          }
        })
          .catch(err => {
          console.error(err);
          sendResponse({ error: "Failed to fetch AI reply" });
        });
    });
    return true; // keep port open until sendResponse
  }

});
