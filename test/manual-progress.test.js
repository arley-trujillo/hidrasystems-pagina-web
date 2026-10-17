import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function context(extra = {}) {
  const ctx = vm.createContext({
    escapeHtml: String, getRaffleDisplayTitle: () => 'Prueba', getRaffleDisplayTotal: () => 0,
    asArray: value => Array.isArray(value) ? value : [], ...extra,
  });
  for (const name of ['getRaffleAdvanceStats', 'renderRaffleAdvanceBlock', 'refreshFeaturedRaffleAdvance']) {
    vm.runInContext(source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))[0], ctx);
  }
  return ctx;
}
const stats = { inventoryTotal: 1000, soldCount: 100, reservedCount: 50 };
const raffle = percent => ({ campaign: { id: 1 }, stats, publicConfig: { manualProgressEnabled: true, manualProgressPercent: percent } });

test('manual display can go up or down without changing inventory or actual sales', () => {
  const ctx = context();
  for (const percent of [0, 100, 40.25, 5]) {
    const input = raffle(percent);
    const original = JSON.stringify(input);
    const result = ctx.getRaffleAdvanceStats(input);
    assert.equal(result.percent, percent);
    assert.equal(result.sold, 100);
    assert.equal(result.reserved, 50);
    assert.equal(result.total, 1000);
    assert.equal(JSON.stringify(input), original);
    assert.match(ctx.renderRaffleAdvanceBlock(input), new RegExp(`width: ${percent}%;`));
    assert.ok(ctx.renderRaffleAdvanceBlock(input).includes(`${percent}% de avance`));
  }
});

test('manual percentage renders immediately even before real statistics arrive', () => {
  const ctx = context();
  const input = raffle(45);
  delete input.stats;
  assert.ok(ctx.renderRaffleAdvanceBlock(input).includes('45% de avance'));
  assert.doesNotMatch(ctx.renderRaffleAdvanceBlock(input), /Cargando/);
});

test('disabled or invalid manual values keep automatic progress', () => {
  const ctx = context();
  for (const percent of [-1, 101, null, undefined, '', 'invalid']) {
    assert.equal(ctx.getRaffleAdvanceStats(raffle(percent)).percent, 15);
  }
  const input = raffle(70);
  input.publicConfig.manualProgressEnabled = false;
  assert.equal(ctx.getRaffleAdvanceStats(input).percent, 15);
  delete input.publicConfig;
  assert.equal(ctx.getRaffleAdvanceStats(input).percent, 15);
});

test('background refresh skips manual raffles and still updates automatic hero and card', async () => {
  const requests = [];
  const roots = [0, 1].map(() => {
    const fill = { style: {} }, meta = {};
    return { fill, meta, querySelector: selector => selector.includes('fill') ? fill : meta };
  });
  const ctx = context({
    API_BASE_URL: 'https://example.test', CSS: { escape: String },
    window: { requestAnimationFrame: callback => callback() },
    app: { querySelectorAll: selector => { assert.ok(selector.includes('"2"')); return roots; } },
    fetch: async url => { requests.push(url); return { ok: true, json: async () => ({ stats }) }; },
  });
  await ctx.refreshFeaturedRaffleAdvance({ activeRaffles: [raffle(80), { campaign: { id: 2 } }] }, 'test');
  assert.equal(requests.length, 1);
  assert.match(requests[0], /\/raffles\/2\/availability\?summary=1$/);
  for (const root of roots) {
    assert.equal(root.fill.style.width, '15%');
    assert.equal(root.meta.textContent, '15% de avance');
  }
});
