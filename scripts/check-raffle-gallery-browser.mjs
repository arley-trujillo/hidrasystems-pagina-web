// Local, read-only smoke test: every API response and image is served by this fixture.
// Usage: node scripts/check-raffle-gallery-browser.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const output = await mkdtemp(path.join(tmpdir(), "hidra-raffle-gallery-"));
const publicDir = new URL("../public/", import.meta.url);
const requests = [];
const assets = new Map([
  ["/app.js", ["app.js", "application/javascript"]], ["/styles.css", ["styles.css", "text/css"]],
  ["/cover.webp", ["assets/raffle-card.webp", "image/webp"]],
  ["/extra.webp", ["assets/hero-caballo.webp", "image/webp"]],
  ["/last.webp", ["assets/winner-video.webp", "image/webp"]],
  ["/logo.webp", ["assets/logo-placeholder.webp", "image/webp"]],
]);
const site = {
  company: { nombre: "Prueba local de galería", logo: "/logo.webp" },
  settings: { logoUrl: "/logo.webp", heroImageUrl: "/cover.webp", showResults: false },
  activeRaffles: [{
    campaign: { id: 7, name: "Sorteo con varias imágenes", numberValue: 1000 },
    publicConfig: { coverImageUrl: "/cover.webp", galleryImageUrls: ["/extra.webp", "/last.webp"] },
  }],
};
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  requests.push(pathname);
  if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
  const asset = assets.get(pathname);
  if (asset) {
    res.setHeader("Content-Type", asset[1]); res.end(await readFile(new URL(asset[0], publicDir))); return;
  }
  if (pathname === "/test") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="app"></div><script>window.__PUBLIC_SITE_CONFIG__={apiBaseUrl:location.origin,mode:"raffles"}</script><script src="/app.js"></script></body></html>');
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(pathname === "/public-site/test" ? site : {}));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = spawn(process.env.RAFFLE_GALLERY_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${path.join(output, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-gpu", "about:blank",
], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const diagnostics = [];
browser.stderr.on("data", data => diagnostics.push(data.toString()));
let socket;
const pending = new Map();
let id = 0;
const errors = [];
try {
  const debuggingUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Browser startup timed out")), 15000);
    browser.once("error", error => { clearTimeout(timer); reject(error); });
    browser.stderr.on("data", data => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(debuggingUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve); socket.addEventListener("error", reject); });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(callId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: callId, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await command("Runtime.enable");
  await command("Page.enable");
  for (const width of [1280, 360]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/test` });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate('Boolean(document.querySelector(".hero-media [data-raffle-image-step]"))')) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(await evaluate('document.querySelectorAll("[data-raffle-gallery]").length'), 2);
    if (width === 1280) assert.ok(!requests.includes("/extra.webp") && !requests.includes("/last.webp"), "Extras must not load before user action");
    assert.equal(await evaluate("document.documentElement.scrollWidth > window.innerWidth"), false);
    const sizes = await evaluate('Array.from(document.querySelectorAll("[data-raffle-image-step]")).map(button => ({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}))');
    assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44));
    await evaluate("document.querySelector('.hero-media [data-raffle-image-step=\"1\"]').click()");
    assert.equal(await evaluate('document.querySelector(".hero-media [data-public-raffle-image]").getAttribute("src")'), "/extra.webp");
    assert.equal(await evaluate('document.querySelector(".raffle-feature-media [data-public-raffle-image]").getAttribute("src")'), "/cover.webp");
    assert.equal(await evaluate('document.querySelector("#raffle-selector-modal").getAttribute("aria-hidden")'), "true");
    await evaluate("document.querySelector('.hero-media [data-raffle-image-step=\"1\"]').click()");
    assert.equal(await evaluate("document.querySelector('.hero-media [data-raffle-image-step=\"1\"]').disabled"), true);
    await evaluate("document.querySelector('.hero-media [data-raffle-image-step=\"-1\"]').click()");
    await evaluate('Promise.all(Array.from(document.images, image => image.decode().catch(() => {})))');
    const cardImage = await evaluate('(() => {const image=document.querySelector(".raffle-feature-media img"); const box=image.getBoundingClientRect(); return {loaded:image.naturalWidth>0,width:box.width,height:box.height}})()');
    assert.ok(cardImage.loaded && cardImage.width > 0 && cardImage.height > 0, JSON.stringify(cardImage));
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const overlapsChat = await evaluate('(() => {const chat=document.querySelector("[data-action=toggle-public-chat]").getBoundingClientRect(); return Array.from(document.querySelectorAll("[data-raffle-image-step]")).some(button => {const box=button.getBoundingClientRect(); return box.left<chat.right && box.right>chat.left && box.top<chat.bottom && box.bottom>chat.top})})()');
    assert.equal(overlapsChat, false, "El chat no debe cubrir los controles de galería");
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(path.join(output, `gallery-${width}.png`), Buffer.from(screenshot.data, "base64"));
    console.log(`PASS ${width}px: navegación, sin precarga, compra intacta, controles accesibles, sin desborde`);
  }
  assert.deepEqual(errors, []);
  console.log(`Capturas: ${output}`);
  await send("Browser.close");
} catch (error) {
  console.error(diagnostics.join("").slice(-4000));
  throw error;
} finally {
  socket?.close();
  for (const task of pending.values()) clearTimeout(task.timer);
  if (browser.exitCode === null) browser.kill();
  await new Promise(resolve => server.close(resolve));
}
