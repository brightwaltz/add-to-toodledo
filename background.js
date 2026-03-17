// background.js — Service Worker
// ExtPay（課金）→ ライセンス管理 → Toodledo API の順で読み込み

importScripts('ExtPay.js', 'license.js', 'toodledo-api.js');

// === ExtPay バックグラウンド初期化（必須・1回だけ呼ぶ） ===
extpay.startBackground();

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
        request.priority,
        request.star
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

    // === ライセンス状態確認（popup/optionsから呼ばれる） ===
    case 'getLicenseStatus': {
      // Service Worker内でExtPayインスタンスを再取得（SW制約対応）
      const ep = ExtPay(EXTPAY_ID);
      try {
        const user = await ep.getUser();
        const proStatus = user.paid === true;
        // キャッシュ更新
        cacheLicenseStatus(proStatus, user);
        return {
          success: true,
          isPro: proStatus,
          email: user.email || null,
          subscriptionStatus: user.subscriptionStatus || null,
          subscriptionCancelAt: user.subscriptionCancelAt
            ? user.subscriptionCancelAt.toISOString()
            : null,
        };
      } catch (e) {
        // オフライン時はキャッシュから
        const cached = await getCachedLicenseStatus();
        return {
          success: true,
          isPro: cached.isPro,
          email: cached.user?.email || null,
          subscriptionStatus: null,
          fromCache: true,
        };
      }
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
