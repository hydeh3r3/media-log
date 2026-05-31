import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const ASSET_DIR = join(ROOT, "store-assets", "chrome");
const SCREENSHOT_DIR = join(ASSET_DIR, "screenshots");
const STAGE_DIR = join(ROOT, "dist", "chrome-store-assets-stage");
const ICON_PATH = join(ROOT, "chrome-stable", "icons", "icon128.png");
const CHROME_TIMEOUT_MS = 8_000;
const CHROME_RENDER_POLL_MS = 250;

const SCREENSHOTS = [
  {
    name: "01-add-entry",
    activeTab: "Add",
    browserTitle: "Calm Software Notes",
    browserUrl: "https://example.com/articles/calm-software-notes",
    eyebrow: "Save From The Browser",
    headline: "Prefill the page title and URL, then add the media you want to remember.",
    popup: addPopup(),
  },
  {
    name: "02-this-week",
    activeTab: "This Week",
    browserTitle: "Weekly Media Queue",
    browserUrl: "https://example.com/week/current",
    eyebrow: "Review The Current Week",
    headline: "See this week at a glance, edit entries, export JSON, or close the week.",
    popup: weekPopup(),
  },
  {
    name: "03-history",
    activeTab: "History",
    browserTitle: "Archived Weeks",
    browserUrl: "https://example.com/archive",
    eyebrow: "Keep Weekly History",
    headline: "Archive older weeks while keeping clean lists that can be exported later.",
    popup: historyPopup(),
  },
  {
    name: "04-sync",
    activeTab: "Sync",
    browserTitle: "Media Log Sync",
    browserUrl: "https://example.com/sync",
    eyebrow: "Sync With iOS",
    headline: "Use Supabase sync after sign-in and the $2 paid unlock.",
    popup: syncPopup(),
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

async function runChrome(chromeBin, htmlPath, outputPath, width, height, profileName) {
  const profileDir = join(STAGE_DIR, `${profileName}-profile`);
  await rm(profileDir, { recursive: true, force: true });

  const args = [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-crash-reporter",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-service-autorun",
    "--password-store=basic",
    "--run-all-compositor-stages-before-draw",
    "--use-mock-keychain",
    "--virtual-time-budget=1000",
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    `--screenshot=${outputPath}`,
    pathToFileURL(htmlPath).href,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(chromeBin, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let lastSize = 0;
    let stableSizeCount = 0;
    let sawCompletedOutput = false;
    let settled = false;

    function outputSize() {
      try {
        return statSync(outputPath).size;
      } catch {
        return 0;
      }
    }

    function settle(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      callback(value);
    }

    const timeout = setTimeout(() => {
      if (outputSize() > 4096) {
        sawCompletedOutput = true;
        child.kill("SIGKILL");
        return;
      }
      child.kill("SIGKILL");
      settle(reject, new Error(`Chrome timed out before writing ${outputPath}. ${stderr || stdout}`));
    }, CHROME_TIMEOUT_MS);

    const poll = setInterval(() => {
      const size = outputSize();
      if (size > 4096 && size === lastSize) {
        stableSizeCount += 1;
      } else {
        stableSizeCount = 0;
      }
      lastSize = size;

      if (stableSizeCount >= 2) {
        sawCompletedOutput = true;
        child.kill("SIGKILL");
      }
    }, CHROME_RENDER_POLL_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => settle(reject, error));
    child.on("exit", (code) => {
      if (code === 0 || sawCompletedOutput || outputSize() > 4096) {
        settle(resolve);
        return;
      }
      settle(reject, new Error(stderr || stdout || `Chrome exited with ${code}.`));
    });
  });
}

async function assertPngDimensions(path, expectedWidth, expectedHeight) {
  const buffer = await readFile(path);
  const signature = buffer.subarray(0, 8).toString("hex");

  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG file.`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${path} must be ${expectedWidth}x${expectedHeight}; got ${width}x${height}.`);
  }
}

