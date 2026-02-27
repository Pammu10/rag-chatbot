chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PAGE_TEXT") return;

  const text = extractPageText();
  sendResponse({ text });
});

function extractPageText() {
  const cloned = document.body.cloneNode(true);
  const blocked = cloned.querySelectorAll("script, style, noscript, svg, canvas, nav, footer, header, aside, form");
  blocked.forEach((node) => node.remove());

  const text = cloned.innerText || document.body.innerText || "";
  return text.replace(/\s+/g, " ").trim();
}
