import { google } from "googleapis";

const DEFAULT_SPREADSHEET_ID = "1POhwoAvOU2ar31ZK4Yn_pFYG2MZgtRjNy1gFK-qCtco";
const DEFAULT_SHEET_NAME = "Sheet1";

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

async function main() {
  const spreadsheetId = process.env.SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME?.trim() || DEFAULT_SHEET_NAME;

  const auth = new google.auth.GoogleAuth({
    credentials: parseServiceAccountJson(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const targetSheet = meta.data.sheets.find((s) => s.properties.title === sheetName);
  if (!targetSheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  const sheetId = targetSheet.properties.sheetId;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:L`,
  });

  const rows = res.data.values ?? [];
  const deleteRowIndexes = [];

  rows.forEach((row, i) => {
    const pageId = row[1] ?? "";
    const name = row[2] ?? "";
    const eventType = row[11] ?? "";
    if (pageId === "test-page-id" || name === "テスト書き込み" || eventType === "test") {
      // A2 が index 1 のため +1
      deleteRowIndexes.push(i + 1);
    }
  });

  if (deleteRowIndexes.length === 0) {
    console.log("削除対象のテスト行はありません。");
    return;
  }

  // 下から削除しないとインデックスがずれる
  deleteRowIndexes.sort((a, b) => b - a);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: deleteRowIndexes.map((rowIndex) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      })),
    },
  });

  console.log(`テスト行を ${deleteRowIndexes.length} 件削除しました。`);
  console.log(`SPREADSHEET_ID=${spreadsheetId}`);
  console.log(`SHEET_NAME=${sheetName}`);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
