// popup.js — ポップアップのメインロジック（段階2: API連携 + Web版フォールバック）

document.addEventListener('DOMContentLoaded', async () => {
  // === DOM要素 ===
  const taskTitleEl = document.getElementById('taskTitle');
  const taskNoteEl = document.getElementById('taskNote');
  const taskTagEl = document.getElementById('taskTag');
  const sourceUrlEl = document.getElementById('sourceUrl');
  const statusEl = document.getElementById('status');
  const warningBox = document.getElementById('warningBox');
  const tagGroup = document.getElementById('tagGroup');

  // ボタン群
  const btnRowApi = document.getElementById('btnRowApi');
  const btnRowWeb = document.getElementById('btnRowWeb');
  const btnAddApi = document.getElementById('btnAddApi');
  const btnCopyApi = document.getElementById('btnCopyApi');
  const btnOpenWeb = document.getElementById('btnOpenWeb');
  const btnCopyWeb = document.getElementById('btnCopyWeb');

  // モード切替タブ
  const modeTabs = document.querySelectorAll('.mode-tab');

  // 設定リンク
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('warningLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // === 現在のモード ===
  let currentMode = 'api'; // 'api' or 'web'

  // === 認証状態を確認 ===
  let isAuthenticated = false;
  try {
    const authStatus = await sendMessage({ action: 'getAuthStatus' });
    isAuthenticated = authStatus.authenticated;
    if (!authStatus.configured || !authStatus.authenticated) {
      warningBox.classList.remove('hidden');
    }
  } catch (e) {
    warningBox.classList.remove('hidden');
  }

  // === 現在のタブ情報を取得 ===
  let tabTitle = '';
  let tabUrl = '';
  let selectedText = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      tabTitle = tab.title || '';
      tabUrl = tab.url || '';

      // 選択テキスト取得
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
        if (response?.selectedText) {
          selectedText = response.selectedText;
        }
      } catch (e) {
        // content scriptが読み込まれていない特殊ページ
      }
    }
  } catch (e) {
    console.error('タブ情報取得エラー:', e);
  }

  // === フィールド初期値 ===
  taskTitleEl.value = selectedText || tabTitle;

  const noteParts = [];
  if (tabUrl) noteParts.push(tabUrl);
  if (selectedText && tabTitle) noteParts.push(`[${tabTitle}]`);
  taskNoteEl.value = noteParts.join('\n');

  sourceUrlEl.textContent = tabUrl || '（取得不可）';

  // デフォルトタグを読み込む
  chrome.storage.local.get(['defaultTag'], (data) => {
    if (data.defaultTag) {
      taskTagEl.value = data.defaultTag;
    }
  });

  // === モード切替 ===
  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      modeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      updateModeUI();
    });
  });

  function updateModeUI() {
    if (currentMode === 'api') {
      btnRowApi.classList.remove('hidden');
      btnRowWeb.classList.add('hidden');
      tagGroup.classList.remove('hidden');
    } else {
      btnRowApi.classList.add('hidden');
      btnRowWeb.classList.remove('hidden');
      tagGroup.classList.add('hidden');
    }
  }

  // === API モード: タスク追加 ===
  btnAddApi.addEventListener('click', async () => {
    const title = taskTitleEl.value.trim();
    const note = taskNoteEl.value.trim();
    const tag = taskTagEl.value.trim();

    if (!title) {
      showStatus('タスク名を入力してください。', 'error');
      taskTitleEl.focus();
      return;
    }

    // ボタンを無効化してローディング表示
    btnAddApi.disabled = true;
    btnAddApi.textContent = '追加中…';
    showStatus('Toodledo にタスクを追加しています…', 'loading');

    try {
      const result = await sendMessage({
        action: 'addTask',
        title,
        note,
        tag,
      });

      if (result.success) {
        const taskId = result.task?.id || '(ID不明)';
        showStatus(`✓ タスク「${title}」を追加しました！（ID: ${taskId}）`, 'success');
        console.log('[Add to Toodledo] タスク追加結果:', JSON.stringify(result));
        // 成功後、2秒でポップアップを閉じる
        setTimeout(() => window.close(), 2000);
      } else {
        showStatus(`エラー: ${result.error}`, 'error');
        console.error('[Add to Toodledo] エラー詳細:', JSON.stringify(result));
      }
    } catch (e) {
      showStatus(`エラー: ${e.message}`, 'error');
    } finally {
      btnAddApi.disabled = false;
      btnAddApi.textContent = 'タスクを追加';
    }
  });

  // === Web モード: Toodledo Quick Add を開く ===
  btnOpenWeb.addEventListener('click', () => {
    const title = taskTitleEl.value.trim();
    if (!title) {
      showStatus('タスク名を入力してください。', 'error');
      taskTitleEl.focus();
      return;
    }

    const toodledoUrl = 'https://www.toodledo.com/views/index.php?quick=1';
    navigator.clipboard.writeText(title).then(() => {
      chrome.tabs.create({ url: toodledoUrl });
      showStatus('✓ タスク名をコピーしました。Toodledoに貼り付けてください。', 'success');
    }).catch(() => {
      chrome.tabs.create({ url: toodledoUrl });
      showStatus('Toodledoを開きました（手動でタスク名を入力してください）。', 'info');
    });
  });

  // === コピーボタン（共通ロジック） ===
  function handleCopy() {
    const title = taskTitleEl.value.trim();
    const note = taskNoteEl.value.trim();
    const parts = [];
    if (title) parts.push(title);
    if (note) parts.push(note);
    const textToCopy = parts.join('\n');
    if (!textToCopy) {
      showStatus('コピーする内容がありません。', 'error');
      return;
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      showStatus('✓ クリップボードにコピーしました。', 'success');
    }).catch(() => {
      showStatus('コピーに失敗しました。', 'error');
    });
  }

  btnCopyApi.addEventListener('click', handleCopy);
  btnCopyWeb.addEventListener('click', handleCopy);

  // === ヘルパー関数 ===
  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    if (type !== 'loading') {
      setTimeout(() => { statusEl.className = 'status'; }, 4000);
    }
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // フォーカス
  taskTitleEl.focus();
  taskTitleEl.select();
});
