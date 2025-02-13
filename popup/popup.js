document.getElementById("save-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "saveProblem" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error sending message:", chrome.runtime.lastError);
    } else {
      console.log("Response from background:", response);
    }
  });
});
