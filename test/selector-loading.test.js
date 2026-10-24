import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function constant(name) {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `Production constant ${name} is present`);
  return Number(match[1]);
}

function setup({ page = 1, query = "", quickPackageQuantity = 0 } = {}) {
  const state = {
    site: {}, slug: "sorteo-prueba", raffle: { campaign: { id: 7 } },
    requestId: 0, page, query, quickPackageQuantity, open: true,
    selected: ["007"], numbers: [{ number: "099", display: "099" }],
    loading: false, error: "", notice: "", noticeTone: "info", pagination: null,
  };
  const calls = { requests: [], paints: [], packages: [], payments: [] };
  const ctx = vm.createContext({
    raffleSelectorState: state,
    RAFFLE_SELECTOR_PAGE_SIZE: constant("RAFFLE_SELECTOR_PAGE_SIZE"),
    RAFFLE_SELECTOR_LIMIT: constant("RAFFLE_SELECTOR_LIMIT"),
    API_BASE_URL: "https://api.example.invalid",
    URLSearchParams,
    asArray: value => Array.isArray(value) ? value : [],
    formatTicketSelectionLabel: ticket => ticket.number,
    getRaffleSelectorFallbackNumbers: () => [],
    paintRaffleSelector: () => calls.paints.push({ loading: state.loading, query: state.query, page: state.page }),
    applyQuickPackageSelection: numbers => { calls.packages.push(numbers); return null; },
    continueRaffleSelectionToPayment: pack => calls.payments.push(pack),
    // Every request is deferred and simulated. No browser, API, payment or network is used.
    fetch: (url, options) => new Promise((resolve, reject) => calls.requests.push({ url, options, resolve, reject })),
  });
  const match = source.match(/async function fetchRaffleSelectorNumbers\([^]*?\n}/);
  assert.ok(match);
  vm.runInContext(source.match(/function getPaymentInstructionsText\([^]*?\n}/)[0], ctx);
  vm.runInContext(match[0], ctx);
  return { ctx, state, calls };
}

function response(number = "051", page = 2) {
  return {
    ok: true,
    json: async () => ({
      numbers: [{ number }],
      pagination: { page, pageSize: 50, total: 110, totalPages: 3 },
      updatedAt: "2026-10-15T15:00:00Z",
    }),
  };
}

test("selector manual toma las instrucciones actuales, incluso si quedaron vacías", async () => {
  for (const instructions of ["Cuenta del sorteo seleccionado", null]) {
    const {ctx,state,calls}=setup();
    state.raffle.campaign.instrucciones_pago="Cuenta anterior";
    const pending=ctx.fetchRaffleSelectorNumbers();
    calls.requests[0].resolve({ok:true,json:async()=>({raffle:{id:7,paymentInstructions:instructions},numbers:[{number:"01"}]})});
    await pending;
    assert.equal(state.error,"");
    assert.equal(ctx.getPaymentInstructionsText(state.raffle),instructions || "");
    assert.equal(state.raffle.campaign.instrucciones_pago,instructions || "");
  }
});

test("usa páginas manuales de 50 y búsqueda de 250 ms sin reducir el límite de paquetes", () => {
  assert.equal(constant("RAFFLE_SELECTOR_PAGE_SIZE"), 50);
  assert.equal(constant("RAFFLE_SELECTOR_SEARCH_DELAY_MS"), 250);
  assert.equal(constant("RAFFLE_SELECTOR_LIMIT"), 100);
});

