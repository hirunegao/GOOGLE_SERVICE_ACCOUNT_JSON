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
  const now = new Date().toISOString();
  const auth = new google.auth.GoogleAuth({
    credentials: parseServiceAccountJson(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const row = [
    now,
    "test-page-id",
    "テスト書き込み",
    "テスト担当",
    now,
    now,
    now,
    now,
    "0",
    "FALSE",
    "TEST-001",
    "test",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  console.log("テスト行を追加しました。");
  console.log(`SPREADSHEET_ID=${spreadsheetId}`);
  console.log(`SHEET_NAME=${sheetName}`);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
