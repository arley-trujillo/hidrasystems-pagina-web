import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function load(ctx, names) {
  for (const name of names) {
    const match = source.match(new RegExp("(?:async )?function " + name + "\\([^]*?\\n}"));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
}

function setup({ quantity = 20, groupSize = 1, cached = true } = {}) {
  const raffle = {
    campaign: { id: 7, pricingStrategy: "paquetes_fijos", pricingConfig: {
      packages: [{ quantity, price: 40000 }, { quantity: quantity * 2, price: 75000 }],
    }, ticket_auto_config: { combinations_per_ticket: groupSize } },
    publicConfig: { showQuickPackages: false },
  };
  const site = { activeRaffles: [raffle] };
  const selector = { requestId: 1, selected: ["0999"], open: false };
  const payment = { requestId: 1, selected: [], customerName: "Cliente" };
  const calls = { paint: 0, resetTimers: 0, availability: [], payments: 0 };
  let availability;
  const ctx = vm.createContext({
    window: { __PUBLIC_SITE_STATE__: { site: cached ? site : null, slug: "prueba" } },
    document: { querySelector: () => null, activeElement: null },
    raffleSelectorState: selector, paymentModalState: payment,
    publicQuickAvailability: new Map(), RAFFLE_SELECTOR_LIMIT: 100,
    currencyFormatter: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }),
    asArray: value => Array.isArray(value) ? value : [],
    getRaffleDisplayTitle: () => "Sorteo de prueba", getRaffleDisplayDescription: () => "",
    getRaffleDisplayImage: () => "/sorteo.png", getRaffleDisplayImages: () => [],
    renderRaffleImageNavigation: () => "", getRaffleDisplayDate: () => "",
    getRaffleDisplayMode: () => "automatico", getRaffleDisplayTotal: () => 1000,
    renderRaffleAdvanceBlock: () => "",
    fetchFreshPublicSite: async () => site, getSlugFromLocation: () => "prueba",
    clearRaffleSelectorTimers: () => calls.resetTimers++,
    syncRaffleSelectorModal: () => {}, paintRaffleSelector: () => calls.paint++,
    loadQuickPackageAvailability: async (...args) => { calls.availability.push(args); return availability; },
    closeRaffleSelector: () => { selector.open = false; },
    paintPaymentModal: () => {}, refreshPaymentModalActionState: () => {},
    openPaymentModal: payload => { calls.payments++; Object.assign(payment, payload, { open: true, error: "" }); },
    fetch: () => { throw Error("No payment or reservation permitted in this test"); },
    setInterval: () => { throw Error("Fixed packages must not poll the manual grid"); },
  });
  load(ctx, [
    "getPaymentInstructionsText",
    "escapeHtml", "escapeAttr", "getRafflePricingConfig", "getRafflePricingStrategy", "getRafflePricingPackages",
    "getRaffleFixedPackagePrice", "getRafflePriceForQuantity", "getRaffleDisplayPrice", "getRafflePricingBadge",
    "formatRafflePricingSummary", "getQuickPackageOptions", "shouldShowQuickPackages", "renderQuickPackageActions",
    "getRaffleSelectorAutoConfig", "getRaffleSelectorCombinationSize", "getRaffleSelectorSelectionSummary",
    "normalizeTicketDisplayValue", "getPaymentModalSelectionTotal", "renderRaffles", "renderRaffleSelectorContent",
    "openFixedPackageSelector", "openRaffleSelector", "openQuickPackagePayment", "prepareQuickPackageNumbers",
  ]);
  return { ctx, raffle, site, selector, payment, calls, resolve: payload => { availability = payload; } };
}

test("paquetes fijos muestra opciones aleatorias aun con compra rápida antigua apagada; no ofrece números manuales", () => {
  const { ctx, raffle, site } = setup();
  assert.equal(ctx.shouldShowQuickPackages(raffle), true);
  for (const raffles of [[raffle], [raffle, { ...raffle, campaign: { ...raffle.campaign, id: 8 } }]]) {
    const html = ctx.renderRaffles({ ...site, activeRaffles: raffles });
    assert.match(html, /data-raffle-package="20"/);
    assert.match(html, /data-raffle-package="40"/);
    assert.match(html, /Números al azar/);
    assert.doesNotMatch(html, /js-open-raffle-selector|Escoger mis números/);
  }
  raffle.campaign.pricingStrategy = "paquetes";
  assert.equal(ctx.shouldShowQuickPackages(raffle), false);
  assert.match(ctx.renderRaffles(site), /Escoger mis números/);
});