test("consulta manual pide 50, page/query y selector ligero sin caché ni perder selección", async () => {
  const { ctx, state, calls } = setup({ page: 3, query: "007" });
  const pending = ctx.fetchRaffleSelectorNumbers();
  assert.equal(calls.requests.length, 1);
  assert.equal(state.loading, true);
  assert.equal(calls.paints.length, 1);
  const request = calls.requests[0];
  const url = new URL(request.url);
  assert.equal(url.pathname, "/public-site/sorteo-prueba/raffles/7/availability");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("query"), "007");
  assert.equal(url.searchParams.get("selector"), "1");
  assert.equal(request.options.cache, "no-store");
  request.resolve(response("007", 3));
  await pending;
  assert.equal(state.loading, false);
  assert.equal(state.error, "");
  assert.equal(state.numbers[0].number, "007");
  assert.equal(state.pagination.pageSize, 50);
  assert.deepEqual(state.selected, ["007"]);
  assert.equal(calls.paints.length, 2);

  const second = ctx.fetchRaffleSelectorNumbers();
  assert.equal(calls.requests.length, 2, "Repeated reads still request fresh availability");
  assert.equal(calls.requests[1].options.cache, "no-store");
  calls.requests[1].resolve(response("007", 3));
  await second;
});

test("la ruta heredada de paquetes conserva consulta de 100 y preparación del paquete", async () => {
  const { ctx, calls } = setup({ quickPackageQuantity: 60 });
  const pending = ctx.fetchRaffleSelectorNumbers();
  const request = calls.requests[0];
  const url = new URL(request.url);
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.get("selector"), "1");
  assert.equal(url.searchParams.get("query"), null);
  assert.equal(request.options.cache, "no-store");
  request.resolve(response("001", 1));
  await pending;
  assert.equal(calls.packages.length, 1);
  assert.equal(calls.packages[0][0].number, "001");
});

test("actualización silenciosa no repinta al iniciar y sí al recibir disponibilidad", async () => {
  const { ctx, state, calls } = setup();
  const pending = ctx.fetchRaffleSelectorNumbers({ silent: true });
  assert.equal(calls.paints.length, 0);
  assert.equal(state.loading, false);
  assert.equal(state.numbers[0].number, "099");
  calls.requests[0].resolve(response("001", 1));
  await pending;
  assert.equal(calls.paints.length, 1);
  assert.equal(state.numbers[0].number, "001");
  assert.deepEqual(state.selected, ["007"]);
});

test("una respuesta o error anterior no sustituye la consulta más reciente", async () => {
  for (const outcome of ["success", "error"]) {
    const { ctx, state, calls } = setup();
    const previous = ctx.fetchRaffleSelectorNumbers();
    state.page = 2;
    const latest = ctx.fetchRaffleSelectorNumbers();
    calls.requests[1].resolve(response("051", 2));
    await latest;
    const snapshot = JSON.stringify(state);
    const paints = calls.paints.length;
    if (outcome === "success") calls.requests[0].resolve(response("001", 1));
    else calls.requests[0].reject(new Error("Fallo de petición anterior"));
    await previous;
    assert.equal(JSON.stringify(state), snapshot);
    assert.equal(calls.paints.length, paints);
  }
});

test("descarta éxito y error si cambia búsqueda o página antes de iniciar la siguiente petición", async () => {
  for (const changedField of ["query", "page"]) {
    for (const outcome of ["success", "error"]) {
      const { ctx, state, calls } = setup();
      const pending = ctx.fetchRaffleSelectorNumbers();
      state[changedField] = changedField === "query" ? "007" : 2;
      const snapshot = JSON.stringify(state);
      const paints = calls.paints.length;
      const requestId = state.requestId;
      if (outcome === "success") calls.requests[0].resolve(response("001", 1));
      else calls.requests[0].reject(new Error("Resultado que ya no corresponde"));
      await pending;
      assert.equal(state.requestId, requestId, "The guard also works before debounce starts a new request");
      assert.equal(JSON.stringify(state), snapshot);
      assert.equal(calls.paints.length, paints);
    }
  }
});

test("un error de la consulta vigente finaliza la carga y mantiene los números elegidos", async () => {
  const { ctx, state, calls } = setup();
  const pending = ctx.fetchRaffleSelectorNumbers();
  calls.requests[0].reject(new Error("Sin conexión"));
  await pending;
  assert.equal(state.loading, false);
  assert.equal(state.error, "Sin conexión");
  assert.equal(state.noticeTone, "error");
  assert.equal(state.pagination, null);
  assert.deepEqual(state.selected, ["007"]);
  assert.equal(calls.paints.length, 2);
});
