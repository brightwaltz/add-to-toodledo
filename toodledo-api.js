// toodledo-api.js — Toodledo API v3 との通信を担うモジュール
// background.js から importScripts で読み込む

/**
 * Toodledo API v3 の定数
 */
const TOODLEDO = {
  AUTH_URL: 'https://api.toodledo.com/3/account/authorize.php',
  TOKEN_URL: 'https://api.toodledo.com/3/account/token.php',
  ADD_TASK_URL: 'https://api.toodledo.com/3/tasks/add.php',
  ACCOUNT_URL: 'https://api.toodledo.com/3/account/get.php',
};

/**
 * chrome.storage.local から設定を取得するヘルパー
 */
function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['clientId', 'clientSecret', 'accessToken', 'refreshToken', 'tokenExpiry'],
      (data) => resolve(data)
    );
  });
}

/**
 * トークン情報を保存
 */
function saveTokens(accessToken, refreshToken, expiresIn) {
  const tokenExpiry = Date.now() + (expiresIn * 1000) - 60000; // 1分余裕
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { accessToken, refreshToken, tokenExpiry },
      () => resolve()
    );
  });
}

/**
 * トークンをクリア（ログアウト）
 */
function clearTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      ['accessToken', 'refreshToken', 'tokenExpiry'],
      () => resolve()
    );
  });
}

/**
 * OAuth2 認可コードの取得
 * chrome.identity.launchWebAuthFlow を使用
 */
async function getAuthorizationCode(clientId) {
  // state パラメータ（CSRF対策用ランダム文字列）
  const state = crypto.randomUUID();

  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = new URL(TOODLEDO.AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'basic tasks write');

  // launchWebAuthFlow でブラウザの認証ウィンドウを開く
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  // レスポンスURLから認可コードを抽出
  const url = new URL(responseUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    throw new Error(`認可エラー: ${error}`);
  }
  if (returnedState !== state) {
    throw new Error('stateパラメータが一致しません（CSRF検出）');
  }
  if (!code) {
    throw new Error('認可コードが取得できませんでした');
  }

  return code;
}

/**
 * 認可コードをアクセストークンに交換
 */
async function exchangeCodeForToken(code, clientId, clientSecret) {
  // Basic認証ヘッダー: client_id:client_secret をBase64エンコード
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(TOODLEDO.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      device: 'chrome_extension',
    }).toString(),
  });

  const data = await response.json();

  if (data.errorCode) {
    throw new Error(`トークン取得エラー: ${data.errorDesc || data.errorCode}`);
  }
  if (!data.access_token) {
    throw new Error('アクセストークンが取得できませんでした');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 7200,
  };
}

/**
 * リフレッシュトークンでアクセストークンを更新
 */
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(TOODLEDO.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      device: 'chrome_extension',
    }).toString(),
  });

  const data = await response.json();

  if (data.errorCode) {
    throw new Error(`トークン更新エラー: ${data.errorDesc || data.errorCode}`);
  }
  if (!data.access_token) {
    throw new Error('アクセストークンの更新に失敗しました');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 7200,
  };
}

/**
 * 有効なアクセストークンを取得
 * 期限切れの場合は自動的にリフレッシュ
 */
async function getValidAccessToken() {
  const settings = await getStoredSettings();

  if (!settings.accessToken || !settings.refreshToken) {
    throw new Error('未認証です。設定画面からToodledoと連携してください。');
  }

  // トークンが期限内ならそのまま返す
  if (settings.tokenExpiry && Date.now() < settings.tokenExpiry) {
    return settings.accessToken;
  }

  // 期限切れ → リフレッシュ
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error('Client IDまたはClient Secretが設定されていません。');
  }

  const tokens = await refreshAccessToken(
    settings.refreshToken,
    settings.clientId,
    settings.clientSecret
  );

  await saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
  return tokens.accessToken;
}

/**
 * Toodledo にタスクを追加
 * @param {string} title - タスク名（必須）
 * @param {string} note - ノート（任意）
 * @param {string} tag - タグ（任意）
 * @returns {object} 追加されたタスク情報
 */
async function addTask(title, note = '', tag = '') {
  const accessToken = await getValidAccessToken();

  // タスクオブジェクトを組み立て
  const task = { title };
  if (note) task.note = note;
  if (tag) task.tag = tag;

  const tasksJson = JSON.stringify([task]);
  console.log('[Add to Toodledo] タスク追加リクエスト:', tasksJson);

  const response = await fetch(TOODLEDO.ADD_TASK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      access_token: accessToken,
      tasks: tasksJson,
    }).toString(),
  });

  const responseText = await response.text();
  console.log('[Add to Toodledo] APIレスポンス (raw):', responseText);
  console.log('[Add to Toodledo] HTTPステータス:', response.status);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`APIレスポンスのパースに失敗: ${responseText.substring(0, 200)}`);
  }

  console.log('[Add to Toodledo] APIレスポンス (parsed):', JSON.stringify(data));

  // トップレベルエラー（オブジェクトとして返る場合）
  if (!Array.isArray(data)) {
    if (data.errorCode) {
      throw new Error(`APIエラー (${data.errorCode}): ${data.errorDesc || '不明なエラー'}`);
    }
    // 想定外の形式だが、idがあれば成功とみなす
    if (data.id) return data;
    throw new Error(`想定外のレスポンス形式: ${JSON.stringify(data).substring(0, 200)}`);
  }

  // 配列形式: 各要素をチェック
  if (data.length === 0) {
    throw new Error('APIから空のレスポンスが返されました');
  }

  const result = data[0];
  if (result.errorCode) {
    throw new Error(`タスク追加エラー (${result.errorCode}): ${result.errorDesc || '不明なエラー'}`);
  }

  // 成功: idフィールドがあるか確認
  if (!result.id) {
    throw new Error(`タスクIDが返されませんでした: ${JSON.stringify(result)}`);
  }

  return result;
}

/**
 * アカウント情報を取得（接続確認用）
 */
async function getAccountInfo() {
  const accessToken = await getValidAccessToken();

  const response = await fetch(`${TOODLEDO.ACCOUNT_URL}?access_token=${accessToken}`);
  const data = await response.json();

  if (data.errorCode) {
    throw new Error(`アカウント取得エラー: ${data.errorDesc || data.errorCode}`);
  }

  return data;
}