for (const cached of [true, false]) {
  test(`entrada antigua al selector ${cached ? "en caché" : "recargada"} abre paquetes sin consultar inventario ni comprar`, async () => {
    const { ctx, selector, calls } = setup({ cached });
    await ctx.openRaffleSelector(7);
    assert.equal(selector.open, true);
    assert.equal(selector.selected.length, 0);
    assert.equal(calls.payments, 0);
    assert.equal(calls.availability.length, 0);
    assert.equal(calls.resetTimers, 1);
    const html = ctx.renderRaffleSelectorContent();
    assert.match(html, /data-raffle-package="20"/);
    assert.match(html, /data-action="close-raffle-selector"/);
    assert.doesNotMatch(html, /data-selector-ticket|data-selector-search|go-payment-section/);
  });
}

test("30 números reserva tres grupos de diez del servidor, sin multiplicar números ni cambiar precio", async () => {
  const { ctx, raffle, payment, calls, resolve } = setup({ quantity:30, groupSize: 10 });
  const groups = Array.from({ length: 3 }, (_, i) => Array.from({ length: 10 }, (_, j) => String(i * 10 + j).padStart(4, "0")));
  resolve({ randomPackage: true, numbers: groups.map(numbers => ({ numbers })) });
  assert.match(ctx.renderQuickPackageActions(raffle), /data-raffle-package="30"/);
  assert.equal(await ctx.openQuickPackagePayment(7, 30), true);
  assert.deepEqual(calls.availability, [["prueba", 7, 30]]);
  assert.deepEqual(Array.from(payment.selected), groups.flat());
  assert.equal(payment.amount, 40000);
  assert.equal(payment.selected.length,30);
  assert.equal(ctx.getRaffleSelectorSelectionSummary(payment.raffle, payment.selected).completeTickets, 3);
  assert.equal(payment.customerName, "Cliente");
});

test('el paquete de treinta números rechaza la respuesta antigua de treinta boletas y conserva el precio',async()=>{
  const {ctx,payment,resolve}=setup({quantity:30,groupSize:10});
  const groups=Array.from({length:30},(_,i)=>Array.from({length:10},(_,j)=>String(i*10+j).padStart(5,'0')));
  resolve({randomPackage:true,numbers:groups.map(numbers=>({numbers}))});
  assert.equal(await ctx.openQuickPackagePayment(7,30),false);
  assert.equal(payment.selected.length,0);
  assert.match(payment.error,/No hay suficientes/);
});

for (const [name, payload] of [
  ["respuesta antigua sin asignación aleatoria", { numbers: [{ numbers: ["01"] }, { numbers: ["02"] }] }],
  ["inventario insuficiente", { randomPackage: true, numbers: [{ numbers: ["01"] }] }],
  ["números repetidos", { randomPackage: true, numbers: [{ numbers: ["01"] }, { numbers: ["01"] }] }],
  ["grupo incompleto", { randomPackage: true, numbers: [{ numbers: ["01"] }, { numbers: [] }] }],
]) {
  test(`bloquea ${name} sin pasar a pago ni inventar números`, async () => {
    const { ctx, payment, resolve } = setup({ quantity: 2 });
    resolve(payload);
    assert.equal(await ctx.openQuickPackagePayment(7, 2), false);
    assert.equal(payment.selected.length, 0);
    assert.match(payment.error, /No hay suficientes/);
  });
}

test("consulta aleatoria y caché quedan separadas por paquete; modo anterior conserva URL", async () => {
  const requests = [];
  const ctx = vm.createContext({
    API_BASE_URL: "https://example.invalid", RAFFLE_SELECTOR_LIMIT: 100,
    publicQuickAvailability: new Map(), AbortController,
    window: { setTimeout: () => 1, clearTimeout: () => {} },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ numbers: [] }) }; },
  });
  load(ctx, ["loadQuickPackageAvailability"]);
  await ctx.loadQuickPackageAvailability("prueba", 7, 20);
  await ctx.loadQuickPackageAvailability("prueba", 7, 40);
  await ctx.loadQuickPackageAvailability("prueba", 7, 20);
  await ctx.loadQuickPackageAvailability("prueba", 7);
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[0].url).searchParams.get("package_quantity"), "20");
  assert.equal(new URL(requests[1].url).searchParams.get("package_quantity"), "40");
  assert.equal(new URL(requests[2].url).searchParams.get("package_quantity"), null);
  assert.ok(requests.every(request => request.options.cache === "no-store"));
});
