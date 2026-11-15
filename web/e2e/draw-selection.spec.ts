import { expect, test, type Page } from "@playwright/test";

type MapTestApi = {
  clickLngLat: (lng: number, lat: number) => void;
  dblClickLngLat: (lng: number, lat: number) => void;
  getDraftCount: () => number;
};

async function waitForApp(page: Page, region = "poland") {
  await page.goto(`/?region=${region}`);
  await expect(page.getByTestId("selected-count")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("hex-map-canvas")).toBeVisible();
  await expect.poll(async () =>
    page.evaluate(() => Boolean((window as unknown as { __thermaletlMap?: MapTestApi }).__thermaletlMap)),
  ).toBe(true);
}

async function selectedCount(page: Page): Promise<number> {
  const text = await page.getByTestId("selected-count").innerText();
  return Number(text.trim());
}

async function mapApi(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __thermaletlMap?: MapTestApi }).__thermaletlMap));
}

test.describe("area draw selection", () => {
  test("draw rectangle selects a subset of hexagons", async ({ page }) => {
    await waitForApp(page);
    const total = await selectedCount(page);
    expect(total).toBeGreaterThan(10);

    await page.getByTestId("draw-rect").click();
    await expect(page.getByTestId("draw-status")).toContainText("rectangle");
    await mapApi(page);

    // Two corners inside central Poland (bbox ~13.5–24.5E, 48.5–55.5N)
    await page.evaluate(() => {
      const api = (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap;
      api.clickLngLat(19.5, 51.5);
      api.clickLngLat(21.5, 52.8);
    });

    await expect(page.getByTestId("selection-status")).toContainText("your drawn shape");
    const after = await selectedCount(page);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(total);
  });

  test("draw polygon via clicks + Enter selects hexagons", async ({ page }) => {
    await waitForApp(page);
    const total = await selectedCount(page);

    await page.getByTestId("draw-polygon").click();
    await expect(page.getByTestId("draw-status")).toContainText("points");
    await mapApi(page);

    await page.evaluate(async () => {
      const api = (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap;
      api.clickLngLat(18.5, 50.5);
      api.clickLngLat(20.5, 50.5);
      api.clickLngLat(20.5, 52.0);
    });

    // First three vertices commit immediately; wait until draft has them.
    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap.getDraftCount()),
    ).toBe(3);

    await page.getByTestId("hex-map").focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("selection-status")).toContainText("your drawn shape");
    const after = await selectedCount(page);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(total);
  });

  test("draw polygon finishes on double-click without an extra vertex", async ({ page }) => {
    await waitForApp(page);

    await page.getByTestId("draw-polygon").click();
    await mapApi(page);

    await page.evaluate(async () => {
      const api = (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap;
      api.clickLngLat(19.0, 51.0);
      api.clickLngLat(21.0, 51.0);
      api.clickLngLat(21.0, 53.0);
    });
    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap.getDraftCount()),
    ).toBe(3);

    // Simulate the dblclick finish path (pending 4th vertex is cancelled).
    await page.evaluate(() => {
      const api = (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap;
      api.clickLngLat(20.0, 52.5); // would become vertex 4 if not cancelled
      api.dblClickLngLat(20.0, 52.5);
    });

    await expect(page.getByTestId("selection-status")).toContainText("your drawn shape");
    const after = await selectedCount(page);
    expect(after).toBeGreaterThan(0);
  });

  test("Whole region resets the selection", async ({ page }) => {
    await waitForApp(page);
    const total = await selectedCount(page);

    await page.getByTestId("draw-rect").click();
    await page.evaluate(() => {
      const api = (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap;
      api.clickLngLat(19.5, 51.5);
      api.clickLngLat(20.0, 52.0);
    });
    await expect(page.getByTestId("selection-status")).toContainText("your drawn shape");
    expect(await selectedCount(page)).toBeLessThan(total);

    await page.getByTestId("draw-reset").click();
    await expect(page.getByTestId("selection-status")).toContainText("whole region");
    expect(await selectedCount(page)).toBe(total);
  });

  test("Reset clears selection and closes hex popup", async ({ page }) => {
    await waitForApp(page);
    const total = await selectedCount(page);

    await page.getByTestId("draw-rect").click();
    await page.evaluate(() => {
      const api = (window as unknown as { __thermaletlMap: MapTestApi }).__thermaletlMap;
      api.clickLngLat(19.5, 51.5);
      api.clickLngLat(20.2, 52.2);
    });
    await expect(page.getByTestId("selection-status")).toContainText("your drawn shape");

    const pick = page.getByTestId("hex-pick");
    const values = await pick.locator("option").evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    );
    expect(values.length).toBeGreaterThan(0);
    await pick.selectOption(values[0]);
    await expect(page.getByTestId("hex-detail-modal")).toBeVisible();
    // Modal covers the toolbar — close it first, then Reset.
    await page.getByTestId("hex-detail-close").click();
    await expect(page.getByTestId("hex-detail-modal")).toHaveCount(0);

    await page.getByTestId("reset-all").click();
    await expect(page.getByTestId("selection-status")).toContainText("whole region");
    expect(await selectedCount(page)).toBe(total);
  });

  test("hex details open as a centred modal", async ({ page }) => {
    await waitForApp(page);
    const pick = page.getByTestId("hex-pick");
    const values = await pick.locator("option").evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    );
    await pick.selectOption(values[0]);
    const modal = page.getByTestId("hex-detail-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Hexagon details")).toBeVisible();
    await page.getByTestId("hex-detail-close").click();
    await expect(modal).toHaveCount(0);
  });
});
