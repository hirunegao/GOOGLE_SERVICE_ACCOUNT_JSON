# 実装ステップ（指示書どおり）

このドキュメントは [Cursor 指示書（Notion）](https://scalloped-twig-3d3.notion.site/Cursor-89d1790fbaa347819425815e815c2d98) の手順を、**そのまま実行できるチェックリスト**にしたものです。

---

## Step 1: Google スプレッドシート

### 1-1. ファイル

- **名前**: `タイムカード外部ログ（改ざん検知用）`（任意）
- 管理者用 Google ドライブのフォルダに保存

### 1-2. ヘッダー行（A1〜L1）と M1

ログ用シート（例: `Sheet1`）の **1 行目**に、次の列名をそのまま入力する。**M1** は `改ざんフラグ`（数式は次項）。

| 列 | ヘッダー名 |
|----|------------|
| A | ログ記録日時 |
| B | NotionページID |
| C | Name |
| D | スタッフ |
| E | 日付（開始） |
| F | 終了時間 |
| G | ページ作成日時 |
| H | 最終編集日時 |
| I | 途中休憩（分） |
| J | 交通費 |
| K | ID |
| L | イベント種別 |
| M | 改ざんフラグ |

**一括入力**: `templates/headers-row1.csv` をインポート（または開いて 1 行目をコピー）できる。

### 1-3. M 列の数式（2 行目以降）

- **M2** に [sheets-formulas-m.md](./sheets-formulas-m.md) の数式を貼り、データ行の最終行まで **下方向にコピー**する（または同ドキュメントの ARRAYFORMULA 案を使う）。

### 1-4. Config シート（GitHub Actions / `sync.mjs` を使う場合）

- シート名 **`Config`** を追加し、**A1** は空のままにする（初回同期で「前回同期時刻」が入る）。
- Make のみの場合でも、Config は不要。

### 1-5. 権限・保護（指示書どおり）

1. **共有**
   - **管理者**（例: norio kajiwara）: **編集者**
   - **スタッフ全員**: **閲覧のみ**（または「リンクを知っている人は閲覧者」など、組織ルールに合わせる）
2. **シートの保護**（データ → シートと範囲を保護）
   - ログ用シートの **データが入る範囲**を、**管理者のみ編集可**にする。
   - **M 列の数式行**は編集不可のままにするか、管理者のみ編集に含める（運用で決める）。
3. サービスアカウントや Make 用 Google 接続アカウントには、**行の追記ができる編集権限**が必要なので、**自動化用アカウントは別**にし、スタッフ本人のログインとは分けると安全。

---

## Step 2: Make（Integromat）

### 2-1. シナリオ

- **名前**: `タイムカード外部ログ記録` など
- **トリガー**: 即時（Instant）または **5 分間隔のポーリング**（プランに応じる）

### 2-2. Module 1: Notion — Watch Database Items

| 設定 | 値 |
|------|-----|
| Connection | Notion（Internal Integration のトークン） |
| Watch | **Updated Pages** |
| Database | **タイムカード** DB |
| Limit | 10（例） |

### 2-3. Module 2（任意）: Notion — Get a Database Item

Watch でプロパティが足りない場合、**ページ ID** で **Get a Database Item** を挟む。

### 2-4. Module 3: Google Sheets — Add a row

| 列 | マッピング例（Make の表記は実際のモジュール出力に合わせる） |
|----|----------------------------------------------------------|
| A ログ記録日時 | 現在日時（`now`） |
| B NotionページID | ページの `id` |
| C Name | タイトル（Name） |
| D スタッフ | リレーション解決後の名前（または ID） |
| E 日付（開始） | 該当 date プロパティの開始 |
| F 終了時間 | 該当 date プロパティの開始 |
| G ページ作成日時 | システムの作成日時 |
| H 最終編集日時 | システムの最終編集日時 |
| I 途中休憩（分） | number |
| J 交通費 | checkbox → TRUE/FALSE |
| K ID | 自動採番 / unique_id |
| L イベント種別 | 固定 `updated` |

### 2-5. Notion 側の接続（必須）

1. [Notion Developers（My integrations）](https://www.notion.so/my-integrations) で **New integration**
2. 名前: 例 `タイムカードログ用`
3. Capabilities: **Read content**（必要に応じて更新系は使わない設計なら Read のみ）
4. **Internal Integration Secret** をコピー → Make の Notion 接続に貼る
5. **タイムカード**データベースを開き、**… → 接続** で作成したインテグレーションを追加

---

## Step 3: 改ざんの見方（M 列）

| 区分 | 条件の目安 |
|------|------------|
| 正常 | 同一 **NotionページID（B 列）** の行が、運用として想定どおり（例: 開始・終了で 2 行など） |
| 要確認 | 同一 B で **行数が想定より多い**（例: 3 行以上） |
| 改ざん疑い | 同一 B について、**日付（開始）** または **終了時間** の値が、過去行と **食い違う履歴**が残っている |

具体的な数式は [sheets-formulas-m.md](./sheets-formulas-m.md) を参照。

---

## Step 4: テスト手順

1. Make のシナリオを **ON** にする。
2. Notion のタイムカードで **開始** を記録する → 数分以内にスプレッドシートに **1 行**増える。
3. **終了** を記録する → **もう 1 行**増える。
4. Notion で **日付（開始）** を手動変更する → **さらに 1 行**増え、**E 列**が以前の行と異なることを確認する。
5. **M 列**で「要確認」「改ざん疑い」が想定どおり付くか確認する。

---

## Step 5: 補足（Notion Internal Integration）

1. [Notion Developers](https://www.notion.so/my-integrations) を開く。
2. **New integration** → 名前を付けて **Submit**。
3. **Internal Integration Secret** をコピー（Make / GitHub Secrets / ローカル `.env` 用）。
4. 対象の **データベース** を開き、**… → 接続** でインテグレーションを追加。

API リファレンス: [Notion API](https://developers.notion.com/)

---

## GitHub Actions（`sync.mjs`）との併用

- 同じ **A〜L 列**の定義でよい。
- **M 列**は数式のみ。スクリプトは **A〜L に追記**し、**M1** にヘッダー `改ざんフラグ` を自動で書く場合あり（初回のみ）。
- 同期のたびに **Config!A1** に前回同期時刻を保存する（Make では使わない）。
