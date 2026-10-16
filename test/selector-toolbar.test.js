import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const pageSizeDeclaration = source.match(/const RAFFLE_SELECTOR_PAGE_SIZE = (\d+);/);
assert.ok(pageSizeDeclaration, "The production page size is declared");
const pageSize = Number(pageSizeDeclaration[1]);

function setup({ mobile = false, query = "", selected = ["007"], page = 1, groupSize = 1 } = {}) {
  const state = {
    raffle: { campaign: { id: 7, ticket_auto_config: { combinations_per_ticket: groupSize } } },
    site: {}, selected, query, page, loading: false, notice: "",
    numbers: Array.from({ length: 110 }, (_, i) => ({ number: String(i + 1).padStart(3, "0") })),
  };
  const ctx = vm.createContext({
    raffleSelectorState: state,
    RAFFLE_SELECTOR_PAGE_SIZE: pageSize,
    currencyFormatter: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }),
    asArray: value => Array.isArray(value) ? value : [],
    isMobileDevice: () => mobile,
    getRaffleDisplayTitle: () => "Sorteo de prueba",
    getRaffleDisplayDescription: () => "Selecciona tus números.",
    getRaffleDisplayImage: () => "/sorteo.png",
    getRafflePricingBadge: () => "",
    getRaffleDisplayDate: () => "",
    getRaffleDisplayMode: () => "automatico",
    getRaffleDisplayTotal: () => 110,
    formatRafflePricingSummary: () => "1 boleta = $ 1.000",
    getRafflePriceForQuantity: (_raffle, quantity) => quantity * 1000,
    readPersistedSelection: () => [],
  });
  // Exercise the real search, selection summary, pagination and both render branches.
  for (const name of [
    "escapeHtml", "escapeAttr", "formatCOP", "getRafflePricingStrategy", "normalizeTicketDisplayValue", "formatTicketSelectionLabel",
    "filterRaffleSelectorNumbers", "getRaffleSelectorNumbers", "getRaffleSelectorPagination",
    "getRaffleSelectorAutoConfig", "getRaffleSelectorCombinationSize", "getRaffleSelectorSelectionSummary",
    "getCurrentRaffleSelectionForRender", "buildSelectionMessage", "renderRaffleSelectorContent",
  ]) {
    const match = source.match(new RegExp("function " + name + "\\([^]*?\\n}"));
    assert.ok(match, `Production function ${name} is present`);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, state };
}

function assertCleanToolbar(html) {
  assert.doesNotMatch(html, /refresh-raffle-selector|selector-refresh|Actualizar|\d+ numeros visibles/);
  assert.match(html, /<span>Buscar numero<\/span>/);
  assert.match(html, /<input\s+type="search"\s+data-selector-search/);
  assert.match(html, /placeholder="Ej\. 705"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /data-action="close-raffle-selector"/);
  assert.doesNotMatch(html, /selector-pagination-bottom|selector-pagination-current|Página \d+ de \d+|Sin paginacion|<strong>\d+-\d+<\/strong>/);
  for (const direction of ["prev", "next"]) {
    const [button] = pageButtons(html, direction);
    assert.ok(html.indexOf(button) < html.indexOf('class="ticket-grid"'), `The ${direction} page action stays above the number grid`);
  }
}

function pageButtons(html, direction) {
  const buttons = html.match(new RegExp(`<button\\b[^>]*data-selector-page="${direction}"[^>]*>`, "g")) || [];
  assert.equal(buttons.length, 1, `The ${direction} page action appears only once`);
  return buttons;
}

