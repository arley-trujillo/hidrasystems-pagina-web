import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const packageRaffle = (packages = [{ quantity: 3, price: 50000 }], extra = {}) => ({
  campaign: { id: 7, pricingStrategy: "paquetes_fijos", numberValue: 20000,
    pricingConfig: { precio_unitario: 20000, packages }, ...extra },
});

function setup(raffle = packageRaffle(), selected = ["001"]) {
  const calls = { fetch: 0, open: 0, modal: 0, paint: 0, notices: [] };
  const selector = { raffle, selected, loading: false, site: {}, slug: "prueba" };
  const payment = { raffle, selected, loading: false, open: true, site: {}, slug: "prueba",
    customerName: "Cliente", customerCity: "Ciudad", customerPhone: "3001234567" };
  const ctx = vm.createContext({
    Number, Math, Intl, Array,
    currencyFormatter: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }),
    asArray: value => Array.isArray(value) ? value : [],
    raffleSelectorState: selector, paymentModalState: payment,
    getCurrentRaffleSelection: () => selected,
    paintRaffleSelector: () => calls.paint++, closeRaffleSelector: () => {},
    openPaymentModal: () => calls.modal++,
    awaitPackageBeforePayment: async () => true, ensurePaymentModalContactReady: () => true,
    submitPublicPaymentStateNotice: message => calls.notices.push(message),
    window: { open: () => { calls.open++; throw Error("Unexpected payment popup"); } },
    fetch: () => { calls.fetch++; throw Error("Unexpected payment request"); },
  });
  for (const name of [
    "getRafflePricingConfig", "getRafflePricingStrategy", "getRafflePricingPackages", "getRaffleDisplayPrice",
    "getQuickPackageOptions", "getRaffleFixedPackagePrice", "getRafflePriceForQuantity", "formatRafflePricingSummary", "getRafflePricingBadge",
    "getRaffleSelectorAutoConfig", "getRaffleSelectorCombinationSize", "getRaffleSelectorSelectionSummary",
    "getPaymentModalSelectionTotal", "continueRaffleSelectionToPayment", "submitPublicPseCheckout", "submitPublicReceiptUpload",
  ]) {
    const match = source.match(new RegExp("(?:async )?function " + name + "\\([^]*?\\n}"));
    assert.ok(match, `Production function ${name} exists`);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, calls, selector, payment };
}

test("nuevo modo paquetes fijos no inventa precio individual ni usa el antiguo valor unitario", () => {
  const raffle = packageRaffle();
  const { ctx } = setup(raffle);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 1), null);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 4), null);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 3), 50000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 6), 100000);
  assert.equal(ctx.getRaffleDisplayPrice(raffle), "");
  assert.equal(ctx.getRafflePricingBadge(raffle), "");
  const empty = packageRaffle([]);
  assert.equal(ctx.getRafflePriceForQuantity(empty, 1), null);
  assert.match(ctx.formatRafflePricingSummary(empty), /paquetes.*pendientes/i);
});

test("cotiza combinaciones exactas al menor precio, sin algoritmo voraz ni redondeo de cantidad", () => {
  const { ctx } = setup();
  const raffle = packageRaffle([{ quantity: 4, price: 100000 }, { quantity: 3, price: 50000 }]);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 6), 100000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 12), 200000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 7), 150000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 5), null);
  for (const quantity of [0, -1, 1.5, Infinity, NaN, "3abc", 10001]) {
    assert.equal(ctx.getRafflePriceForQuantity(raffle, quantity), null);
  }
  const cents = packageRaffle([{ quantity: 2, price: 10.15 }, { quantity: 3, price: 15.20 }]);
  assert.equal(ctx.getRafflePriceForQuantity(cents, 5), 25.35);
});

test("precios anteriores conservan cálculo, fallback, paquetes y ofertas rápidas sin alteraciones", () => {
  const raffle = packageRaffle([{ quantity: 3, price: 1000 }], { pricingStrategy: "unitario" });
  const { ctx } = setup(raffle);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 3), 1000);
  assert.equal(ctx.getRafflePricingPackages(raffle).length, 1);
  assert.match(ctx.formatRafflePricingSummary(raffle), /3 boletas/);
  const unit = packageRaffle([], { pricingStrategy: "unitario" });
  assert.equal(ctx.getRafflePriceForQuantity(unit, 3), 60000);
  assert.equal(ctx.getRafflePriceForQuantity(unit, 0), 20000);
  const legacy = packageRaffle([{ quantity: 4, price: 100000 }, { quantity: 3, price: 50000 }], { pricingStrategy: "paquetes" });
  assert.equal(ctx.getRafflePriceForQuantity(legacy, 6), 200000);
  assert.equal(ctx.getRafflePriceForQuantity(legacy, 12), 300000);
  assert.equal(ctx.getRafflePriceForQuantity(packageRaffle([], { pricingStrategy: "paquetes" }), 1), 20000);
  assert.ok(ctx.getRaffleDisplayPrice(legacy));
});

