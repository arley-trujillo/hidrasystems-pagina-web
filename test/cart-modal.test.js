import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function setup({ quantity = null, selected = ["01"], groupSize = 1, preparing = false, loading = false, amount = 0, supportUpload = false, contact = true } = {}) {
  const raffle = {
    campaign: {
      id: 7,
      title: "Sorteo de prueba",
      pricingStrategy: "paquetes",
      pricingConfig: { packages: [{ cantidad: 1, valor: 1000 }, { cantidad: 2, valor: 1700 }] },
      ticket_auto_config: { combinations_per_ticket: groupSize, public_support_upload: supportUpload },
      instrucciones_pago: "Conserva el comprobante de tu pago.",
    },
    publicConfig: { showQuickPackages: true },
    ...(quantity === null ? {} : { quickPackage: { quantity, value: quantity === 1 ? 1000 : 1800 } }),
  };
  const state = {
    open: true, raffle, selected, amount,
    site: { settings: {} }, preparingPackage: preparing, loading,
    customerName: contact ? "Cliente de prueba" : "",
    customerCity: contact ? "Bogotá" : "",
    customerPhone: contact ? "3001234567" : "",
    fileName: "soporte.png", notice: "", checkoutUrl: "", requestId: 5,
  };
  const ctx = vm.createContext({
    paymentModalState: state,
    currencyFormatter: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }),
    asArray: value => Array.isArray(value) ? value : [],
    getRaffleDisplayTitle: item => item.campaign.title,
    getRaffleDisplayDescription: () => "Participa en el sorteo.",
    getRaffleDisplayWhatsApp: () => "573001234567",
    getRaffleDisplayImage: () => "/sorteo.png",
    getRaffleDisplayDate: () => "",
    getRafflePricingBadge: () => "",
    getRaffleDisplayMode: () => "automatico",
    getRaffleDisplayTotal: () => 100,
    renderRaffleAdvanceBlock: () => "",
    RAFFLE_SELECTOR_LIMIT: 100,
  });
  // The rendering and all quantity/group/price decisions run from production source.
  // Only unrelated display metadata is stubbed; there is no network or payment call.
  for (const name of [
    "escapeHtml", "escapeAttr", "formatCOP", "getRafflePricingConfig", "getRafflePricingStrategy",
    "getRafflePricingPackages", "getRaffleFixedPackagePrice", "getRafflePriceForQuantity", "getRaffleDisplayPrice", "formatRafflePricingSummary",
    "getRaffleSelectorAutoConfig", "getRaffleSelectorCombinationSize", "getRaffleSelectorSelectionSummary",
    "getPaymentModalSelectionTotal", "getPaymentInstructionsText", "renderPaymentInstructionsPanel",
    "getQuickPackageOptions", "shouldShowQuickPackages", "renderQuickPackageActions", "renderRaffles",
    "getRaffleDisplayImages", "renderRaffleImageNavigation",
    "renderPaymentModalContent", "renderPaymentModal",
  ]) {
    const match = source.match(new RegExp("function " + name + "\\([^]*?\\n}"));
    assert.ok(match, `Production function ${name} is present`);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, state, raffle };
}

function detail(html) {
  const match = html.match(/<div class="payment-modal-pricing">\s*<span>Detalle de tu compra:<\/span>\s*<p>([^]*?)<\/p>\s*<\/div>/);
  assert.ok(match, "The cart includes the selected purchase detail");
  return match[1];
}

function total(html) {
  const match = html.match(/<div class="payment-modal-total">\s*<span>Total a pagar<\/span>\s*<strong>([^]*?)<\/strong>/);
  assert.ok(match, "The existing total remains visible");
  return match[1].replace(/\s/g, "");
}

function receiptButton(html) {
  const match = html.match(/<button\b[^>]*data-action="trigger-public-receipt-upload"[^>]*>/);
  assert.ok(match, "The existing receipt action remains present");
  return match[0];
}

test("el modal se llama Carrito de compra y mantiene un nombre accesible", () => {
  const { ctx } = setup();
  assert.match(ctx.renderPaymentModalContent(), /<h3 id="payment-modal-title">Carrito de compra<\/h3>/);
  assert.match(ctx.renderPaymentModal(), /role="dialog"/);
  assert.match(ctx.renderPaymentModal(), /aria-labelledby="payment-modal-title"/);
});