for (const mobile of [false, true]) {
  const view = mobile ? "móvil" : "escritorio";

  test(`${view}: oculta Actualizar y contador sin quitar búsqueda ni dejar toolbar vacía`, () => {
    const { ctx, state } = setup({ mobile });
    const before = JSON.stringify(state);
    const html = ctx.renderRaffleSelectorContent();
    assertCleanToolbar(html);
    assert.doesNotMatch(html, /selector-toolbar-actions|selector-toolbar-note|Resultados para/);
    assert.equal(pageSize, 50);
    assert.equal((html.match(/data-selector-ticket=/g) || []).length, 50);
    assert.match(html, /data-selector-ticket="007"\s+aria-pressed="true"/);
    assert.match(html, /data-selector-remove="007"/);
    assert.equal(JSON.stringify(state), before, "Rendering does not change selection or pagination");
  });

  test(`${view}: conserva estado de carga legible sin reloj animado`, () => {
    const { ctx, state } = setup({ mobile });
    state.loading = true;
    const html = ctx.renderRaffleSelectorContent();
    assert.match(html, /Cargando n[uú]meros disponibles/);
    assert.doesNotMatch(html, /selector-loading-clock/);
    assert.equal((html.match(/data-selector-ticket=/g) || []).length, 0);
    assert.match(html, /data-selector-remove="007"/);
  });

  test(`${view}: mantiene resultados e input de búsqueda y filtra los números reales`, () => {
    const { ctx } = setup({ mobile, query: "007" });
    const html = ctx.renderRaffleSelectorContent();
    assertCleanToolbar(html);
    assert.match(html, /data-selector-search\s+value="007"/);
    assert.match(html, /class="selector-toolbar-note">Resultados para &quot;007&quot;<\/div>/);
    assert.equal((html.match(/data-selector-ticket=/g) || []).length, 1);
    assert.match(html, /data-selector-ticket="007"\s+aria-pressed="true"/);
    const pagination = ctx.getRaffleSelectorPagination(ctx.getRaffleSelectorNumbers());
    assert.equal(pagination.page, 1);
    assert.equal(pagination.totalPages, 1);
    for (const direction of ["prev", "next"]) {
      assert.ok(pageButtons(html, direction).every(button => /\bdisabled\b/.test(button)));
    }
  });

  test(`${view}: conserva paginación, selección y continuación al pago`, () => {
    const { ctx, state } = setup({ mobile });
    const first = ctx.renderRaffleSelectorContent();
    assertCleanToolbar(first);
    const firstPage = ctx.getRaffleSelectorPagination(ctx.getRaffleSelectorNumbers());
    assert.equal(firstPage.page, 1);
    assert.equal(firstPage.totalPages, 3);
    assert.equal((first.match(/data-selector-ticket=/g) || []).length, 50);
    assert.match(first, /data-selector-ticket="001"/);
    assert.match(first, /data-selector-ticket="050"/);
    assert.ok(pageButtons(first, "prev").every(button => /\bdisabled\b/.test(button)));
    assert.ok(pageButtons(first, "next").every(button => !/\bdisabled\b/.test(button)));
    const paymentButtons = first.match(/<button\b[^>]*data-action="go-payment-section"[^>]*>/g) || [];
    assert.ok(paymentButtons.length > 0);
    assert.ok(paymentButtons.every(button => !/\bdisabled\b/.test(button)));

    state.page = 2;
    const second = ctx.renderRaffleSelectorContent();
    assertCleanToolbar(second);
    const secondPage = ctx.getRaffleSelectorPagination(ctx.getRaffleSelectorNumbers());
    assert.equal(secondPage.page, 2);
    assert.equal(secondPage.totalPages, 3);
    assert.equal((second.match(/data-selector-ticket=/g) || []).length, 50);
    assert.match(second, /data-selector-ticket="051"/);
    assert.match(second, /data-selector-ticket="100"/);
    assert.match(second, /data-selector-remove="007"/);
    assert.ok(pageButtons(second, "prev").every(button => !/\bdisabled\b/.test(button)));
    assert.ok(pageButtons(second, "next").every(button => !/\bdisabled\b/.test(button)));

    state.page = 3;
    const third = ctx.renderRaffleSelectorContent();
    assertCleanToolbar(third);
    const thirdPage = ctx.getRaffleSelectorPagination(ctx.getRaffleSelectorNumbers());
    assert.equal(thirdPage.page, 3);
    assert.equal(thirdPage.totalPages, 3);
    assert.equal((third.match(/data-selector-ticket=/g) || []).length, 10);
    assert.match(third, /data-selector-ticket="101"/);
    assert.match(third, /data-selector-ticket="110"/);
    assert.match(third, /data-selector-remove="007"/);
    assert.ok(pageButtons(third, "prev").every(button => !/\bdisabled\b/.test(button)));
    assert.ok(pageButtons(third, "next").every(button => /\bdisabled\b/.test(button)));

    state.selected = [];
    const emptySelection = ctx.renderRaffleSelectorContent();
    const disabledPayments = emptySelection.match(/<button\b[^>]*data-action="go-payment-section"[^>]*>/g) || [];
    assert.ok(disabledPayments.length > 0);
    assert.ok(disabledPayments.every(button => /\bdisabled\b/.test(button)));
  });

  test(`${view}: elimina el bloque verde superior vacío y seleccionado sin perder total ni acciones`, () => {
    for (const selected of [[], ["007"]]) {
      const { ctx } = setup({ mobile, selected });
      const html = ctx.renderRaffleSelectorContent();
      assert.doesNotMatch(html, /selector-live-summary|selector-progress|Selecciona tus números para empezar|Tu total aparecerá|Toca cualquier número para empezar/);
      assertCleanToolbar(html);
      const paymentButtons = html.match(/<button\b[^>]*data-action="go-payment-section"[^>]*>/g) || [];
      const clearButtons = html.match(/<button\b[^>]*data-action="clear-raffle-selection"[^>]*>/g) || [];
      assert.ok(paymentButtons.length > 0);
      assert.ok(clearButtons.length > 0);
      assert.ok([...paymentButtons, ...clearButtons].every(button => /\bdisabled\b/.test(button) === (selected.length === 0)));
      if (selected.length) {
        assert.match(html, /data-selector-remove="007"/);
        if (mobile) {
          assert.match(html, /class="selector-summary-mobile-total">Total: \$\s*1\.000<\/span>/);
          assert.ok(html.indexOf('class="selector-summary-mobile-copy"') > html.indexOf('class="ticket-grid"'), "The mobile total stays below the number grid");
        } else {
          assert.match(html, /<aside class="selector-summary">/);
          assert.match(html, /class="selector-summary-total">\$\s*1\.000<\/p>/);
        }
      } else {
        assert.doesNotMatch(html, /class="selector-summary-mobile-total"|class="selector-summary-total"/);
      }
    }
  });
}

