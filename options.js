// options.js — 設定画面のロジック

document.addEventListener('DOMContentLoaded', async () => {
  // === DOM要素 ===
  const clientIdEl = document.getElementById('clientId');
  const clientSecretEl = document.getElementById('clientSecret');
  const defaultTagEl = document.getElementById('defaultTag');
  const redirectUriEl = document.getElementById('redirectUri');
  const connectionStatusEl = document.getElementById('connectionStatus');
  const accountInfoEl = document.getElementById('accountInfo');
  const saveStatusEl = document.getElementById('saveStatus');
  const testStatusEl = document.getElementById('testStatus');

  const btnSave = document.getElementById('btnSave');
  const btnAuth = document.getElementById('btnAuth');
  const btnTest = document.getElementById('btnTest');
  const btnLogout = document.getElementById('btnLogout');

  // === Redirect URI を表示 ===
  const redirectUrl = chrome.identity.getRedirectURL();
  redirectUriEl.textContent = redirectUrl;
  redirectUriEl.addEventListener('click', () => {
    navigator.clipboard.writeText(redirectUrl).then(() => {
      redirectUriEl.style.borderColor = '#28a745';
      redirectUriEl.style.background = '#d4edda';
      setTimeout(() => {
        redirectUriEl.style.borderColor = '#ccc';
        redirectUriEl.style.background = '#f0f0f0';
      }, 1500);
    });
  });

  // === 保存済みの設定を読み込み ===
  chrome.storage.local.get(
    ['clientId', 'clientSecret', 'defaultTag'],
    (data) => {
      if (data.clientId) clientIdEl.value = data.clientId;
      if (data.clientSecret) clientSecretEl.value = data.clientSecret;
      if (data.defaultTag) defaultTagEl.value = data.defaultTag;

      // Client ID/Secretが設定済みなら「連携」ボタンを有効化
      if (data.clientId && data.clientSecret) {
        btnAuth.disabled = false;
      }
    }
  );

  // === 接続状態を確認 ===
  await checkConnectionStatus();

  // === 設定保存 ===
  btnSave.addEventListener('click', () => {
    const clientId = clientIdEl.value.trim();
    const clientSecret = clientSecretEl.value.trim();
    const defaultTag = defaultTagEl.value.trim();

    if (!clientId || !clientSecret) {
      showStatus(saveStatusEl, 'Client IDとClient Secretの両方を入力してください。', 'error');
      return;
    }

    chrome.storage.local.set({ clientId, clientSecret, defaultTag }, () => {
      showStatus(saveStatusEl, '✓ 設定を保存しました。', 'success');
      btnAuth.disabled = false;
    });
  });

  // === Toodledo連携（OAuth認証） ===
  btnAuth.addEventListener('click', async () => {
    btnAuth.disabled = true;
    btnAuth.textContent = '認証中…';
    showStatus(saveStatusEl, 'Toodledoの認証ウィンドウを開いています…', 'loading');

    try {
      const result = await sendMessage({ action: 'authenticate' });
      if (result.success) {
        showStatus(saveStatusEl, '✓ ' + result.message, 'success');
        await checkConnectionStatus();
      } else {
        showStatus(saveStatusEl, 'エラー: ' + result.error, 'error');
      }
    } catch (e) {
      showStatus(saveStatusEl, 'エラー: ' + e.message, 'error');
    } finally {
      btnAuth.disabled = false;
      btnAuth.textContent = 'Toodledoと連携';
    }
  });

  // === 接続テスト ===
  btnTest.addEventListener('click', async () => {
    btnTest.disabled = true;
    btnTest.textContent = 'テスト中…';
    showStatus(testStatusEl, '接続を確認しています…', 'loading');

    try {
      const result = await sendMessage({ action: 'checkConnection' });
      if (result.success && result.connected) {
        const info = result.alias || result.email || '接続OK';
        showStatus(testStatusEl, `✓ 接続成功（${info}）`, 'success');
        await checkConnectionStatus();
      } else {
        showStatus(testStatusEl, 'エラー: ' + (result.error || '接続できませんでした'), 'error');
      }
    } catch (e) {
      showStatus(testStatusEl, 'エラー: ' + e.message, 'error');
    } finally {
      btnTest.disabled = false;
      btnTest.textContent = '接続テスト';
    }
  });

  // === ログアウト ===
  btnLogout.addEventListener('click', async () => {
    if (!confirm('Toodledoとの連携を解除しますか？')) return;

    try {
      await sendMessage({ action: 'logout' });
      showStatus(testStatusEl, '✓ ログアウトしました。', 'info');
      await checkConnectionStatus();
    } catch (e) {
      showStatus(testStatusEl, 'エラー: ' + e.message, 'error');
    }
  });

  // === ヘルパー関数 ===

  async function checkConnectionStatus() {
    try {
      const status = await sendMessage({ action: 'getAuthStatus' });
      if (status.authenticated) {
        connectionStatusEl.innerHTML = `
          <span class="connection-badge badge-connected">
            <span class="badge-dot"></span>接続済み
          </span>`;
        // アカウント情報も取得してみる
        try {
          const account = await sendMessage({ action: 'checkConnection' });
          if (account.success) {
            const info = [account.alias, account.email].filter(Boolean).join(' / ');
            accountInfoEl.textContent = info ? `アカウント: ${info}` : '';
          }
        } catch (e) {
          // アカウント取得失敗は無視（トークン期限切れなど）
        }
      } else {
        connectionStatusEl.innerHTML = `
          <span class="connection-badge badge-disconnected">
            <span class="badge-dot"></span>未接続
          </span>`;
        accountInfoEl.textContent = '';
      }
    } catch (e) {
      // エラー時はデフォルト（未接続）表示
    }
  }

  function showStatus(el, message, type) {
    el.textContent = message;
    el.className = 'status ' + type;
    if (type !== 'loading') {
      setTimeout(() => { el.className = 'status'; }, 5000);
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
});
