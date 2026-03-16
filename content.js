// content.js — ページ上の選択テキストを取得するためのコンテントスクリプト
// popup.js からメッセージを受け取り、選択テキストを返す

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelection') {
    // 現在のページで選択されているテキストを返す
    const selectedText = window.getSelection().toString().trim();
    sendResponse({ selectedText: selectedText });
  }
  return true; // 非同期レスポンスを許可
});
