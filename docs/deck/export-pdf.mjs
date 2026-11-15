/**
 * Export docs/deck/index.html → docs/ThermalETL_demo.pdf (exactly 7 landscape pages).
 * Run from repo root or docs/deck; resolves Playwright from web/node_modules when needed.
 */
import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const htmlPath = resolve(__dirname, "index.html");
const outPdf = resolve(__dirname, "..", "ThermalETL_demo.pdf");

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const candidates = [
      join(root, "web/node_modules/playwright"),
      "/Users/ydawe/nasa_space_apps/web/node_modules/playwright",
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        const require = createRequire(join(c, "package.json"));
        return require("playwright");
      }
    }
    throw new Error("Install Playwright in web/: npm install && npx playwright install chromium");
  }
}

if (!existsSync(htmlPath)) {
  console.error("Missing", htmlPath);
  process.exit(1);
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle", timeout: 90_000 });
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    [...document.images].map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
    ),
  );
});
await page.waitForTimeout(800);

const slideCount = await page.locator("section.slide").count();
if (slideCount !== 7) {
  console.error(`Expected 7 slides, found ${slideCount}`);
  await browser.close();
  process.exit(1);
}

await page.pdf({
  path: outPdf,
  width: "13.333in",
  height: "7.5in",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  preferCSSPageSize: true,
});
await browser.close();

const data = readFileSync(outPdf);
const pages = [...data.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length;
console.log("PDF:", outPdf);
console.log("Pages:", pages);
if (pages !== 7) {
  console.error("FAIL: page count must be exactly 7");
  process.exit(1);
}
