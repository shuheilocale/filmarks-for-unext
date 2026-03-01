# U-NEXT Ratings

U-NEXTの作品詳細ページに、FilmarksとRotten Tomatoesのレビュースコアを自動表示するChrome拡張機能です。

## 機能

- **Filmarks** — スコア（★）、サムネイル、マッチしたタイトルを表示
- **Rotten Tomatoes** — Tomatometer（🍅）とAudience Score（🍿）を表示
- 各スコアをクリックすると、該当作品のレビューページを新しいタブで開きます

## 仕組み

1. U-NEXTの作品ページから日本語タイトルと公開年を取得
2. Filmarksで作品を検索し、スコアと英語原題を取得
3. 英語原題を使ってRotten Tomatoesのスコアを取得
4. 公開年の近さで正しい作品をマッチング（±3年の許容範囲）

## インストール

### Chrome ウェブストアから

（審査通過後にリンクを追加予定）

### 手動インストール（開発用）

1. このリポジトリをクローン
   ```
   git clone https://github.com/shuheilocale/unext-ratings.git
   ```
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. クローンしたフォルダを選択

## ファイル構成

```
├── manifest.json     # 拡張機能の設定（Manifest V3）
├── background.js     # スコア取得ロジック（Service Worker）
├── content.js        # U-NEXTページへのUI注入
├── icons/            # 拡張機能アイコン（16/48/128px）
└── PRIVACY_POLICY.md # プライバシーポリシー
```

## 権限

- **host_permissions**: `filmarks.com`, `rottentomatoes.com` — スコア取得のためのHTTPリクエストに使用
- ユーザーデータの収集・保存は一切行いません

## プライバシー

詳細は [PRIVACY_POLICY.md](PRIVACY_POLICY.md) をご覧ください。

## ライセンス

MIT
