import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const cover = "https://cdn.example.invalid/cover.webp";
const extra = "https://cdn.example.invalid/extra.webp";
const last = "https://cdn.example.invalid/last.webp";

function setup({ images = [extra, last], secondRaffle = false, video = "" } = {}) {
  const raffle = {
    campaign: { id: 7, name: 'Premio <especial> "2026"' },
    publicConfig: { coverImageUrl: cover, ...(images === undefined ? {} : { galleryImageUrls: images }) },
  };
  const site = {
    company: { nombre: "Empresa" }, settings: { heroVideoUrl: video },
    activeRaffles: [raffle, ...(secondRaffle ? [{ campaign: { id: 8, name: "Otro sorteo" }, publicConfig: { coverImageUrl: last } }] : [])],
  };
  const app = { innerHTML: "", querySelectorAll: () => [] };
  const ctx = vm.createContext({
    window: { __PUBLIC_SITE_STATE__: { site, slug: "test" } }, app,
    document: { title: "", documentElement: { style: { setProperty() {} } }, querySelectorAll: () => [] },
    API_BASE_URL: "https://api.example.invalid", ASSETS: { raffle: "/fallback.webp", hero: "/hero.webp", brand: "/brand.webp" },
    asArray: value => Array.isArray(value) ? value : [],
    getRaffleDisplayDate: () => "", getRafflePricingBadge: () => "",
    formatRafflePricingSummary: () => "1 boleta por $1.000", getRaffleDisplayMode: () => "automático",
    getRaffleDisplayTotal: () => 100, renderRaffleAdvanceBlock: () => "",
    renderQuickPackageActions: () => '<button type="button" data-raffle-package="0" data-raffle-id="7">Paquete de 1</button>',
    getFooterSocialLinks: () => [], renderInlineVideo: () => '<video data-preserved-video></video>',
    renderHowItWorks: () => "", renderFaq: () => "", renderPublicChatWidget: () => "",
    renderRaffleSelectorModal: () => "", renderPaymentModal: () => "", renderReceiptUploadModal: () => "",
    renderDeliveryModal: () => "", renderRaffleResultsModal: () => "",
    writeCachedPublicSite() {}, initRaffleCarousel() {}, syncRaffleResultsModal() {}, initializePublicChat() {},
    raffleSelectorState: {}, publicUiState: {}, publicChatState: {}, numberFormatter: new Intl.NumberFormat("es-CO"),
    normalizeSlug: String, getSlugFromLocation: () => "test",
  });
  for (const name of [
    "escapeHtml", "escapeAttr", "pickHeroImage", "pickHeroVideo", "getRaffleDisplayTitle", "getRaffleDisplayDescription",
    "resolvePublicSiteImageUrls", "getRaffleDisplayImage", "getRaffleDisplayImages", "renderRaffleImageNavigation",
    "updateRaffleGalleryImage", "changeRaffleImage", "renderRaffles", "renderShell",
    "applyDeferredImageSource", "applyDeferredPublicMedia",
  ]) {
    const match = source.match(new RegExp("function " + name + "\\([^]*?\\n}"));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, app, site, raffle };
}

function gallery(id = "7") {
  const writes = [];
  const image = {
    attributes: { src: cover }, dataset: { publicRaffleImage: id },
    setAttribute(name, value) { this.attributes[name] = value; writes.push({ name, value }); },
    getAttribute(name) { return this.attributes[name]; },
    closest: () => root,
  };
  const status = { textContent: "1 / 3" };
  const root = {
    dataset: { raffleGallery: id }, inserted: [],
    querySelector: selector => selector === "[data-public-raffle-image]" ? image : selector === "[data-raffle-image-status]" ? status : null,
    querySelectorAll: () => [previous, next],
    insertAdjacentHTML: (position, html) => root.inserted.push({ position, html }),
  };
  const previous = { dataset: { raffleImageStep: "-1" }, disabled: true, closest: () => root };
  const next = { dataset: { raffleImageStep: "1" }, disabled: false, closest: () => root };
  return { root, image, status, previous, next, writes };
}

