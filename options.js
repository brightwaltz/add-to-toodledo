// options.js — 設定画面のロジック（v3: Free/Pro対応）

document.addEventListener('DOMContentLoaded', async () => {
  // === DOM要素 ===
  const clientIdEl = document.getElementById('clientId');
  const clientSecretEl = document.getElementById('clientSecret');
  const defaultTagEl = document.getElementById('defaultTag');
  const defaultPriorityEl = document.getElementById('defaultPriority');
  const defaultDueDateEl = document.getElementById('defaultDueDate');
  const redirectUriEl = document.getElementById('redirectUri');
  const connectionStatusEl = document.getElementById('connectionStatus');
  const accountInfoEl = document.getElementById('accountInfo');
  const saveStatusEl = document.getElementById('saveStatus');
  const testStatusEl = document.getElementById('testStatus');
  const proSaveStatusEl = document.getElementById('proSaveStatus');

  // ライセンス関連
  const licensePlanEl = document.getElementById('licensePlan');
  const licenseDetailEl = document.getElementById('licenseDetail');
  const btnUpgradeOpt = document.getElementById('btnUpgradeOpt');
  const btnLogin = document.getElementById('btnLogin');
  const proSettingsCard = document.getElementById('proSettingsCard');

  const btnSave = document.getElementById('btnSave');
  const btnSavePro = document.getElementById('btnSavePro');
  const btnAuth = document.getElementById('btnAuth');
  const btnTest = document.getElementById('btnTest');
  const btnLogout = document.getElementById('btnLogout');

  // === ライセンス状態を確認 ===
  let userIsPro = false;
  try {
    const licenseResult = await sendMessage({ action: 'getLicenseStatus' });
    userIsPro = licenseResult.isPro === true;
    applyLicenseUI(userIsPro, licenseResult);
  } catch (e) {
    console.warn('[options] ライセンス確認失敗:', e.message);
    applyLicenseUI(false, {});
  }

  // アップグレードボタン
  btnUpgradeOpt.addEventListener('click', () => {
    openUpgradePage();
  });

  // 既存Proユーザーのログイン
  btnLogin.addEventListener('click', () => {
    openLoginPage();
  });

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
    ['clientId', 'clientSecret', 'defaultTag', 'defaultPriority', 'defaultDueDate'],
    (data) => {
      if (data.clientId) clientIdEl.value = data.clientId;
      if (data.clientSecret) clientSecretEl.value = data.clientSecret;
      if (data.defaultTag) defaultTagEl.value = data.defaultTag;
      if (data.defaultPriority !== undefined && data.defaultPriority !== '') {
        defaultPriorityEl.value = data.defaultPriority;
      }
      if (data.defaultDueDate) {
        defaultDueDateEl.value = data.defaultDueDate;
      }

      // Client ID/Secretが設定済みなら「連携」ボタンを有効化
      if (data.clientId && data.clientSecret) {
        btnAuth.disabled = false;
      }
    }
  );

  // === 接続状態を確認 ===
  await checkConnectionStatus();

  // === API設定保存 ===
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

  // === Pro限定: デフォルト設定保存 ===
  btnSavePro.addEventListener('click', () => {
    if (!userIsPro) {
      showStatus(proSaveStatusEl, 'この機能はProプランで利用できます。', 'error');
      return;
    }
    const defaultPriority = defaultPriorityEl.value;
    const defaultDueDate = defaultDueDateEl.value;

    chrome.storage.local.set({ defaultPriority, defaultDueDate }, () => {
      showStatus(proSaveStatusEl, '✓ デフォルト設定を保存しました。', 'success');
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

  /**
   * ライセンス状態をUIに反映
   */
  function applyLicenseUI(isPro, licenseResult) {
    if (isPro) {
      licensePlanEl.textContent = 'Pro プラン';
      licensePlanEl.className = 'license-plan pro';

      // サブスク状態の表示
      const email = licenseResult.email || '';
      let detail = email ? `アカウント: ${email}` : 'Pro 機能がすべて有効です';
      if (licenseResult.subscriptionCancelAt) {
        const cancelDate = new Date(licenseResult.subscriptionCancelAt);
        detail += ` ・ ${cancelDate.toLocaleDateString('ja-JP')} に終了予定`;
      }
      licenseDetailEl.textContent = detail;

      // アップグレードボタン → サブスク管理ボタンに変更
      btnUpgradeOpt.textContent = 'サブスクリプション管理';
      btnUpgradeOpt.className = 'btn-manage';
      btnLogin.classList.add('hidden');

      // Pro設定セクションのロック解除
      proSettingsCard.classList.remove('pro-section-locked');
    } else {
      licensePlanEl.textContent = 'Free プラン';
      licensePlanEl.className = 'license-plan free';
      licenseDetailEl.textContent = 'タスク名・ノートのみ利用可能。Pro でタグ・期日・優先度・スターが使えます。';
      btnLogin.classList.remove('hidden');

      // Pro設定セクションをロック
      proSettingsCard.classList.add('pro-section-locked');
    }
  }

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
