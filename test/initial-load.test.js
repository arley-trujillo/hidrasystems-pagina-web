import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const bootstrap = html.match(/<script data-public-site-bootstrap>([^]*?)<\/script>/)[1];

function setup({href = "https://web.example.com/test", mode = "raffles", apiBaseUrl = "https://api.example.com", responses = []} = {}) {
  const requests = [];
  const ctx = vm.createContext({
    window: {location: new URL(href), __PUBLIC_SITE_CONFIG__: {mode, apiBaseUrl}},
    URL, URLSearchParams,
    API_BASE_URL: apiBaseUrl || "http://localhost:10000",
    PUBLIC_SITE_FETCH_ATTEMPTS: 3, PUBLIC_SITE_RETRY_DELAYS_MS: [0, 0, 0],
    waitForPublicSiteRetry: async () => {},
    fetch: async (url, options) => {
      requests.push({url, options});
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next || {ok: true, json: async () => ({settings: {title: "Actual"}})};
    },
  });
  for (const name of ["normalizeSlug", "resolvePublicSiteImageUrls", "fetchPublicSitePayload"]) {
    vm.runInContext(source.match(new RegExp("(?:async )?function " + name + "\\([^]*?\\n}"))[0], ctx);
  }
  vm.runInContext(bootstrap, ctx);
  return {ctx, requests};
}

test("solicita datos desde el HTML antes de la aplicacion y reutiliza la peticion una sola vez", async () => {
  const {ctx, requests} = setup();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.cache, "no-store");
  const result = await ctx.fetchPublicSitePayload("test");
  assert.equal(result.settings.title, "Actual");
  assert.equal(requests.length, 1);
  assert.equal(ctx.window.__PUBLIC_SITE_BOOTSTRAP__, null);
  await ctx.fetchPublicSitePayload("test");
  assert.equal(requests.length, 2);
});

test("un error anticipado se captura y conserva el reintento de red", async () => {
  const {ctx, requests} = setup({responses: [new Error("Red temporal")]});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await ctx.fetchPublicSitePayload("test")).settings.title, "Actual");
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get("retry"), "1");
});

test("404 no reintenta ni muestra configuracion antigua", async () => {
  const {ctx, requests} = setup({responses: [{ok: false, status: 404}]});
  await assert.rejects(ctx.fetchPublicSitePayload("test"), error => error.responseStatus === 404);
  assert.equal(requests.length, 1);
});

test("no consume datos anticipados de otro sitio", async () => {
  const {ctx, requests} = setup({href: "https://web.example.com/otro"});
  await ctx.fetchPublicSitePayload("test");
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /\/test\?/);
});

test("respeta slug por query, configuracion de API y entorno local", () => {
  const query = setup({href: "https://web.example.com/?slug=TEST/", apiBaseUrl: "https://custom.example.com"});
  assert.equal(query.requests[0].url, "https://custom.example.com/public-site/test?fast=1&images=urls");
  const local = setup({href: "http://localhost:3000/test", apiBaseUrl: ""});
  assert.match(local.requests[0].url, /^http:\/\/localhost:10000\//);
});

test("no inicia solicitudes para vitrinas retail ni rutas sin sitio", () => {
  for (const options of [{mode: "retail"}, {href: "https://web.example.com/"}, {href: "https://web.example.com/negocio/test"}, {href: "https://web.example.com/retail/test"}]) {
    assert.equal(setup(options).requests.length, 0);
  }
});

test("datos se piden antes del CSS; tipografia externa no bloquea; preload y script coinciden", () => {
  assert.ok(html.indexOf("data-public-site-bootstrap") < html.indexOf('href="/styles.css'));
  assert.match(html, /fonts.googleapis.com\/css2[^>]+media="print"[^>]+onload="this.media='all'"/);
  const preload = html.match(/rel="preload" href="([^"]+)" as="script"/)[1];
  const script = html.match(/<script defer src="([^"]+)"/)[1];
  assert.equal(preload, script);
});
