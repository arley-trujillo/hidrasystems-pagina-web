import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function setup({enabled = true, rendered = true} = {}) {
  const calls = {manual: [], scroll: [], focus: [], selectors: []};
  const panel = {style: {}, scrollIntoView: options => calls.scroll.push(options)};
  const button = {closest: () => panel, focus: options => calls.focus.push(options)};
  const ctx = vm.createContext({
    window: {__PUBLIC_SITE_STATE__: {site: {activeRaffles: [
      {campaign: {id: 7}, publicConfig: {showQuickPackages: enabled}},
      {campaign: {id: 8}, publicConfig: {showQuickPackages: false}},
    ]}}},
    asArray: value => Array.isArray(value) ? value : [],
    getQuickPackageOptions: () => [{quantity: 2, value: 1500}],
    CSS: {escape: String},
    app: {querySelector: selector => {
      calls.selectors.push(selector);
      return selector === ".topbar" ? {getBoundingClientRect: () => ({height: 140})} : rendered ? button : null;
    }},
    openRaffleSelector: id => calls.manual.push(id),
  });
  for (const name of ["shouldShowQuickPackages", "openHeroRafflePurchase"]) {
    vm.runInContext(source.match(new RegExp("function " + name + "\\([^]*?\\n}"))[0], ctx);
  }
  return {ctx, calls, panel};
}

test("hero con paquetes dirige al mismo sorteo, enfoca sin comprar y evita el selector", () => {
  const {ctx, calls, panel} = setup();
  ctx.openHeroRafflePurchase(7);
  assert.equal(calls.manual.length, 0);
  assert.equal(calls.scroll.length, 1);
  assert.equal(calls.scroll[0].behavior, "instant");
  assert.equal(panel.style.scrollMarginTop, "156px");
  assert.equal(calls.focus[0].preventScroll, true);
  assert.match(calls.selectors[0], /#sorteos.*data-raffle-id="7"/);
});

test("no activa paquetes automaticamente ni usa los de otro sorteo", () => {
  for (const [enabled, id] of [[false, 7], [true, 8], [true, 99]]) {
    const {ctx, calls} = setup({enabled});
    ctx.openHeroRafflePurchase(id);
    assert.deepEqual(calls.manual, [id]);
    assert.equal(calls.scroll.length, 0);
    assert.equal(calls.selectors.length, 0);
  }
});

test("sin opciones renderizables conserva la compra manual y no deja el boton inactivo", () => {
  const {ctx, calls} = setup({rendered: false});
  ctx.openHeroRafflePurchase(7);
  assert.deepEqual(calls.manual, [7]);
  assert.equal(calls.scroll.length, 0);
});
