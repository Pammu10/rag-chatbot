# Page2Chat RAG Chrome Extension

This project turns any webpage into a chatbot using a simple retrieval-augmented generation (RAG) flow.

## What it does

1. Scrapes the active webpage text via a content script.
2. Chunks and stores page context in extension local storage.
3. Retrieves top-matching chunks for each user question.
4. Sends the retrieved context + question to OpenAI Chat Completions.
5. Displays chat history in the popup, per page URL.

## Setup

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open the extension popup.
5. Add your OpenAI API key.
6. On any webpage, click **Scrape Page**, then ask questions.

## Notes

- Data is stored locally in `chrome.storage.local`.
- Retrieval is lexical token-overlap based (lightweight in-browser retrieval).
- The assistant is prompted to answer only from retrieved context.