test("móvil: resumen inferior conserva boletas completas, total y aviso de agrupación incompleta", () => {
  for (const [selected, tickets, amount, complete] of [
    [["007"], 0, "0", false],
    [["007", "008", "009"], 1, "1.000", false],
    [["007", "008", "009", "010"], 2, "2.000", true],
  ]) {
    const { ctx } = setup({ mobile: true, selected, groupSize: 2 });
    const html = ctx.renderRaffleSelectorContent();
    const summary = html.match(/<div class="selector-summary-mobile-copy">([^]*?)<\/div>/);
    assert.ok(summary, "Selected numbers retain a compact mobile summary");
    assert.match(summary[1], new RegExp(`${tickets} boleta${tickets === 1 ? "" : "s"} completa`));
    assert.ok(summary[1].replace(/\s/g, "").includes(`Total:$${amount}`));
    assert.match(summary[1], /2 números/);
    if (complete) {
      assert.doesNotMatch(summary[1], /faltan/i);
    } else {
      assert.match(summary[1], /faltan 1 número/i);
    }
    const paymentButton = html.match(/<button\b[^>]*data-action="go-payment-section"[^>]*>/);
    assert.ok(paymentButton);
    assert.equal(/\bdisabled\b/.test(paymentButton[0]), !complete);
    assert.doesNotMatch(html, /selector-live-summary|selector-progress/);
    assert.equal((html.match(/data-selector-remove=/g) || []).length, selected.length);
  }
});
