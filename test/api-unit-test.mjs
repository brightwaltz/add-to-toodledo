/**
 * Toodledo API 単体テスト
 * Node.js環境でAPIの通信ロジックをテストする。
 *
 * 使い方:
 *   1. 環境変数をセット:
 *      export TOODLEDO_CLIENT_ID="your_client_id"
 *      export TOODLEDO_CLIENT_SECRET="your_client_secret"
 *      export TOODLEDO_ACCESS_TOKEN="your_access_token"
 *   2. 実行:
 *      node test/api-unit-test.mjs
 *
 * ※ access_token は OAuth 認証後に chrome.storage.local から取得した値を使用してください。
 *    設定画面の「接続テスト」で接続確認後、DevTools > Application > Local Storage から確認可能。
 */

const TOODLEDO_ADD_URL = 'https://api.toodledo.com/3/tasks/add.php';
const TOODLEDO_ACCOUNT_URL = 'https://api.toodledo.com/3/account/get.php';

// === 環境変数から読み込み ===
const ACCESS_TOKEN = process.env.TOODLEDO_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('❌ TOODLEDO_ACCESS_TOKEN が設定されていません。');
  console.error('   export TOODLEDO_ACCESS_TOKEN="your_token"');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}`);
    failed++;
  }
}

// === テスト1: アカウント情報の取得 ===
async function testGetAccount() {
  console.log('\n📋 テスト1: アカウント情報の取得');

  const url = `${TOODLEDO_ACCOUNT_URL}?access_token=${ACCESS_TOKEN}`;
  const response = await fetch(url);
  const data = await response.json();

  assert(response.ok, 'HTTPステータスが200');
  assert(!data.errorCode, 'APIエラーなし');
  assert(typeof data.userid !== 'undefined', 'useridフィールドが存在');
  assert(typeof data.alias !== 'undefined' || typeof data.email !== 'undefined', 'aliasまたはemailが存在');

  if (!data.errorCode) {
    console.log(`    → alias: ${data.alias || '(なし)'}, pro: ${data.pro || 0}`);
  } else {
    console.log(`    → エラー: ${data.errorDesc}`);
  }
}

// === テスト2: タスクの追加 ===
async function testAddTask() {
  console.log('\n📋 テスト2: タスクの追加');

  const testTitle = `[テスト] Add to Toodledo 自動テスト ${new Date().toISOString()}`;
  const testNote = 'このタスクは自動テストで作成されました。削除して構いません。';

  const body = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    tasks: JSON.stringify([{
      title: testTitle,
      note: testNote,
      tag: 'test,auto-test',
    }]),
  }).toString();

  const response = await fetch(TOODLEDO_ADD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
  });

  const data = await response.json();

  assert(response.ok, 'HTTPステータスが200');
  assert(Array.isArray(data), 'レスポンスが配列');

  if (Array.isArray(data) && data.length > 0) {
    const task = data[0];
    assert(!task.errorCode, 'タスクにエラーなし');
    assert(task.id > 0, `タスクIDが返された (id: ${task.id})`);
    assert(task.title === testTitle, 'タイトルが一致');
    console.log(`    → 追加されたタスクID: ${task.id}`);
  }
}

// === テスト3: タイトルなしでタスク追加（エラーケース） ===
async function testAddTaskWithoutTitle() {
  console.log('\n📋 テスト3: タイトルなしでタスク追加（エラーケース）');

  const body = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    tasks: JSON.stringify([{ title: '' }]),
  }).toString();

  const response = await fetch(TOODLEDO_ADD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
  });

  const data = await response.json();

  assert(response.ok, 'HTTPステータスは200（APIレベルでエラー返却）');
  assert(Array.isArray(data), 'レスポンスが配列');

  if (Array.isArray(data) && data.length > 0) {
    const result = data[0];
    assert(result.errorCode === 601, `エラーコード601が返された (実際: ${result.errorCode})`);
    console.log(`    → エラー: ${result.errorDesc || 'Your task must have a title'}`);
  }
}

// === 実行 ===
async function runTests() {
  console.log('🧪 Toodledo API 単体テスト');
  console.log('='.repeat(50));

  try {
    await testGetAccount();
    await testAddTask();
    await testAddTaskWithoutTitle();
  } catch (e) {
    console.error(`\n💥 テスト実行エラー: ${e.message}`);
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 結果: ${passed} 通過 / ${failed} 失敗`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
