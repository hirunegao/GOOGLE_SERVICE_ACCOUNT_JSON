# タイムカード外部ログ（GitHub 管理）

Notion「タイムカード」DBの更新を外部（Google スプレッドシート）に記録し、改ざん検知の根拠とするための設計・運用を **GitHub 上でバージョン管理**します。

元の指示書（公開ページ）: [Cursor 指示書（Notion）](https://scalloped-twig-3d3.notion.site/Cursor-89d1790fbaa347819425815e815c2d98)

## GitHub でやること（推奨）

| 用途 | 内容 |
|------|------|
| **仕様の固定** | この README と `docs/` の内容をコミットし、変更履歴を残す |
| **タスク管理** | GitHub Issues / Projects で構築・テストのチェックリストを追う |
| **自動化（任意）** | Make の代わりに **GitHub Actions** で定期実行し、Notion → Sheets に追記（下記） |
| **秘密情報** | API トークンは **Repository secrets** にのみ保存（リポジトリにコミットしない） |

## リポジトリを GitHub に載せる手順

ローカル（このフォルダ）で初回のみ:

```powershell
cd "d:\OneDrive\cursor\timecard-external-log"
git init
git add .
git commit -m "Initial commit: timecard external log spec and GitHub workflow stub"
```

GitHub 上で空のリポジトリを作成し、表示される URL に合わせて:

```powershell
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git branch -M main
git push -u origin main
```

GitHub CLI (`gh`) を使う場合:

```powershell
gh repo create <リポジトリ名> --private --source=. --remote=origin --push
```

## Make の代わりに GitHub Actions を使う場合

- **考え方**: Notion は「ページ更新のたびに GitHub を直接叩く」標準機能がないため、**定期ポーリング**（例: 5 分ごと）で DB を検索し、前回以降に更新されたページを Sheets に書く、という形が現実的です（元の Make の「更新監視」に近い）。
- **必要な Secrets**（リポジトリ → Settings → Secrets and variables → Actions）:
  - `NOTION_TOKEN` — Notion Internal Integration のシークレット
  - `NOTION_DATABASE_ID` — タイムカード DB の ID
  - Google 連携はサービスアカウント JSON を **1 つのシークレット**にまとめるか、Sheets 用に分割して保存
- **実装**: 本リポジトリには `.github/workflows/notion-timecard-log.yml` に **手動実行（workflow_dispatch）** 用の枠だけ置いてあります。中身のスクリプト（Node / Python 等）は環境に合わせて追加してください。

## 関連リンク

- [Notion API](https://developers.notion.com/)
- [Make](https://www.make.com/)
