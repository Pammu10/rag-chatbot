const apiKeyInput = document.querySelector("#apiKey");
const scrapeBtn = document.querySelector("#scrapeBtn");
const clearBtn = document.querySelector("#clearBtn");
const askForm = document.querySelector("#askForm");
const questionInput = document.querySelector("#question");
const statusEl = document.querySelector("#status");
const chatEl = document.querySelector("#chat");

const MAX_CHUNK_SIZE = 1200;
const OVERLAP = 200;

init();

async function init() {
  const { openaiApiKey = "" } = await chrome.storage.local.get(["openaiApiKey"]);
  apiKeyInput.value = openaiApiKey;
  renderHistory();
}

apiKeyInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ openaiApiKey: apiKeyInput.value.trim() });
  setStatus("Saved API key.");
});

scrapeBtn.addEventListener("click", async () => {
  setBusy(true);
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) throw new Error("No active tab.");

    const response = await chrome.tabs.sendMessage(tab.id, { type: "PAGE_TEXT" });
    if (!response?.text) throw new Error("Could not extract page text.");

    const chunks = chunkText(response.text, MAX_CHUNK_SIZE, OVERLAP);
    await chrome.storage.local.set({ [`rag:${tab.url}`]: { url: tab.url, title: tab.title, chunks, updatedAt: Date.now() } });
    setStatus(`Scraped ${chunks.length} chunks from this page.`);
  } catch (error) {
    setStatus(error.message || "Failed to scrape page.");
  } finally {
    setBusy(false);
  }
});

clearBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.url) return;
  await chrome.storage.local.remove([`rag:${tab.url}`, `chat:${tab.url}`]);
  setStatus("Cleared saved context and chat history for this page.");
  renderHistory();
});

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);

  try {
    const tab = await getActiveTab();
    const question = questionInput.value.trim();
    if (!tab?.url) throw new Error("No active tab URL.");
    if (!question) return;

    const { openaiApiKey = "" } = await chrome.storage.local.get(["openaiApiKey"]);
    if (!openaiApiKey.startsWith("sk-")) throw new Error("Add a valid OpenAI API key.");

    const pageData = (await chrome.storage.local.get([`rag:${tab.url}`]))[`rag:${tab.url}`];
    if (!pageData?.chunks?.length) throw new Error("No page context found. Click 'Scrape Page' first.");

    await appendChat(tab.url, "user", question);

    const context = retrieveTopK(question, pageData.chunks, 5);
    const answer = await askOpenAI(openaiApiKey, question, context, tab.url);

    await appendChat(tab.url, "assistant", answer);
    questionInput.value = "";
    await renderHistory();
    setStatus("Answered using retrieved page chunks.");
  } catch (error) {
    setStatus(error.message || "Failed to answer question.");
  } finally {
    setBusy(false);
  }
});

async function askOpenAI(apiKey, question, contextChunks, pageUrl) {
  const contextBlock = contextChunks.map((chunk, idx) => `[Chunk ${idx + 1}]\n${chunk}`).join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You answer questions only using the provided webpage context. If the answer is not in context, say you don't know.",
        },
        {
          role: "user",
          content: `PAGE: ${pageUrl}\n\nCONTEXT:\n${contextBlock}\n\nQUESTION:\n${question}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "No answer returned.";
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => token.length > 1);
}

function retrieveTopK(question, chunks, k) {
  const qTokens = tokenize(question);
  const qSet = new Set(qTokens);

  const scored = chunks
    .map((chunk) => {
      const tokens = tokenize(chunk);
      let overlap = 0;
      for (const token of tokens) {
        if (qSet.has(token)) overlap += 1;
      }
      const norm = Math.sqrt(tokens.length || 1);
      return { chunk, score: overlap / norm };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((x) => x.score > 0);

  return scored.length ? scored.map((x) => x.chunk) : chunks.slice(0, k);
}

function chunkText(text, chunkSize, overlap) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

async function appendChat(url, role, content) {
  const key = `chat:${url}`;
  const history = ((await chrome.storage.local.get([key]))[key]) || [];
  history.push({ role, content, at: Date.now() });
  await chrome.storage.local.set({ [key]: history });
}

async function renderHistory() {
  const tab = await getActiveTab();
  chatEl.innerHTML = "";
  if (!tab?.url) return;

  const key = `chat:${tab.url}`;
  const history = ((await chrome.storage.local.get([key]))[key]) || [];
  for (const message of history) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg";

    const role = document.createElement("div");
    role.className = "role";
    role.textContent = message.role === "user" ? "You" : "Assistant";

    const content = document.createElement("div");
    content.className = "content";
    content.textContent = message.content;

    wrapper.append(role, content);
    chatEl.appendChild(wrapper);
  }

  chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setBusy(isBusy) {
  scrapeBtn.disabled = isBusy;
  clearBtn.disabled = isBusy;
  questionInput.disabled = isBusy;
  askForm.querySelector("button").disabled = isBusy;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}
