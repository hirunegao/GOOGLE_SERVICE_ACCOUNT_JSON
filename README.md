# タイムカード外部ログ（GitHub 管理）

Notion「タイムカード」DBの更新を外部（Google スプレッドシート）に記録し、改ざん検知の根拠とするための設計・運用を **GitHub 上でバージョン管理**します。

元の指示書（公開ページ）: [Cursor 指示書（Notion）](https://scalloped-twig-3d3.notion.site/Cursor-89d1790fbaa347819425815e815c2d98)

**手順書（スプレッドシート / Make / 改ざん判定 / テスト）**: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)

**スプレッドシートの一括初期化**（ヘッダー・Config・M 列数式）: `scripts/setup-google-sheet.mjs`（[IMPLEMENTATION の 1-0](docs/IMPLEMENTATION.md)）。`GOOGLE_SERVICE_ACCOUNT_JSON` が必要。

## 含まれるもの

| 内容 | 説明 |
|------|------|
| `scripts/sync.mjs` | Notion API で「前回同期以降に更新されたページ」を取得し、Sheets の **A〜L 列**に追記（**M 列**は改ざんフラグ用・数式は手動または別ドキュメント） |
| `.github/workflows/notion-timecard-log.yml` | `npm ci` → `npm run sync` を実行（既定は **手動 `workflow_dispatch` のみ**。定期は YAML 内の `schedule` を有効化） |

同期の基準時刻はスプレッドシートの **`Config` シートの `A1`**（UTC の ISO 時刻）に保存します。初回は `A1` が空のため、`INITIAL_SYNC_DAYS`（既定 7）日前から取得します。

## 事前準備（Google）

1. Google Cloud でプロジェクトを作成し、**Google Sheets API** を有効化する。
2. **サービスアカウント**を作成し、JSON キーをダウンロードする。
3. ログ用スプレッドシートを開き、**共有**にサービスアカウントのメール（`...@....iam.gserviceaccount.com`）を追加し、**編集者**にする。
4. スプレッドシートの URL から **スプレッドシート ID**（`/d/` と `/edit` の間）を控える。

## 事前準備（Notion）

1. [Notion integrations](https://www.notion.so/my-integrations) で Internal Integration を作成し、**シークレット**を控える。
2. **タイムカード**のデータベースをそのインテグレーションに接続する（DB の「…」→ 接続）。
3. **スタッフ**リレーション先のデータベース／ページも、同じインテグレーションから読めるよう共有する（スタッフ名取得のため）。

## GitHub の Secrets（必須）

リポジトリの **Settings → Secrets and variables → Actions** に次を登録する。

| Secret 名 | 内容 |
|-----------|------|
| `NOTION_TOKEN` | Notion Internal Integration のシークレット |
| `NOTION_DATABASE_ID` | タイムカード DB の ID（32 文字のハイフン付き UUID） |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウント JSON の **全文**（改行そのままでもよい） |
| `SPREADSHEET_ID` | ログ用スプレッドシートの ID |

任意の **Variables**（同じ画面の Variables タブ）:

| Variable 名 | 例 |
|-------------|-----|
| `SHEET_NAME` | ログを書くシート名（未設定なら `Sheet1`） |
| `CONFIG_SHEET_NAME` | 同期時刻を置くシート名（未設定なら `Config`） |
| `INITIAL_SYNC_DAYS` | 初回のみ、`Config!A1` が空のとき何日前から取るか（未設定なら `7`） |

## ローカルで試す

```powershell
cd <このリポジトリのルート>
npm install
$env:NOTION_TOKEN="secret_..."
$env:NOTION_DATABASE_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
$env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content -Raw .\service-account.json
$env:SPREADSHEET_ID="..."
npm run sync
```

`GOOGLE_SERVICE_ACCOUNT_JSON` は JSON ファイルの内容をそのまま渡す（改行付きで可）。

## リポジトリを GitHub に載せる

```powershell
cd "d:\OneDrive\cursor\timecard-external-log"
git remote add origin https://github.com/<ユーザー>/<リポジトリ>.git
git push -u origin main
```

## 動作の要点

- Notion は `last_edited_time` が **前回同期時刻より後**のページだけを取得する。
- 実行のたびに **現在時刻**を `Config!A1` に書き戻す（成功時）。失敗時は A1 を更新しないので、次回は同じ範囲を再処理しやすい。
- ログ列は指示書どおり: ログ記録日時、NotionページID、Name、スタッフ、日付（開始）、終了時間、ページ作成日時、最終編集日時、途中休憩（分）、交通費、ID、イベント種別（`updated`）。

プロパティ名が DB と異なる場合は環境変数 `NOTION_PROP_*`（`.env.example` 参照）で上書きできる。

## 関連リンク

- [Notion API](https://developers.notion.com/)
- [Make](https://www.make.com/)