function pageShell({ activeTab, browserTitle, browserUrl, eyebrow, headline, popup }) {
  const tabLabels = ["Add", "This Week", "History", "Sync"];
  const tabs = tabLabels
    .map((tab) => `<button class="tab${tab === activeTab ? " active" : ""}">${escapeHtml(tab)}</button>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1280px; height: 800px; margin: 0; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #2d2b2a;
      background: linear-gradient(135deg, #f7efe7 0%, #ecf2ed 100%);
    }
    .stage {
      width: 1280px;
      height: 800px;
      display: grid;
      grid-template-columns: 1fr 392px;
      gap: 32px;
      padding: 40px;
    }
    .browser {
      overflow: hidden;
      border: 1px solid #d8d0c6;
      border-radius: 8px;
      background: #fffdf9;
      box-shadow: 0 24px 70px rgba(56, 48, 40, 0.14);
    }
    .browser-top {
      height: 58px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 18px;
      background: #e7ddd1;
      border-bottom: 1px solid #d2c7bb;
    }
    .traffic { display: flex; gap: 7px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: #da7756; }
    .dot:nth-child(2) { background: #d9b450; }
    .dot:nth-child(3) { background: #7c9a6e; }
    .url {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      border: 1px solid #cabfb3;
      border-radius: 999px;
      padding: 10px 16px;
      background: #fff;
      color: #6b645c;
      font-size: 14px;
    }
    .browser-body {
      height: calc(100% - 58px);
      display: grid;
      grid-template-columns: 1fr 230px;
      gap: 28px;
      padding: 48px;
      background:
        radial-gradient(circle at top right, rgba(124, 154, 110, 0.20), transparent 34%),
        #fffaf4;
    }
    .article h2 {
      max-width: 600px;
      font-size: 46px;
      line-height: 1.05;
      margin: 0 0 18px;
      color: #2f2b28;
    }
    .article p {
      max-width: 560px;
      margin: 0 0 28px;
      color: #6b645c;
      font-size: 20px;
      line-height: 1.45;
    }
    .article-lines { display: grid; gap: 12px; }
    .line { height: 12px; border-radius: 999px; background: #e2d8cf; }
    .line:nth-child(1) { width: 92%; }
    .line:nth-child(2) { width: 82%; }
    .line:nth-child(3) { width: 70%; }
    .capture-card {
      align-self: start;
      border: 1px solid #d8d0c6;
      border-radius: 8px;
      background: #f8f1e9;
      padding: 18px;
    }
    .capture-card strong {
      display: block;
      margin-bottom: 8px;
      color: #da7756;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .capture-card span {
      color: #6b645c;
      font-size: 15px;
      line-height: 1.4;
    }
    .popup {
      width: 360px;
      align-self: start;
      justify-self: end;
      overflow: hidden;
      border: 1px solid #d4cbc0;
      border-radius: 8px;
      background: #f5eee6;
      box-shadow: 0 24px 70px rgba(56, 48, 40, 0.18);
    }
    .popup header {
      padding: 12px 16px 0;
      background: #ede5da;
      border-bottom: 1px solid #d4cbc0;
    }
    .popup h1 {
      margin: 0 0 8px;
      color: #da7756;
      font-size: 15px;
      font-weight: 600;
    }
    .popup nav { display: flex; }
    .tab {
      flex: 1;
      padding: 8px 0;
      background: none;
      border: 0;
      border-bottom: 2px solid transparent;
      color: #8b8478;
      font-size: 12px;
      font-weight: 500;
    }
    .tab.active { color: #da7756; border-bottom-color: #da7756; }
    .panel { padding: 16px; }
    label {
      display: block;
      margin-bottom: 10px;
      color: #8b8478;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    input, select, textarea {
      display: block;
      width: 100%;
      margin-top: 4px;
      padding: 8px 10px;
      border: 1px solid #d4cbc0;
      border-radius: 6px;
      background: #fff;
      color: #2d2b2a;
      font: inherit;
      font-size: 13px;
    }
    textarea { height: 58px; resize: none; }
    .button {
      width: 100%;
      margin-top: 4px;
      padding: 10px;
      border: 0;
      border-radius: 6px;
      background: #da7756;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
    }
    .button.secondary {
      border: 1px solid #d4cbc0;
      background: transparent;
      color: #6b645c;
    }
    .button-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .entry-item {
      margin-bottom: 7px;
      padding: 9px 10px;
      border-left: 3px solid #da7756;
      border-radius: 6px;
      background: #fff;
    }
    .entry-title { font-size: 13px; font-weight: 700; }
    .entry-meta { margin-top: 3px; color: #8b8478; font-size: 11px; }
    .entry-note { margin-top: 5px; color: #6b645c; font-size: 12px; font-style: italic; }
    .entry-actions { display: flex; gap: 10px; margin-top: 7px; color: #8b8478; font-size: 11px; }
    .week-header, .sync-summary {
      margin-bottom: 10px;
      color: #8b8478;
      font-size: 12px;
      line-height: 1.5;
    }
    .history-week {
      margin-bottom: 8px;
      border: 1px solid #d4cbc0;
      border-radius: 6px;
      background: #fff;
    }
    .history-week summary {
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 700;
    }
    .history-entries { padding: 0 12px 12px; }
    .status { min-height: 18px; margin-top: 8px; color: #da7756; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <main class="stage">
    <section class="browser">
      <div class="browser-top">
        <div class="traffic"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div>
        <div class="url">${escapeHtml(browserUrl)}</div>
      </div>
      <div class="browser-body">
        <div class="article">
          <h2>${escapeHtml(browserTitle)}</h2>
          <p>${escapeHtml(headline)}</p>
          <div class="article-lines"><i class="line"></i><i class="line"></i><i class="line"></i></div>
        </div>
        <aside class="capture-card">
          <strong>${escapeHtml(eyebrow)}</strong>
          <span>Media Log keeps personal media notes grouped by week, with sync for Chrome and iOS.</span>
        </aside>
      </div>
    </section>
    <aside class="popup">
      <header>
        <h1>Media Log</h1>
        <nav>${tabs}</nav>
      </header>
      <section class="panel">${popup}</section>
    </aside>
  </main>
</body>
</html>`;
}

function addPopup() {
  return `
    <label>URL (optional)<input value="https://example.com/articles/calm-software-notes"></label>
    <label>Title<input value="Calm Software Notes"></label>
    <label>Type<select><option selected>Article</option></select></label>
    <label>Date<input value="2026-05-27"></label>
    <label>Rating (1-10)<input value="9"></label>
    <label>Note<textarea>Useful ideas for a quieter weekly workflow.</textarea></label>
    <div class="button">Add</div>
    <div class="status">Ready to save this entry.</div>
  `;
}

function weekPopup() {
  return `
    <div class="week-header">Week 2026-W22 - 4 entries</div>
    ${entryItem("Calm Software Notes", "Article - 2026-05-27 - 9/10", "Quiet systems, better attention.")}
    ${entryItem("A Small Weeknight Film", "Film - 2026-05-26 - 8/10", "Gentle pacing and a lovely ending.")}
    ${entryItem("Memory Palaces", "Podcast - 2026-05-25", "Save for a second listen.")}
    <div class="button">Export Week JSON</div>
    <div class="button-grid">
      <div class="button secondary">End Week</div>
      <div class="button secondary">Start New Week</div>
    </div>
  `;
}

function historyPopup() {
  return `
    <details class="history-week" open>
      <summary><span>2026-W21</span><span>3 entries</span></summary>
      <div class="history-entries">
        ${entryItem("Field Notes On Focus", "Book - 2026-05-20 - 8/10", "Short chapters, strong notes.")}
        ${entryItem("Evening Synths", "Music - 2026-05-19", "Good work playlist.")}
      </div>
    </details>
    <details class="history-week">
      <summary><span>2026-W20</span><span>5 entries</span></summary>
    </details>
    <div class="status">History stays grouped by ISO week.</div>
  `;
}

function syncPopup() {
  return `
    <label>Sync mode<select><option selected>Supabase</option></select></label>
    <label>Supabase URL<input value="https://project.supabase.co"></label>
    <label>Publishable key<input value="************"></label>
    <label>Email<input value="you@example.com"></label>
    <div class="button-grid">
      <div class="button">Sign In</div>
      <div class="button secondary">Unlock Sync ($2)</div>
    </div>
    <div class="button" style="margin-top: 8px;">Sync Now</div>
    <div class="sync-summary">Current entries: 4<br>Archived weeks: 2<br>Last sync: Ready after paid unlock</div>
    <div class="status">PostgreSQL sync is gated by the $2 unlock.</div>
  `;
}

function entryItem(title, meta, note) {
  return `
    <article class="entry-item">
      <div class="entry-title">${escapeHtml(title)}</div>
      <div class="entry-meta">${escapeHtml(meta)}</div>
      <div class="entry-note">${escapeHtml(note)}</div>
      <div class="entry-actions"><span>Edit</span><span>Delete</span></div>
    </article>
  `;
}

function promoHtml(iconDataUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 440px; height: 280px; margin: 0; overflow: hidden; }
    body {
      display: grid;
      grid-template-columns: 104px 1fr;
      gap: 20px;
      align-items: center;
      padding: 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #2d2b2a;
      background: linear-gradient(135deg, #f7efe7 0%, #eef4ef 100%);
    }
    img {
      width: 96px;
      height: 96px;
      border-radius: 22px;
      box-shadow: 0 16px 38px rgba(56, 48, 40, 0.18);
    }
    h1 {
      margin: 0 0 8px;
      color: #da7756;
      font-size: 32px;
      line-height: 1;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #5e6860;
      font-size: 17px;
      line-height: 1.35;
    }
    .chips { display: flex; gap: 8px; margin-top: 18px; }
    .chip {
      padding: 6px 10px;
      border-radius: 999px;
      background: #fff;
      color: #6b645c;
      font-size: 12px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <img src="${iconDataUrl}" alt="">
  <section>
    <h1>Media Log</h1>
    <p>Save weekly media notes and sync them with iOS.</p>
    <div class="chips"><span class="chip">Chrome</span><span class="chip">iOS</span><span class="chip">$2 Sync</span></div>
  </section>
</body>
</html>`;
}

await mkdir(SCREENSHOT_DIR, { recursive: true });
await rm(STAGE_DIR, { recursive: true, force: true });
await mkdir(STAGE_DIR, { recursive: true });

const chromeBin = findChromeBinary();
if (!chromeBin) {
  throw new Error("Google Chrome or Chromium was not found. Set CHROME_BIN to build store assets.");
}

for (const screenshot of SCREENSHOTS) {
  const htmlPath = join(STAGE_DIR, `${screenshot.name}.html`);
  const pngPath = join(SCREENSHOT_DIR, `${screenshot.name}.png`);
  await writeFile(htmlPath, pageShell(screenshot), "utf8");
  await mkdir(dirname(pngPath), { recursive: true });
  await runChrome(chromeBin, htmlPath, pngPath, 1280, 800, screenshot.name);
  await assertPngDimensions(pngPath, 1280, 800);
}

const icon = await readFile(ICON_PATH);
const promoPath = join(ASSET_DIR, "promo-small.png");
const promoHtmlPath = join(STAGE_DIR, "promo-small.html");
await writeFile(promoHtmlPath, promoHtml(`data:image/png;base64,${icon.toString("base64")}`), "utf8");
await runChrome(chromeBin, promoHtmlPath, promoPath, 440, 280, "promo-small");
await assertPngDimensions(promoPath, 440, 280);

console.log(`Chrome Web Store assets built in ${ASSET_DIR}`);
