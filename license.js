// license.js — ライセンス管理モジュール
// ExtPay をラップし、Free/Pro の判定をアプリ全体で統一的に行う
//
// 使い方:
//   background.js: importScripts('ExtPay.js', 'license.js', 'toodledo-api.js');
//   popup.js / options.js: <script src="ExtPay.js"> + <script src="license.js">

// === ExtPay 初期化 ===
// ExtensionPay.com に登録した拡張ID（公開時に正式IDに変更）
const EXTPAY_ID = 'add-to-toodledo';
const extpay = ExtPay(EXTPAY_ID);

/**
 * Pro版の機能一覧（UI表示やゲート判定に使う定数）
 */
const PRO_FEATURES = {
  TAG:              'tag',       // タグ設定
  DUE_DATE:         'duedate',   // 期日設定
  PRIORITY:         'priority',  // 優先度設定
  STAR:             'star',      // スター設定
  DEFAULT_PRIORITY: 'defaultPriority', // デフォルト優先度
  DEFAULT_DUE_DATE: 'defaultDueDate',  // デフォルト期日
};

/**
 * ユーザーのライセンス状態を取得
 * @returns {Promise<{isPro: boolean, user: object}>}
 */
async function getLicenseStatus() {
  try {
    const user = await extpay.getUser();
    return {
      isPro: user.paid === true,
      user,
    };
  } catch (e) {
    console.warn('[License] ステータス取得失敗（オフライン等）:', e.message);
    // ネットワークエラー時はキャッシュを確認
    return await getCachedLicenseStatus();
  }
}

/**
 * キャッシュからライセンス状態を取得（オフライン対応）
 * 最後に確認した状態を24時間有効として返す
 */
function getCachedLicenseStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['_licenseCache'], (data) => {
      const cache = data._licenseCache;
      if (cache && cache.timestamp) {
        const ageMs = Date.now() - cache.timestamp;
        const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24時間の猶予期間
        if (ageMs < GRACE_PERIOD_MS) {
          resolve({ isPro: cache.isPro, user: cache.user || {} });
          return;
        }
      }
      // キャッシュなし or 期限切れ → Free扱い
      resolve({ isPro: false, user: {} });
    });
  });
}

/**
 * ライセンス状態をキャッシュに保存
 */
function cacheLicenseStatus(isPro, user) {
  chrome.storage.local.set({
    _licenseCache: {
      isPro,
      user: { paid: user.paid, email: user.email || null },
      timestamp: Date.now(),
    },
  });
}

/**
 * Pro判定のショートカット
 * @returns {Promise<boolean>}
 */
async function isPro() {
  const status = await getLicenseStatus();
  // 成功時はキャッシュを更新
  if (status.user && status.user.paid !== undefined) {
    cacheLicenseStatus(status.isPro, status.user);
  }
  return status.isPro;
}

/**
 * 支払いページを開く
 */
function openUpgradePage() {
  extpay.openPaymentPage();
}

/**
 * ログインページを開く（既に支払い済みのユーザー向け）
 */
function openLoginPage() {
  extpay.openLoginPage();
}