for (const [quantity, expectedTotal] of [[1, "$1.000"], [2, "$1.800"]]) {
  test(`paquete rápido de ${quantity}: describe lo comprado y mantiene su precio acordado`, () => {
    const { ctx } = setup({ quantity, selected: Array.from({ length: quantity }, (_, i) => String(i + 1)) });
    const html = ctx.renderPaymentModalContent();
    assert.equal(detail(html), `Paquete de ${quantity}`);
    assert.equal(total(html), expectedTotal);
    assert.doesNotMatch(html, /Precio de boletería:|boletas por|1 boleta =|2 boletas =/);
    assert.doesNotMatch(receiptButton(html), /\bdisabled\b/);
  });
}

test("la preparación del paquete muestra su cantidad aunque aún no haya números asignados", () => {
  const { ctx, state } = setup({ quantity: 2, selected: [], preparing: true, amount: 1800 });
  const before = JSON.stringify(state);
  const html = ctx.renderPaymentModalContent();
  assert.equal(detail(html), "Paquete de 2");
  assert.equal(total(html), "$1.800");
  assert.doesNotMatch(receiptButton(html), /\bdisabled\b/);
  assert.equal(JSON.stringify(state), before, "Rendering does not assign numbers or change payment state");
});

for (const [selected, quantity, expectedTotal] of [
  [["01", "02"], 1, "$1.000"],
  [["01", "02", "03", "04"], 2, "$1.700"],
]) {
  test(`selección manual de ${selected.length} números agrupados: Paquete de ${quantity}, no de ${selected.length}`, () => {
    const { ctx } = setup({ selected, groupSize: 2 });
    const html = ctx.renderPaymentModalContent();
    assert.equal(detail(html), `Paquete de ${quantity}`);
    assert.equal(total(html), expectedTotal);
    assert.equal((html.match(/class="payment-chip"/g) || []).length, selected.length);
    assert.doesNotMatch(receiptButton(html), /\bdisabled\b/);
  });
}

test("selección vacía no inventa un paquete y mantiene bloqueado el comprobante", () => {
  const { ctx } = setup({ selected: [] });
  const html = ctx.renderPaymentModalContent();
  assert.equal(detail(html), "Aún no hay boletas seleccionadas.");
  assert.equal(total(html), "$0");
  assert.match(receiptButton(html), /\bdisabled\b/);
});

test("paquetes sin precio individual bloquea el pago y no muestra un total unitario guardado", () => {
  const { ctx, raffle, state } = setup({ amount: 9000 });
  raffle.campaign.pricingStrategy = "paquetes_fijos";
  raffle.campaign.numberValue = 9000;
  raffle.campaign.pricingConfig = { precio_unitario: 9000, packages: [{ quantity: 3, price: 20000 }] };
  const html = ctx.renderPaymentModalContent();
  assert.equal(total(html), "Cantidadsinpaqueteconfigurado");
  assert.match(receiptButton(html), /\bdisabled\b/);
  assert.match(html, /Revisa los paquetes/);
  assert.doesNotMatch(html, /Puedes pagar/);
  assert.equal(state.amount, 9000, "Render does not mutate a previously saved amount");
});

test("selecciones incompletas conservan advertencia, cálculo y bloqueo de pago", () => {
  for (const [selected, expectedTotal] of [[["01"], "$0"], [["01", "02", "03"], "$1.000"]]) {
    const { ctx } = setup({ selected, groupSize: 2 });
    const html = ctx.renderPaymentModalContent();
    assert.equal(detail(html), "Selección pendiente de completar.");
    assert.equal(total(html), expectedTotal);
    assert.match(html, /Te faltan 1 número para completar una boleta de 2 números\./);
    assert.match(receiptButton(html), /\bdisabled\b/);
  }
});

test("conserva contacto, instrucciones, archivo, soporte y acciones sin mutar la compra", () => {
  const { ctx, state } = setup({ quantity: 2, selected: ["01", "02"], amount: 1800 });
  const before = JSON.stringify(state);
  const html = ctx.renderPaymentModalContent();
  for (const field of ["customerName", "customerCity", "customerPhone"]) {
    assert.match(html, new RegExp(`data-payment-field="${field}"`));
    assert.ok(html.includes(`value="${state[field]}"`));
  }
  assert.match(html, /data-public-receipt-input/);
  assert.match(html, /data-payment-instructions/);
  assert.match(html, /Conserva el comprobante de tu pago\./);
  assert.match(html, /soporte\.png/);
  assert.match(html, /Soporte por WhatsApp: 573001234567/);
  assert.equal((html.match(/data-action="close-payment-modal"/g) || []).length, 2);
  assert.equal(JSON.stringify(state), before);
});