test("portada primero, adicionales en orden, sin duplicados y máximo cinco extras", () => {
  const { ctx, raffle, site } = setup({ images: [extra, cover, extra, ` ${last} `, null] });
  assert.deepEqual(Array.from(ctx.getRaffleDisplayImages(raffle, site)), [cover, extra, last]);
  raffle.publicConfig.galleryImageUrls = Array.from({ length: 10 }, (_, i) => `/extra-${i}.webp`);
  assert.equal(ctx.getRaffleDisplayImages(raffle, site).length, 6);
});

test("sorteos antiguos sin galería conservan portada y no agregan controles", () => {
  const { ctx, raffle, site } = setup();
  delete raffle.publicConfig.galleryImageUrls;
  assert.deepEqual(Array.from(ctx.getRaffleDisplayImages(raffle, site)), [cover]);
  assert.equal(ctx.renderRaffleImageNavigation(raffle, site), "");
  delete raffle.publicConfig.coverImageUrl;
  assert.equal(ctx.getRaffleDisplayImages(raffle, site)[0], "/fallback.webp");
});

test("resuelve URLs de galería del API y conserva URLs externas, WebP y paquetes", () => {
  const relative = "/public-site/test/images/v1-abc";
  const { ctx, raffle, site } = setup({ images: [relative, extra] });
  raffle.publicConfig.showQuickPackages = true;
  ctx.resolvePublicSiteImageUrls(site);
  assert.equal(raffle.publicConfig.galleryImageUrls[0], "https://api.example.invalid" + relative);
  assert.equal(raffle.publicConfig.galleryImageUrls[1], extra);
  assert.equal(raffle.publicConfig.showQuickPackages, true);
});

test("sin portada propia muestra la primera imagen real antes de la imagen genérica", () => {
  const { ctx, raffle, site } = setup();
  delete raffle.publicConfig.coverImageUrl;
  site.settings.heroImageUrl = "/generic-hero.webp";
  assert.equal(ctx.getRaffleDisplayImage(raffle, site), extra);
  assert.deepEqual(Array.from(ctx.getRaffleDisplayImages(raffle, site)), [extra, last]);
  assert.match(ctx.renderRaffles(site), /src="https:\/\/cdn\.example\.invalid\/extra\.webp"/);
  delete raffle.publicConfig.galleryImageUrls;
  assert.equal(ctx.getRaffleDisplayImage(raffle, site), "/generic-hero.webp");
});

test("controles accesibles, título escapado, sin autoplay ni solicitudes de imágenes adicionales", () => {
  const { ctx, raffle, site } = setup();
  const html = ctx.renderRaffleImageNavigation(raffle, site);
  assert.match(html, /role="group"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Imagen anterior de Premio &lt;especial&gt; &quot;2026&quot;/);
  assert.match(html, /data-raffle-image-step="-1"[^>]*disabled/);
  assert.match(html, /1 \/ 3/);
  assert.doesNotMatch(html, /<img|\bsrc=|autoplay|transition|animation|<especial>/);
});

test("siguiente y anterior cambian solo la imagen elegida, mantienen límites y no mutan la compra", () => {
  const { ctx, site } = setup();
  const before = JSON.stringify(site);
  const g = gallery();
  assert.equal(g.writes.length, 0);
  ctx.changeRaffleImage(g.next);
  assert.equal(g.image.attributes.src, extra);
  assert.equal(g.image.attributes.alt, 'Premio <especial> "2026": imagen 2 de 3');
  assert.equal(g.status.textContent, "2 / 3");
  assert.equal(g.previous.disabled, false);
  ctx.changeRaffleImage(g.next);
  assert.equal(g.image.attributes.src, last);
  assert.equal(g.next.disabled, true);
  const count = g.writes.length;
  ctx.changeRaffleImage(g.next);
  assert.equal(g.writes.length, count);
  ctx.changeRaffleImage(g.previous);
  ctx.changeRaffleImage(g.previous);
  assert.equal(g.image.attributes.src, cover);
  assert.equal(g.previous.disabled, true);
  assert.equal(JSON.stringify(site), before);
});

test("cada galería mantiene su selección sin tocar otro sorteo o controles inválidos", () => {
  const { ctx } = setup({ secondRaffle: true });
  const hero = gallery();
  const card = gallery();
  ctx.changeRaffleImage(hero.next);
  assert.equal(hero.image.attributes.src, extra);
  assert.equal(card.image.attributes.src, cover);
  for (const id of ["8", "999"]) {
    const other = gallery(id);
    ctx.changeRaffleImage(other.next);
    assert.equal(other.writes.length, 0);
  }
  card.next.dataset.raffleImageStep = "not-a-step";
  ctx.changeRaffleImage(card.next);
  assert.equal(card.writes.length, 0);
  ctx.changeRaffleImage(null);
});

