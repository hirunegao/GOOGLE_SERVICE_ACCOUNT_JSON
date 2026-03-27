/**
 * 共有スプレッドシートに IMPLEMENTATION.md 1-2〜1-3 相当のヘッダー・Config・M 列数式を一括適用する。
 * 必要: GOOGLE_SERVICE_ACCOUNT_JSON（編集者としてブックに共有済みの SA）
 *
 * 共有・保護（1-5）は UI 上の権限のため、このスクリプトでは行わない。
 */

import { google } from "googleapis";

const DEFAULT_SPREADSHEET_ID = "1POhwoAvOU2ar31ZK4Yn_pFYG2MZgtRjNy1gFK-qCtco";

const HEADERS = [
  "ログ記録日時",
  "NotionページID",
  "Name",
  "スタッフ",
  "日付（開始）",
  "終了時間",
  "ページ作成日時",
  "最終編集日時",
  "途中休憩（分）",
  "交通費",
  "ID",
  "イベント種別",
  "改ざんフラグ",
];

/** sheets-formulas-m.md パターン A（M2 用）。コピーで M3 以降に相対参照が追従する */
const FORMULA_M2 = `=IF(B2="","",
 IF(COUNTIF($B:$B,B2)>2,"要確認",
 IF(OR(COUNTUNIQUE(FILTER($E:$E,$B:$B=B2))>1,COUNTUNIQUE(FILTER($F:$F,$B:$B=B2))>1),"改ざん疑い","")))`;

const CONFIG_SHEET = "Config";
/** M2 を含む M 列の行数（M2〜M999 = 998 行） */
const FORMULA_ROW_COUNT = 998;

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function parseServiceAccountJson() {
  const raw = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  try {
    return JSON.parse(raw);
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON");
    process.exit(1);
  }
}

function findLogSheetId(sheets, preferredTitle) {
  if (preferredTitle) {
    const s = sheets.find((x) => x.properties.title === preferredTitle);
    if (s) return { id: s.properties.sheetId, title: s.properties.title };
  }
  for (const name of ["Sheet1", "シート1", "External"]) {
    const s = sheets.find((x) => x.properties.title === name);
    if (s) return { id: s.properties.sheetId, title: s.properties.title };
  }
  const first = sheets[0];
  return { id: first.properties.sheetId, title: first.properties.title };
}

async function ensureConfigSheet(sheetsApi, spreadsheetId, sheetList) {
  const titles = sheetList.map((s) => s.properties.title);
  if (titles.includes(CONFIG_SHEET)) return;
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: CONFIG_SHEET } } }],
    },
  });
  console.log(`作成: シート「${CONFIG_SHEET}」`);
}

async function main() {
  const spreadsheetId =
    process.env.SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  const logSheetName = process.env.SHEET_NAME?.trim();

  const sa = parseServiceAccountJson();
  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheetsApi = google.sheets({ version: "v4", auth });

  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const sheetList = meta.data.sheets;
  const { id: logSheetId, title: logTitle } = findLogSheetId(
    sheetList,
    logSheetName
  );
  console.log(`ログシート: "${logTitle}" (sheetId=${logSheetId})`);

  await ensureConfigSheet(sheetsApi, spreadsheetId, sheetList);

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `'${logTitle.replace(/'/g, "''")}'!A1:M1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
  console.log("更新: A1:M1 ヘッダー");

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `'${logTitle.replace(/'/g, "''")}'!M2`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[FORMULA_M2]] },
  });
  console.log("更新: M2 数式");

  const mColStartRowIndex = 1;
  const mColEndRowExclusive = mColStartRowIndex + FORMULA_ROW_COUNT;
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId: logSheetId,
              startRowIndex: mColStartRowIndex,
              endRowIndex: mColStartRowIndex + 1,
              startColumnIndex: 12,
              endColumnIndex: 13,
            },
            destination: {
              sheetId: logSheetId,
              startRowIndex: mColStartRowIndex,
              endRowIndex: mColEndRowExclusive,
              startColumnIndex: 12,
              endColumnIndex: 13,
            },
            pasteType: "PASTE_NORMAL",
          },
        },
      ],
    },
  });
  console.log(
    `複製: M2 の数式を M2:M${mColEndRowExclusive} 相当の範囲へ（${FORMULA_ROW_COUNT} 行）`
  );

  console.log("\n完了。SPREADSHEET_ID:", spreadsheetId);
  console.log(
    "共有・保護はスプレッドシートの [共有] と [データ→シートと範囲を保護] で手動設定してください。"
  );
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
