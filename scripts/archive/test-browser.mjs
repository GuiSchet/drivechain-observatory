// Optional browser verification against the real local fixture/API.
// Set PULSE_PLAYWRIGHT_MODULE and PULSE_BROWSER_EXECUTABLE for an existing
// playwright-core/browser installation, or install playwright locally.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PULSE_PLAYWRIGHT_MODULE ?? "playwright");
const base = "http://127.0.0.1:13000";
const web = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "13000"], {
  cwd: new URL("../apps/web/", import.meta.url), stdio: "ignore",
});
const artifacts = process.env.PULSE_BROWSER_ARTIFACTS ?? "/tmp/drivechain-observatory-browser";
mkdirSync(artifacts, { recursive: true });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { const response = await fetch(base); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, "Next.js must become ready");
  browser = await chromium.launch({ headless: true, executablePath: process.env.PULSE_BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = window.EventSource;
    window.__pulseStreams = 0;
    window.__pulseMaxStreams = 0;
    window.EventSource = class extends Native {
      constructor(...args) { super(...args); this.counted = true; window.__pulseStreams++; window.__pulseMaxStreams = Math.max(window.__pulseMaxStreams, window.__pulseStreams); }
      close() { if (this.counted) { window.__pulseStreams--; this.counted = false; } super.close(); }
    };
  });
  await page.goto(base);
  await page.getByRole("heading", { name: "See the protocol move." }).waitFor();
  await page.screenshot({ path: artifacts + "/home.png", fullPage: true });
  await page.getByRole("link", { name: "BMM auctions", exact: true }).click();
  await page.getByRole("heading", { name: "BMM auctions", exact: true }).waitFor();
  await page.getByRole("cell", { name: "18,446,744,073,709,551,615", exact: true }).waitFor();
  await page.screenshot({ path: artifacts + "/bmm.png", fullPage: true });
  await page.getByRole("link", { name: "Inspect this observation’s evidence" }).click();
  await page.getByRole("heading", { name: "Event 3", exact: true }).waitFor();
  assert((await page.locator("pre").textContent()).includes("18446744073709551615"));
  await page.getByRole("button", { name: "Copy exact JSON", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes("18446744073709551615"));
  await page.getByRole("link", { name: "Data", exact: true }).click();
  await page.getByRole("heading", { name: "About the data", exact: true }).waitFor();
  await page.getByText("mainchain tip: healthy", { exact: true }).waitFor();
  await page.screenshot({ path: artifacts + "/data.png", fullPage: true });
  await page.getByRole("link", {name:"Blocks",exact:true}).click();
  await page.getByRole("heading", {name:"Block explorer",exact:true}).waitFor();
  await page.getByRole("heading", {name:"Observed branch · provisional",exact:true}).waitFor();
  await page.getByLabel("Height or block hash").fill("970144");
  await page.getByRole("button", {name:"Find block",exact:true}).click();
  await page.getByRole("cell", {name:"970144",exact:true}).waitFor();
  await page.getByLabel("Observations", {exact:true}).selectOption("all");
  await page.screenshot({path:artifacts+"/blocks.png",fullPage:true});
  await page.getByLabel("Height or block hash").fill("ab".repeat(32));
  await page.getByRole("button", {name:"Find block",exact:true}).click();
  await page.getByRole("heading", {name:"Block 970144",exact:true}).waitFor();
  await page.getByRole("heading", {name:"Connections and disconnections",exact:true}).waitFor();
  await page.getByRole("link", {name:"block connected · event 2",exact:true}).waitFor();
  await page.screenshot({path:artifacts+"/block-detail.png",fullPage:true});
  await page.getByRole("link", {name:"block connected · event 2",exact:true}).click();
  await page.getByRole("heading", {name:"Event 2",exact:true}).waitFor();
  assert.equal(await page.evaluate(() => window.__pulseMaxStreams), 1, "one shared SSE connection across navigation");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", {name:"Blocks",exact:true}).click();
  await page.getByRole("heading", {name:"Block explorer",exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"mobile explorer has no viewport overflow");
  await page.screenshot({path:artifacts+"/blocks-mobile.png",fullPage:true});
  await page.getByLabel("Height or block hash").fill("not a height");
  await page.getByRole("button", {name:"Find block",exact:true}).click();
  await page.getByText("Enter a block height or a 64-character hexadecimal block hash.").waitFor();
  await page.getByRole("link", { name: "BMM auctions", exact: true }).click();
  await page.getByRole("heading", { name: "BMM auctions", exact: true }).waitFor();
  assert(await page.getByRole("link", { name: "Data", exact: true }).isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no viewport overflow");
  await page.screenshot({ path: artifacts + "/bmm-mobile.png", fullPage: true });
  await page.route("http://127.0.0.1:18080/**", route => route.abort());
  await page.getByRole("heading", { name: "API unavailable", exact: true }).waitFor({ timeout: 20000 });
  // Last known exact values survive API failure, and later recover.
  await page.getByRole("cell", { name: "18,446,744,073,709,551,615", exact: true }).waitFor();
  await page.unroute("http://127.0.0.1:18080/**");
  await page.getByRole("heading", { name: "API unavailable", exact: true }).waitFor({ state: "hidden", timeout: 20000 });
  assert.deepEqual(errors, [], "no browser runtime/hydration errors");
  console.log("PASS browser: auctions, explorer, block/evidence navigation, one SSE, exact copy, mobile, reduced motion and API recovery");
} finally {
  await browser?.close();
  web.kill("SIGTERM");
}
