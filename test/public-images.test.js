import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function context(payload) {
  const requests = [];
  const ctx = {
    window: {},
    API_BASE_URL: "https://api.example.com",
    PUBLIC_SITE_FETCH_ATTEMPTS: 3,
    PUBLIC_SITE_RETRY_DELAYS_MS: [0, 0, 0],
    waitForPublicSiteRetry: async () => {}, normalizeSlug: String, URLSearchParams,
    fetch: async (url, options) => { requests.push({url, options}); return {ok:true,json:async()=>payload}; },
  };
  vm.createContext(ctx);
  for (const name of ["resolvePublicSiteImageUrls", "fetchPublicSitePayload"]) {
    vm.runInContext(source.match(new RegExp("(?:async )?function " + name + "\\([^]*?\\n}"))[0], ctx);
  }
  return {ctx, requests};
}

test("solicita respuesta ligera y usa el servidor API para las imágenes sin alterar paquetes", async () => {
  const image = "/public-site/test/images/v1-" + "a".repeat(32);
  const payload = { company: {logo:image}, settings: {heroImageUrl:image}, activeRaffles:[{campaign:{numberValue:5000},publicConfig:{coverImageUrl:image,showQuickPackages:true,quickPackages:[{quantity:3,price:10000}]}}] };
  const {ctx, requests} = context(payload);
  const site = await ctx.fetchPublicSitePayload("test");
  assert.equal(new URL(requests[0].url).searchParams.get("images"), "urls");
  assert.equal(new URL(requests[0].url).searchParams.get("fast"), "1");
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(site.settings.heroImageUrl, "https://api.example.com" + image);
  assert.equal(site.settings.heroImageUrl, site.activeRaffles[0].publicConfig.coverImageUrl);
  assert.equal(site.activeRaffles[0].publicConfig.quickPackages[0].price, 10000);
});

test("compatible con backend anterior: conserva Base64 y URLs externas", async () => {
  const payload = { company:{logo:"data:image/png;base64,AAAA"}, settings:{heroImageUrl:"https://cdn.example.com/cover.webp"}, activeRaffles:[] };
  const {ctx} = context(payload);
  const site = await ctx.fetchPublicSitePayload("test");
  assert.equal(site.company.logo, "data:image/png;base64,AAAA");
  assert.equal(site.settings.heroImageUrl, "https://cdn.example.com/cover.webp");
});

test("tolera campos opcionales sin inventar portadas", async () => {
  const {ctx} = context({});
  assert.deepEqual(await ctx.fetchPublicSitePayload("test"), {});
});
