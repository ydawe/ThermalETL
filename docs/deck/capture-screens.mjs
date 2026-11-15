/**
 * Capture ThermalETL UI screenshots at 1600×900 for the demo deck.
 * Usage: node docs/deck/capture-screens.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "screens");
const BASE = process.argv[2] || "http://127.0.0.1:4173";

mkdirSync(OUT, { recursive: true });

async function waitForApp(page, region = "poland") {
  await page.goto(`${BASE}/?region=${region}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByTestId("selected-count").waitFor({ timeout: 60_000 });
  await page.getByTestId("hex-map-canvas").waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(window.__thermaletlMap),
    null,
    { timeout: 45_000 },
  );
  // Let map tiles / deck.gl settle
  await page.waitForTimeout(2500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log("Base URL:", BASE);
  await waitForApp(page, "poland");

  // 1) Draw selection so map shows selected hexes
  await page.getByTestId("draw-rect").click();
  await page.evaluate(() => {
    const api = window.__thermaletlMap;
    api.clickLngLat(18.8, 50.8);
    api.clickLngLat(21.8, 53.0);
  });
  await page.getByTestId("selection-status").filter({ hasText: "your drawn shape" }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);

  // Map with selection + hexes (full page / main chrome)
  await page.screenshot({ path: join(OUT, "map_selected_hexes.png"), fullPage: false });
  console.log("saved map_selected_hexes.png");

  // 2) Fire calendar heatmap — scroll calendar into view
  const calendar = page.locator("#calendar-title");
  await calendar.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const calSection = page.locator('section[aria-labelledby="calendar-title"]');
  await calSection.screenshot({ path: join(OUT, "calendar_heatmap.png") });
  console.log("saved calendar_heatmap.png");

  // 3) CSV export — capture the controls strip with Download CSV
  const csvBtn = page.getByRole("button", { name: /Download CSV/i });
  await csvBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // Highlight by focusing and screenshot surrounding card
  await csvBtn.focus();
  const csvBox = await csvBtn.boundingBox();
  if (csvBox) {
    await page.screenshot({
      path: join(OUT, "csv_export.png"),
      clip: {
        x: Math.max(0, csvBox.x - 40),
        y: Math.max(0, csvBox.y - 80),
        width: Math.min(700, 1600 - Math.max(0, csvBox.x - 40)),
        height: Math.min(220, 900 - Math.max(0, csvBox.y - 80)),
      },
    });
  } else {
    await csvBtn.screenshot({ path: join(OUT, "csv_export.png") });
  }
  console.log("saved csv_export.png");

  // 4) Hex panel with monthly k
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const pick = page.getByTestId("hex-pick");
  const values = await pick.locator("option").evaluateAll((opts) =>
    opts.map((o) => o.value).filter(Boolean),
  );
  if (!values.length) throw new Error("No hex options to open panel");
  await pick.selectOption(values[0]);
  const modal = page.getByTestId("hex-detail-modal");
  await modal.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(500);
  await modal.screenshot({ path: join(OUT, "hex_k_panel.png") });
  console.log("saved hex_k_panel.png");
  await page.getByTestId("hex-detail-close").click();

  // 5) How it works page
  await page.goto(`${BASE}/how-it-works`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "How it works" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, "how_it_works.png"), fullPage: false });
  console.log("saved how_it_works.png");

  await browser.close();
  console.log("Done →", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
