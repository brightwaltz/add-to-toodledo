// background.js — Service Worker
// Toodledo API モジュールを読み込み、ポップアップ/オプションからのメッセージを処理

importScripts('toodledo-api.js');

/**
 * メッセージハンドラー
 * popup.js / options.js からのリクエストを処理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 非同期処理のため true を返す
  handleMessage(request).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleMessage(request) {
  switch (request.action) {
    // === OAuth認証フロー ===
    case 'authenticate': {
      const settings = await getStoredSettings();
      if (!settings.clientId || !settings.clientSecret) {
        throw new Error('Client IDとClient Secretを先に保存してください。');
      }

      // 1. 認可コードを取得
      const code = await getAuthorizationCode(settings.clientId);

      // 2. アクセストークンに交換
      const tokens = await exchangeCodeForToken(
        code,
        settings.clientId,
        settings.clientSecret
      );

      // 3. トークンを保存
      await saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);

      return { success: true, message: 'Toodledoと連携しました。' };
    }

    // === タスク追加 ===
    case 'addTask': {
      const result = await addTask(
        request.title,
        request.note,
        request.tag,
        request.duedate,
        request.priority
      );

      // 成功通知
      showNotification('タスク追加完了', `「${request.title}」を追加しました。`);

      return { success: true, task: result };
    }

    // === 接続確認 ===
    case 'checkConnection': {
      const account = await getAccountInfo();
      return {
        success: true,
        connected: true,
        email: account.email || '',
        alias: account.alias || '',
      };
    }

    // === ログアウト ===
    case 'logout': {
      await clearTokens();
      return { success: true, message: 'ログアウトしました。' };
    }

    // === 認証状態確認 ===
    case 'getAuthStatus': {
      const settings = await getStoredSettings();
      const hasTokens = !!(settings.accessToken && settings.refreshToken);
      const hasCredentials = !!(settings.clientId && settings.clientSecret);
      return {
        success: true,
        authenticated: hasTokens,
        configured: hasCredentials,
      };
    }

    default:
      throw new Error(`未知のアクション: ${request.action}`);
  }
}

/**
 * Chrome通知を表示
 */
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
  });
}
