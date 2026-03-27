/**
 * Notion「タイムカード」DB → Google スプレッドシート（外部ログ）
 * 前回同期時刻はスプレッドシートの Config シート A1 に保持する。
 */

import { Client } from "@notionhq/client";
import { google } from "googleapis";

const PROP = {
  title: process.env.NOTION_PROP_NAME ?? "Name",
  dateStart: process.env.NOTION_PROP_DATE_START ?? "日付（開始）",
  dateEnd: process.env.NOTION_PROP_DATE_END ?? "終了時間(ボタン用)",
  staff: process.env.NOTION_PROP_STAFF ?? "スタッフ",
  breakMin: process.env.NOTION_PROP_BREAK ?? "途中休憩（分）",
  transport: process.env.NOTION_PROP_TRANSPORT ?? "交通費",
  id: process.env.NOTION_PROP_ID ?? "ID",
};

const CONFIG_SHEET = process.env.CONFIG_SHEET_NAME?.trim() || "Config";
const LOG_SHEET = process.env.SHEET_NAME?.trim() || "Sheet1";
const INITIAL_SYNC_DAYS = Math.max(1, Number(process.env.INITIAL_SYNC_DAYS?.trim() || "7"));

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

function getTitle(prop) {
  if (!prop || prop.type !== "title" || !prop.title?.length) return "";
  return prop.title.map((t) => t.plain_text).join("");
}

function getDate(prop) {
  if (!prop || prop.type !== "date" || !prop.date) return "";
  const d = prop.date;
  if (d.end) return `${d.start} — ${d.end}`;
  return d.start ?? "";
}

function getNumber(prop) {
  if (!prop || prop.type !== "number") return "";
  const n = prop.number;
  return n === null || n === undefined ? "" : String(n);
}

function getCheckbox(prop) {
  if (!prop || prop.type !== "checkbox") return "";
  return prop.checkbox === true ? "TRUE" : prop.checkbox === false ? "FALSE" : "";
}

function getUniqueId(prop) {
  if (!prop) return "";
  if (prop.type === "unique_id" && prop.unique_id) {
    const u = prop.unique_id;
    const prefix = u.prefix ?? "";
    const num = u.number ?? "";
    return prefix ? `${prefix}-${num}` : String(num);
  }
  if (prop.type === "number" && prop.number != null) return String(prop.number);
  return "";
}

function getRelationIds(prop) {
  if (!prop || prop.type !== "relation" || !prop.relation?.length) return [];
  return prop.relation.map((r) => r.id);
}

async function buildStaffNameMap(notion, allStaffIds) {
  const map = new Map();
  const ids = [...new Set(allStaffIds)];
  for (const id of ids) {
    try {
      const page = await notion.pages.retrieve({ page_id: id });
      const titleProp = Object.values(page.properties).find((p) => p.type === "title");
      map.set(id, getTitle(titleProp) || id);
    } catch (e) {
      console.warn(`Staff page fetch failed ${id}:`, e.message);
      map.set(id, id);
    }
  }
  return map;
}

async function queryAllUpdatedSince(notion, databaseId, afterIso) {
  const pages = [];
  let cursor = undefined;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter: {
        timestamp: "last_edited_time",
        last_edited_time: { after: afterIso },
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 100,
      start_cursor: cursor,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function getConfigLastSync(sheets, spreadsheetId) {
  const range = `${CONFIG_SHEET}!A1`;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const v = res.data.values?.[0]?.[0];
    if (v && typeof v === "string" && v.trim()) return v.trim();
  } catch (e) {
    if (e.code !== 400) throw e;
  }
  return null;
}

async function setConfigLastSync(sheets, spreadsheetId, iso) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${CONFIG_SHEET}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [[iso]] },
  });
}

async function ensureSheetExists(sheetsAuth, spreadsheetId, title) {
  const meta = await sheetsAuth.spreadsheets.get({ spreadsheetId });
  const titles = meta.data.sheets.map((s) => s.properties.title);
  if (titles.includes(title)) return;
  await sheetsAuth.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
}

async function ensureLogHeader(sheetsAuth, spreadsheetId) {
  const range = `${LOG_SHEET}!A1:M1`;
  const res = await sheetsAuth.spreadsheets.values.get({ spreadsheetId, range });
  const row = res.data.values?.[0];
  const fullHeaders = [
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
  if (row && row.length >= 13) return;
  if (row && row.length >= 12) {
    await sheetsAuth.spreadsheets.values.update({
      spreadsheetId,
      range: `${LOG_SHEET}!M1`,
      valueInputOption: "RAW",
      requestBody: { values: [["改ざんフラグ"]] },
    });
    return;
  }
  await sheetsAuth.spreadsheets.values.update({
    spreadsheetId,
    range: `${LOG_SHEET}!A1:M1`,
    valueInputOption: "RAW",
    requestBody: { values: [fullHeaders] },
  });
}

async function appendRows(sheets, spreadsheetId, rows) {
  if (!rows.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${LOG_SHEET}!A:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

async function main() {
  const notionToken = requireEnv("NOTION_TOKEN");
  const databaseId = requireEnv("NOTION_DATABASE_ID");
  const spreadsheetId = requireEnv("SPREADSHEET_ID");
  const sa = parseServiceAccountJson();

  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheetsAuth = google.sheets({ version: "v4", auth });
  const notion = new Client({ auth: notionToken });

  await ensureSheetExists(sheetsAuth, spreadsheetId, CONFIG_SHEET);
  await ensureSheetExists(sheetsAuth, spreadsheetId, LOG_SHEET);
  await ensureLogHeader(sheetsAuth, spreadsheetId);

  let lastSync = await getConfigLastSync(sheetsAuth, spreadsheetId);
  if (!lastSync) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - INITIAL_SYNC_DAYS);
    lastSync = d.toISOString();
    console.log(`Config ${CONFIG_SHEET}!A1 が空のため、初回は ${INITIAL_SYNC_DAYS} 日前から取得: ${lastSync}`);
  }

  const pages = await queryAllUpdatedSince(notion, databaseId, lastSync);
  console.log(`Notion: last_edited_time > ${lastSync} → ${pages.length} 件`);

  const allStaffIds = [];
  for (const page of pages) {
    const p = page.properties[PROP.staff];
    allStaffIds.push(...getRelationIds(p));
  }
  const staffMap = await buildStaffNameMap(notion, allStaffIds);

  const loggedAt = new Date().toISOString();
  const rows = [];

  for (const page of pages) {
    const pr = page.properties;
    const staffIds = getRelationIds(pr[PROP.staff]);
    const staffLabel = staffIds.map((id) => staffMap.get(id) ?? id).join(", ");

    rows.push([
      loggedAt,
      page.id,
      getTitle(pr[PROP.title]),
      staffLabel,
      getDate(pr[PROP.dateStart]),
      getDate(pr[PROP.dateEnd]),
      page.created_time ?? "",
      page.last_edited_time ?? "",
      getNumber(pr[PROP.breakMin]),
      getCheckbox(pr[PROP.transport]),
      getUniqueId(pr[PROP.id]),
      "updated",
    ]);
  }

  await appendRows(sheetsAuth, spreadsheetId, rows);

  const newSync = new Date().toISOString();
  await setConfigLastSync(sheetsAuth, spreadsheetId, newSync);
  console.log(`Sheets: ${rows.length} 行を追記。Config の前回同期時刻を ${newSync} に更新しました。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
