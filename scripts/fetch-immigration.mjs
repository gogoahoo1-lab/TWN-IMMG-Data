// scripts/fetch-immigration.mjs
// 由 GitHub Actions 每小時執行：抓取移民署各機場人次預報，
// 彙整成單一 JSON 檔（data/immigration.json）提交回 repo，
// 供前端（GitHub Pages）以固定網址讀取，避免瀏覽器 CORS 問題。
//
// 需要 Node 18+（內建全域 fetch）。

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 要抓取的代碼：機場(IATA) + 出入境別(1入境/5出境/3過境) + 航廈
// TPE11 桃園T1入境、TPE12 桃園T2入境、TPE51 桃園T1出境、TPE52 桃園T2出境
const CODES = [
  { code: "TPE11", airport: "TPE", label: "桃園 T1 入境", dir: "in",  terminal: "T1" },
  { code: "TPE12", airport: "TPE", label: "桃園 T2 入境", dir: "in",  terminal: "T2" },
  { code: "TPE51", airport: "TPE", label: "桃園 T1 出境", dir: "out", terminal: "T1" },
  { code: "TPE52", airport: "TPE", label: "桃園 T2 出境", dir: "out", terminal: "T2" }
];

const API_BASE = "https://opendata.immigration.gov.tw/APIS";
const OUT_PATH = new URL("../data/immigration.json", import.meta.url);

// 壅擠分級門檻（近 3 小時總人次）。可依實際觀察調整。
// green: 順暢；amber: 中等；red: 壅塞
function congestionLevel(total) {
  if (total >= 6000) return "red";
  if (total >= 3000) return "amber";
  return "green";
}

async function fetchWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "gh-actions-immigration-fetch" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      // 退避後重試
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchOne(item) {
  const url = `${API_BASE}/${item.code}`;
  try {
    const raw = await fetchWithRetry(url);
    const rows = Array.isArray(raw) ? raw : [];
    // 加總近 3 小時人次
    const total = rows.reduce((sum, r) => sum + (Number(r.paxCnt) || 0), 0);
    return {
      code: item.code,
      airport: item.airport,
      label: item.label,
      dir: item.dir,
      terminal: item.terminal,
      total,
      level: congestionLevel(total),
      rows: rows.length,   // 明細筆數（供除錯）
      ok: true
    };
  } catch (e) {
    return {
      code: item.code, airport: item.airport, label: item.label,
      dir: item.dir, terminal: item.terminal,
      total: null, level: "unknown", ok: false, error: String(e.message || e)
    };
  }
}

async function main() {
  const results = [];
  for (const item of CODES) {
    // 逐一抓取，避免對來源瞬間併發過高
    results.push(await fetchOne(item));
  }

  const payload = {
    updatedAt: new Date().toISOString(),           // UTC 時間戳
    updatedAtTaipei: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
    source: "內政部移民署 opendata.immigration.gov.tw/APIS",
    note: "total 為近 3 小時 paxCnt 加總；level 依門檻分級（green/amber/red）",
    items: results
  };

  await mkdir(dirname(fileURLToPath(OUT_PATH)), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const okCount = results.filter(r => r.ok).length;
  console.log(`寫入 ${fileURLToPath(OUT_PATH)}`);
  console.log(`成功 ${okCount}/${results.length}：` +
    results.map(r => `${r.code}=${r.ok ? r.total : "ERR"}`).join(" "));

  // 全部失敗才讓 job 失敗（部分失敗仍寫檔，前端可顯示 unknown）
  if (okCount === 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
