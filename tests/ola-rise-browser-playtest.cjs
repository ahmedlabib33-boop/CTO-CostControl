const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.OLA_RISE_BASE_URL || "http://127.0.0.1:3011";
const artifactDir = path.resolve(process.env.OLA_RISE_ARTIFACT_DIR || "artifacts/ola-rise-playtest-v29");
fs.mkdirSync(artifactDir, { recursive: true });

function distance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z));
}

async function waitForGame(page) {
  await page.waitForFunction(() => window.__OLA_RISE_QA__?.snapshot().olaPosition, null, { timeout: 30000 });
  await page.waitForSelector("#loading", { state: "hidden", timeout: 30000 });
}

async function snapshot(page) {
  return page.evaluate(() => window.__OLA_RISE_QA__.snapshot());
}

async function touchJoystick(page, frame = page) {
  const ring = frame.locator(".joy-ring");
  await ring.waitFor({ state: "visible" });
  const box = await ring.boundingBox();
  assert.ok(box, "joystick ring must have a visible bounding box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 36, y: y - 42, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  await page.waitForTimeout(1100);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
}

async function clearAndOpen(context, url) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("ola-rise-playtest-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("ola-rise-playtest-initialized", "1");
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return page;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const report = { baseUrl, checks: {}, consoleErrors: [] };
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await clearAndOpen(desktop, `${baseUrl}/ola-rise/index.html?qa=1&release=20260902-v29`);
    page.on("pageerror", (error) => report.consoleErrors.push(String(error)));
    await waitForGame(page);
    assert.equal(await page.locator("#thoughtBubble").count(), 0, "floating Think About bubble must be removed");
    assert.equal(await page.locator("#decisionConfidence").count(), 0, "confidence question must be removed");

    const desktopStart = await snapshot(page);
    await page.keyboard.down("w");
    await page.waitForTimeout(950);
    await page.keyboard.up("w");
    const desktopMoved = await snapshot(page);
    const desktopDistance = distance(desktopStart.olaPosition, desktopMoved.olaPosition);
    assert.ok(desktopDistance > 0.45, `desktop keyboard should move Ola, measured ${desktopDistance}`);
    report.checks.desktopKeyboardDistance = desktopDistance;

    const goStart = desktopMoved.olaPosition;
    await page.locator("#goToBtn").click({ force: true });
    await page.waitForFunction(() => window.__OLA_RISE_QA__.snapshot().hasWalkTarget, null, { timeout: 3000 });
    const planned = await snapshot(page);
    assert.ok(planned.activeRoute.length >= 1, "GO TO must create a collision-safe route");
    await page.waitForSelector("#projectSheet.open", { timeout: 12000 });
    const goEnd = await snapshot(page);
    const goDistance = distance(goStart, goEnd.olaPosition);
    assert.ok(goDistance > 2, `GO TO should visibly move Ola, measured ${goDistance}`);
    report.checks.goToDistance = goDistance;
    report.checks.goToRoutePoints = planned.activeRoute.length;
    await page.screenshot({ path: path.join(artifactDir, "desktop-go-to-arrival.png"), fullPage: true });

    await page.locator('[data-mission="0"]').click();
    await page.locator('[data-opt="1"]').click();
    await page.waitForSelector("#decisionFeedback:not(.hidden)");
    const wrongDecision = await snapshot(page);
    const projectId = Object.keys(wrongDecision.projectHealth)[0];
    assert.equal(Math.round(wrongDecision.projectHealth[projectId].momentum), 40, "wrong final decision must reduce health from 50 to 40");
    assert.match(await page.locator("#decisionSelected").innerText(), /Ola chose:/);
    assert.match(await page.locator("#decisionFeedbackTitle").innerText(), /downward|damaged/i);
    assert.ok(await page.locator("#decisionReflection:not(.hidden)").isVisible(), "reflection must appear after the final choice");
    await page.screenshot({ path: path.join(artifactDir, "out-of-track-confirmation.png"), fullPage: true });
    const lockedHealth = wrongDecision.projectHealth[projectId].momentum;
    await page.locator('[data-opt="1"]').click({ force: true }).catch(() => {});
    assert.equal((await snapshot(page)).projectHealth[projectId].momentum, lockedHealth, "a final decision must not be retryable");
    await page.locator('[data-reflection-opt="1"]').click();
    await page.waitForTimeout(1200);
    assert.equal(Math.round((await snapshot(page)).projectHealth[projectId].momentum), 37, "wrong reflection must reduce health by 3");
    report.checks.wrongDecisionHealth = 40;
    report.checks.wrongReflectionHealth = 37;
    await page.locator('[data-mission="1"]').click();
    await page.locator('[data-opt="1"]').click();
    await page.waitForSelector("#blackout.active", { timeout: 5000 });
    const failed = await snapshot(page);
    assert.equal(Math.round(failed.projectHealth[projectId].momentum), 27, "the next harmful decision must cross the 35% failure threshold");
    assert.equal(failed.projectHealth[projectId].label, "FAILED");
    assert.equal(failed.gameOutcome, "failure", "crossing the failure threshold must end the run as a loss");
    report.checks.failedHealth = 27;
    await page.screenshot({ path: path.join(artifactDir, "failed-project-ending.png"), fullPage: true });
    await desktop.close();

    const recovery = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const recoveryPage = await clearAndOpen(recovery, `${baseUrl}/ola-rise/index.html?qa=1&release=20260902-v29&recovery=1`);
    await waitForGame(recoveryPage);
    await recoveryPage.locator("#goToBtn").click({ force: true });
    await recoveryPage.waitForSelector("#projectSheet.open", { timeout: 12000 });
    for (const missionIndex of [0, 1]) {
      await recoveryPage.locator(`[data-mission="${missionIndex}"]`).click();
      await recoveryPage.locator('[data-opt="0"]').click();
      await recoveryPage.locator('[data-reflection-opt="0"]').click();
      await recoveryPage.waitForTimeout(1200);
    }
    const rising = await snapshot(recoveryPage);
    const risingProject = Object.keys(rising.projectHealth)[0];
    assert.equal(Math.round(rising.projectHealth[risingProject].momentum), 72, "two correct decision/reflection pairs must raise health to 72");
    assert.equal(rising.projectHealth[risingProject].label, "RISING");
    await recoveryPage.screenshot({ path: path.join(artifactDir, "rising-project-world.png"), fullPage: true });
    report.checks.risingHealth = 72;
    await recovery.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const mobilePage = await clearAndOpen(mobile, `${baseUrl}/ola-rise/index.html?qa=1&release=20260902-v29&mobile=1`);
    mobilePage.on("pageerror", (error) => report.consoleErrors.push(String(error)));
    await waitForGame(mobilePage);
    const mobileStart = await snapshot(mobilePage);
    await touchJoystick(mobilePage);
    const mobileEnd = await snapshot(mobilePage);
    const mobileDistance = distance(mobileStart.olaPosition, mobileEnd.olaPosition);
    assert.ok(mobileDistance > 0.35, `mobile touch joystick should move Ola, measured ${mobileDistance}`);
    assert.deepEqual(mobileEnd.movementInput, { x: 0, y: 0 }, "joystick input must reset after touch end");
    report.checks.mobileJoystickDistance = mobileDistance;
    await mobilePage.screenshot({ path: path.join(artifactDir, "mobile-joystick-moved.png"), fullPage: true });

    await mobilePage.click("#menuBtn");
    await mobilePage.click("#saveBtn");
    await mobilePage.evaluate(() => {
      const key = Object.keys(localStorage).find((item) => item.startsWith("ola3d-live:"));
      if (!key) throw new Error("saved game key was not created");
      const saved = JSON.parse(localStorage.getItem(key));
      saved.hour = 21;
      saved.nightSocial = false;
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await mobilePage.reload({ waitUntil: "domcontentloaded" });
    await waitForGame(mobilePage);
    await mobilePage.waitForSelector("#bedtimeGate:not(.hidden)");
    await mobilePage.screenshot({ path: path.join(artifactDir, "mobile-night-confirmation.png"), fullPage: true });
    const foodStart = await snapshot(mobilePage);
    await mobilePage.click("#goNightFoodCourt");
    await mobilePage.waitForFunction(() => window.__OLA_RISE_QA__.snapshot().activeRoute.length > 0, null, { timeout: 3000 });
    await mobilePage.waitForTimeout(1200);
    const foodMoving = await snapshot(mobilePage);
    assert.ok(distance(foodStart.olaPosition, foodMoving.olaPosition) > 0.5, "Food Court route must move Ola before fallback arrival");
    await mobilePage.waitForFunction(() => {
      const position = window.__OLA_RISE_QA__.snapshot().olaPosition;
      return Math.hypot(position.x - 35, position.z - 32.5) < 4;
    }, null, { timeout: 8000 });
    const foodEnd = await snapshot(mobilePage);
    report.checks.foodCourtDistance = distance(foodStart.olaPosition, foodEnd.olaPosition);
    report.checks.foodCourtRouteMoved = distance(foodStart.olaPosition, foodMoving.olaPosition);
    await mobilePage.screenshot({ path: path.join(artifactDir, "mobile-food-court-arrival.png"), fullPage: true });
    await mobile.close();

    const iframeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const iframePage = await clearAndOpen(iframeContext, `${baseUrl}/`);
    await iframePage.waitForSelector("header.top", { timeout: 30000 });
    await iframePage.waitForTimeout(700);
    await iframePage.keyboard.type("654123", { delay: 90 });
    const iframeElement = iframePage.locator("iframe.olaRiseFrame");
    if ((await iframeElement.count()) === 0) {
      for (const key of "654123") {
        await iframePage.evaluate((pressed) => window.dispatchEvent(new KeyboardEvent("keydown", { key: pressed })), key);
        await iframePage.waitForTimeout(80);
      }
    }
    await iframeElement.waitFor({ state: "visible", timeout: 10000 });
    await iframeElement.evaluate((element) => {
      const url = new URL(element.src);
      url.searchParams.set("qa", "1");
      url.searchParams.set("iframePlaytest", "1");
      element.src = url.toString();
    });
    let gameFrame;
    await iframePage.waitForFunction(() => {
      const frame = document.querySelector("iframe.olaRiseFrame");
      return Boolean(frame?.contentWindow?.__OLA_RISE_QA__?.snapshot().olaPosition);
    }, null, { timeout: 30000 });
    gameFrame = iframePage.frames().find((frame) => frame.url().includes("/ola-rise/index.html"));
    assert.ok(gameFrame, "main app must contain the OLA: RISE iframe");
    const iframeStart = await gameFrame.evaluate(() => window.__OLA_RISE_QA__.snapshot());
    await touchJoystick(iframePage, gameFrame);
    const iframeEnd = await gameFrame.evaluate(() => window.__OLA_RISE_QA__.snapshot());
    const iframeDistance = distance(iframeStart.olaPosition, iframeEnd.olaPosition);
    assert.ok(iframeDistance > 0.35, `touch joystick inside the main-app iframe should move Ola, measured ${iframeDistance}`);
    report.checks.iframeMobileJoystickDistance = iframeDistance;
    await iframePage.screenshot({ path: path.join(artifactDir, "mobile-main-app-iframe.png"), fullPage: true });
    await iframeContext.close();

    assert.deepEqual(report.consoleErrors, [], `browser page errors detected: ${report.consoleErrors.join(" | ")}`);
    fs.writeFileSync(path.join(artifactDir, "playtest-report.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
