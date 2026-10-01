import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests the toolbar/menu CSS states without opening the user's Zen profile.
const root = new URL("../", import.meta.url);
const scratch = await mkdtemp(join(tmpdir(), "media-log-zen-sidebar-"));
const session = `media-log-zen-${process.pid}`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response(Bun.file(new URL("scripts/fixtures/zen-sidebar.html", root)));
    if (path === "/fix.css") return new Response(Bun.file(new URL("browser-fixes/zen-media-log-toolbar.css", root)));
    return new Response("Not found", { status: 404 });
  },
});

async function cli(args, expectedFailure = false) {
  const child = Bun.spawn(["bunx", "@playwright/cli", `-s=${session}`, ...args], {
    cwd: scratch, stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  const output = stdout + stderr;
  assert.equal(code !== 0, expectedFailure, output);
  return output;
}

try {
  await cli(["open", server.url.href]);
  const before = await cli(["eval", "runLayoutChecks()"], true);
  assert.match(before, /nav-bar\/subviewbutton\/false/);
  assert.match(before, /"contentsHidden":false/);
  const after = await cli(["run-code", `async (page) => {
    await page.addStyleTag({url: ${JSON.stringify(new URL("fix.css", server.url).href)}});
    return await page.evaluate(() => runLayoutChecks());
  }`]);
  assert.match(after, /"passed":\s*25/);
  console.log("Reproduced the stale toolbar state; all 25 scoped layout checks passed.");
  console.log(`Browser-test artifacts: ${scratch}`);
} finally {
  try { await cli(["close"]); } finally { server.stop(true); }
}