test("Datos del comprador conserva encabezado y formulario sin el icono de contacto en rifas", () => {
  const { ctx, state } = setup();
  const html = ctx.renderPaymentModalContent();
  assert.doesNotMatch(html, /payment-action-icon-contact/);
  assert.match(html, /class="payment-card-kicker">Datos del comprador<\/span>/);
  assert.match(html, /<strong>Completa tus datos<\/strong>/);
  for (const field of ["customerName", "customerCity", "customerPhone"]) {
    assert.match(html, new RegExp(`data-payment-field="${field}"`));
    assert.ok(html.includes(`value="${state[field]}"`));
  }
  const retailRenderer = source.match(/function renderRetailCheckoutModalContent\([^]*?\n}/);
  assert.ok(retailRenderer, "The independent retail checkout remains present");
  assert.match(retailRenderer[0], /payment-action-icon-contact/);
});

test("Instrucciones de pago conserva títulos y contenido configurado o vacío sin icono separado", () => {
  for (const instructions of ["Conserva el comprobante de tu pago.", ""]) {
    const { ctx, raffle } = setup();
    raffle.campaign.instrucciones_pago = instructions;
    const html = ctx.renderPaymentModalContent();
    assert.doesNotMatch(html, /payment-action-icon-note/);
    assert.match(html, /class="payment-card-kicker">Instrucciones de pago<\/span>/);
    assert.match(html, /class="payment-card-badge">Lee antes de pagar<\/span>/);
    assert.match(html, /<strong>Así debes realizar tu pago<\/strong>/);
    assert.match(html, /<div data-payment-instructions>/);
    if (instructions) {
      assert.match(html, /<p>Conserva el comprobante de tu pago\.<\/p>/);
    } else {
      assert.match(html, /Aun no hay instrucciones de pago configuradas para este sorteo\./);
    }
  }
});

test("el icono de carga está dentro del botón de comprobante o captura y conserva su bloqueo", () => {
  for (const supportUpload of [false, true]) {
    for (const overrides of [{}, { contact: false }, { loading: true }]) {
      const { ctx } = setup({ supportUpload, ...overrides });
      const html = ctx.renderPaymentModalContent();
      const button = html.match(/<button\b[^>]*data-action="trigger-public-receipt-upload"[^>]*>([^]*?)<\/button>/);
      assert.ok(button, "The upload action remains a button");
      assert.doesNotMatch(html, /payment-action-icon-upload/);
      assert.match(button[1], /^\s*<svg\b[^>]*aria-hidden="true"[^>]*focusable="false"[^>]*>[^]*<\/svg>\s*<span>/);
      assert.match(button[1], /width:1\.2em;height:1\.2em;display:block;flex-shrink:0;/);
      assert.match(button[1], /<path\b/);
      assert.ok(button[1].includes(`<span>${supportUpload ? "Cargar captura" : "Cargar comprobante"}</span>`));
      assert.equal(/\bdisabled\b/.test(receiptButton(html)), overrides.contact === false || overrides.loading === true);
      assert.match(html, /<input type="file" accept="image\/\*" data-public-receipt-input hidden \/>/);
    }
  }
});

test("no habilita comprobantes sin contacto, durante carga ni más de una boleta de fidelización", () => {
  for (const overrides of [
    { contact: false },
    { loading: true },
    { supportUpload: true, selected: ["01", "02"] },
    { supportUpload: true, quantity: 2, selected: [], preparing: true },
  ]) {
    const { ctx } = setup(overrides);
    assert.match(receiptButton(ctx.renderPaymentModalContent()), /\bdisabled\b/);
  }
  const { ctx } = setup({ supportUpload: true });
  assert.doesNotMatch(receiptButton(ctx.renderPaymentModalContent()), /\bdisabled\b/);
  assert.match(ctx.renderPaymentModalContent(), /Cargar captura/);
});

test("el catálogo conserva Precio de boletería y sus precios sin mezclarlos con el carrito", () => {
  const { ctx, raffle } = setup({ quantity: 2, selected: ["01", "02"] });
  const html = ctx.renderRaffles({ activeRaffles: [raffle] });
  assert.match(html, /class="raffle-price-label">Precio de boletería:<\/div>/);
  assert.match(html, /1 boleta = \$\s*1\.000 \| 2 boletas = \$\s*1\.700/);
  assert.match(html, /data-raffle-package="1"/);
  assert.match(html, /data-raffle-package="2"/);
  assert.match(html, /js-open-raffle-selector/);
  assert.equal(detail(ctx.renderPaymentModalContent()), "Paquete de 2");
  assert.equal(total(ctx.renderPaymentModalContent()), "$1.800");
});