test("cantidades de paquete son boletas físicas y no sus combinaciones internas", () => {
  const raffle = packageRaffle([{ quantity: 2, price: 40000 }], { ticket_auto_config: { combinations_per_ticket: 3 } });
  const { ctx } = setup(raffle);
  const summary = ctx.getRaffleSelectorSelectionSummary(raffle, ["01", "02", "03", "04", "05", "06"]);
  assert.equal(summary.totalNumbers, 6);
  assert.equal(summary.completeTickets, 2);
  assert.equal(summary.total, 40000);
  assert.equal(summary.hasValidPrice, true);
  assert.equal(ctx.getRaffleSelectorSelectionSummary(raffle, ["01", "02", "03"]).hasValidPrice, false);
});

test("conserva paquetes rápidos web personalizados como oferta explícita separada", () => {
  const raffle = { ...packageRaffle(undefined, { pricingStrategy: "paquetes" }), publicConfig: { quickPackages: [{ quantity: 2, price: 25000 }] },
    quickPackage: { quantity: 2, value: 25000 } };
  const { ctx } = setup(raffle);
  assert.equal(ctx.getQuickPackageOptions(raffle)[0].quantity, 2);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 2), 25000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 1), 50000);
  assert.match(ctx.formatRafflePricingSummary(raffle), /2 boletas por/);
});

test("paquetes fijos ignora precio y cantidades antiguas de compra rápida web", () => {
  const raffle = { ...packageRaffle([{ quantity: 20, price: 40000 }]),
    publicConfig: { quickPackages: [{ quantity: 1, price: 1000 }, { quantity: 20, price: 2000 }] },
    quickPackage: { quantity: 1, value: 1000 } };
  const { ctx } = setup(raffle);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 1), null);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 20), 40000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 40), 80000);
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 21), null);
  assert.equal(ctx.getQuickPackageOptions(raffle).length, 1);
  assert.equal(ctx.getQuickPackageOptions(raffle)[0].quantity, 20);
  assert.equal(ctx.getQuickPackageOptions(raffle)[0].value, 40000);
  raffle.quickPackage = { quantity: 20, value: 1 };
  assert.equal(ctx.getRafflePriceForQuantity(raffle, 20), 40000);
  assert.doesNotMatch(ctx.formatRafflePricingSummary(raffle), /boletas por/);
});

test("paquetes fijos no reutiliza selección manual y los paquetes anteriores conservan su flujo", () => {
  const invalid = setup();
  invalid.ctx.continueRaffleSelectionToPayment();
  assert.equal(invalid.calls.modal, 0);
  assert.match(invalid.selector.notice, /asignan al azar/);
  const valid = setup(packageRaffle(), ["01", "02", "03"]);
  valid.ctx.continueRaffleSelectionToPayment();
  assert.equal(valid.calls.modal, 0);
  assert.match(valid.selector.notice, /asignan al azar/);
  const quick = setup(packageRaffle(undefined, { pricingStrategy: "paquetes" }), ["01", "02"]);
  quick.ctx.continueRaffleSelectionToPayment({ quantity: 2, value: 25000 });
  assert.equal(quick.calls.modal, 1);
});

test("sin paquete válido bloquea PSE y comprobante antes de abrir ventanas o enviar solicitudes", async () => {
  const { ctx, calls } = setup();
  await ctx.submitPublicPseCheckout();
  await ctx.submitPublicReceiptUpload({ name: "comprobante.jpg" });
  assert.equal(calls.fetch, 0);
  assert.equal(calls.open, 0);
  assert.equal(calls.notices.length, 2);
  assert.ok(calls.notices.every(message => /no coincide con los paquetes/.test(message)));
});

test("fidelización sin precio mantiene captura gratuita, no la confunde con paquete inválido", () => {
  const raffle = packageRaffle([], { numberValue: 0, pricingStrategy: "unitario", pricingConfig: {},
    ticket_auto_config: { public_support_upload: true } });
  const { ctx, calls } = setup(raffle);
  const summary = ctx.getRaffleSelectorSelectionSummary(raffle, ["01"]);
  assert.equal(summary.total, 0);
  assert.equal(summary.supportUploadMode, true);
  ctx.continueRaffleSelectionToPayment();
  assert.equal(calls.modal, 1);
});
