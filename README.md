# Add to Toodledo

Chrome拡張機能 — 現在のタブのタイトル・URL・選択テキストからToodledoにタスクを追加します。

## 機能

- **ツールバーアイコン**からワンクリックでタスク追加
- 現在タブの**タイトル・URL・選択テキスト**を自動取得
- **APIモード**: Toodledo API v3 経由でバックグラウンドから直接追加
- **Webモード**: Toodledo Quick Add画面を開いてクリップボード経由で追加
- タグ・ノートの編集、デフォルトタグ設定
- Chrome通知による追加完了通知

## インストール

1. このリポジトリをクローンまたはダウンロード
2. Chrome で `chrome://extensions/` を開く
3. 「デベロッパーモード」をON
4. 「パッケージ化されていない拡張機能を読み込む」→ クローンしたフォルダを選択

## API連携の設定

1. [Toodledo API登録ページ](https://api.toodledo.com/3/account/doc_register.php)でアプリを登録
2. 拡張機能の設定画面に表示される **Redirect URI** を登録時に設定
3. 発行された **Client ID** と **Client Secret** を設定画面に入力
4. 「Toodledoと連携」ボタンで認証

## 技術仕様

- Manifest v3
- Toodledo API v3 (OAuth2)
- Chrome Identity API (`launchWebAuthFlow`)

## ライセンス

MIT