test("tarjeta destacada y grilla cargan solo portadas y conservan selección y paquetes", () => {
  for (const secondRaffle of [false, true]) {
    const { ctx, site } = setup({ secondRaffle });
    const html = ctx.renderRaffles(site);
    assert.match(html, /data-raffle-gallery="7"/);
    assert.match(html, /data-raffle-image-step="1"/);
    assert.match(html, /js-open-raffle-selector/);
    assert.match(html, /data-raffle-package="0"/);
    assert.equal((html.match(/<img\b/g) || []).length, secondRaffle ? 2 : 1);
    assert.ok(!html.includes(extra), "No source for unselected images in initial markup");
  }
});

test("hero incorpora galería sin cambiar Comprar y respeta video configurado", () => {
  for (const video of ["", "https://video.example.invalid/live"]) {
    const { ctx, app, site } = setup({ video });
    ctx.renderShell(site, "test");
    const hero = app.innerHTML.match(/<section class="hero[^]*?<\/section>/)?.[0];
    assert.ok(hero);
    assert.match(hero, /js-start-hero-purchase hero-buy-button/);
    assert.match(hero, />Comprar<\/button>/);
    if (video) {
      assert.match(hero, /data-preserved-video/);
      assert.doesNotMatch(hero, /data-raffle-gallery|data-raffle-image-step/);
    } else {
      assert.match(hero, /data-raffle-gallery="7"/);
      assert.match(hero, /data-raffle-image-step="1"/);
      assert.match(hero, /fetchpriority="high"/);
      assert.ok(!hero.includes(extra));
    }
  }
});

test("media diferida conserva la foto elegida y actualiza extras y URLs sin repintar la página", () => {
  const { ctx, app, site } = setup();
  const g = gallery();
  ctx.changeRaffleImage(g.next);
  app.innerHTML = "Formulario con datos del cliente";
  app.querySelectorAll = selector => selector === "[data-raffle-gallery]" ? [g.root] : selector === "[data-public-raffle-image]" ? [g.image] : [];
  ctx.applyDeferredPublicMedia(site, { raffles: [{ raffleId: 7, galleryImageUrls: [extra, "/public-site/test/images/v1-new"] }] });
  assert.equal(g.image.attributes.src, extra);
  assert.equal(g.status.textContent, "2 / 3");
  assert.equal(app.innerHTML, "Formulario con datos del cliente");
  assert.match(g.root.inserted[0].html, /data-raffle-image-step/);
  ctx.changeRaffleImage(g.next);
  assert.equal(g.image.attributes.src, "https://api.example.invalid/public-site/test/images/v1-new");
});

test("media anterior sin array conserva extras, mientras array vacío los retira", () => {
  const { ctx, app, site } = setup();
  const g = gallery();
  app.querySelectorAll = selector => selector === "[data-raffle-gallery]" ? [g.root] : [];
  ctx.applyDeferredPublicMedia(site, { raffles: [{ raffleId: 7, coverImageUrl: cover }] });
  assert.equal(ctx.window.__PUBLIC_SITE_STATE__.site.activeRaffles[0].publicConfig.galleryImageUrls.length, 2);
  ctx.applyDeferredPublicMedia(site, { raffles: [{ raffleId: 7, galleryImageUrls: [] }] });
  assert.equal(g.root.inserted.at(-1).html, "");
  assert.equal(g.image.attributes.src, cover);
  assert.equal(g.status.textContent, "1 / 1");
});

test("delegación captura el clic de galería antes de las compras sin eventos de temporizador", () => {
  const click = source.match(/app\.addEventListener\("click", \(event\) => \{([^]*?)const startPurchaseButton/)[1];
  assert.match(click, /changeRaffleImage\(raffleImageButton\)/);
  assert.match(click, /event\.stopPropagation\(\)/);
  assert.match(click, /return;/);
  const helpers = source.slice(source.indexOf("function getRaffleDisplayImages"), source.indexOf("function getRaffleDisplayPrice"));
  assert.doesNotMatch(helpers, /setInterval|setTimeout|new Image|fetch\(/);
});
