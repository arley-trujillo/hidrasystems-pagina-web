import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function context(extra = {}) {
  const ctx = vm.createContext({
    AbortSignal,
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

test('the page uses the canonical backend progress before its rollout fallback', () => {
  const ctx = context();
  const input = {
    stats,
    publicConfig: { manualProgressEnabled: true, manualProgressPercent: 90 },
    displayProgress: {
      percent: 72,
      source: 'automatic',
      inventory_total: 1000,
      sold_count: 620,
      reserved_count: 100,
      available_count: 280,
      processed_count: 720,
    },
  };
  const result = ctx.getRaffleAdvanceStats(input);
  assert.equal(result.percent, 72);
  assert.equal(result.sold, 620);
  assert.equal(result.reserved, 100);
  assert.equal(result.processed, 720);
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

test('background refresh updates mixed and automatic bars with current backend values', async () => {
  const requests = [];
  const roots = [0, 1].map(() => {
    const fill = { style: {} }, meta = {};
    return { fill, meta, querySelector: selector => selector.includes('fill') ? fill : meta };
  });
  const ctx = context({
    API_BASE_URL: 'https://example.test', CSS: { escape: String },
    window: { requestAnimationFrame: callback => callback() },
    app: { querySelectorAll: () => roots },
    fetch: async (url,options) => { requests.push(url); assert.equal(options.cache,'no-store'); return { ok: true, json: async () => ({ stats,displayProgress:{percent:63.6,source:'mixed',inventory_total:1000} }) }; },
  });
  await ctx.refreshFeaturedRaffleAdvance({ activeRaffles: [raffle(80), { campaign: { id: 2 } }] }, 'test');
  assert.equal(requests.length, 2);
  assert.match(requests[0], /\/raffles\/1\/availability\?summary=1$/);
  for (const root of roots) {
    assert.equal(root.fill.style.width, '63.6%');
    assert.equal(root.meta.textContent, '63.6% de avance');
  }
});

test('mixed fallback follows new sales and respects the manual starting point',()=>{
  const ctx=context();const input=raffle(60);
  input.publicConfig.manualProgressBaselinePercent=10;
  assert.equal(ctx.getRaffleAdvanceStats(input).percent,65);
  input.publicConfig.manualProgressPercent=40;
  assert.equal(ctx.getRaffleAdvanceStats(input).percent,45);
});

test('stale or failed refresh preserves the visible progress',async()=>{
  const fill={style:{width:'60.1%'}},meta={textContent:'60.1% de avance'};
  const ctx=context({API_BASE_URL:'https://example.test',CSS:{escape:String},
    app:{querySelectorAll:()=>[{querySelector:selector=>selector.includes('fill')?fill:meta}]},
    fetch:async()=>({ok:true,json:async()=>({displayProgress:{percent:63.6,source:'mixed',inventory_total:1000}})}),
  });
  await ctx.refreshFeaturedRaffleAdvance({activeRaffles:[raffle(60.1)]},'test',{isCurrent:()=>false});
  assert.equal(fill.style.width,'60.1%');
  ctx.fetch=async()=>{throw Error('network');};
  await ctx.refreshFeaturedRaffleAdvance({activeRaffles:[raffle(60.1)]},'test');
  assert.equal(meta.textContent,'60.1% de avance');
});

test('refresh loop has one timer, pauses hidden tabs and ignores stopped in-flight requests',async()=>{
  const timers=new Map();let seq=0;let requests=0;let complete;
  const ctx=vm.createContext({document:{hidden:false},window:{
    clearTimeout:id=>timers.delete(id),setTimeout:(fn,ms)=>{assert.equal(ms,30000);timers.set(++seq,fn);return seq;},
  },refreshFeaturedRaffleAdvance:async(_site,_slug,options)=>{
    requests++;await new Promise(resolve=>complete=resolve);return options.isCurrent();
  }});
  vm.runInContext('let raffleAdvanceTimer=null; let raffleAdvanceGeneration=0;',ctx);
  for(const name of ['stopRaffleAdvanceRefresh','startRaffleAdvanceRefresh'])vm.runInContext(source.match(new RegExp('function '+name+'\\([^]*?\\n}'))[0],ctx);
  ctx.startRaffleAdvanceRefresh({},'test');assert.equal(requests,1);
  complete();await new Promise(setImmediate);assert.equal(timers.size,1);
  ctx.document.hidden=true;
  const tick=timers.values().next().value;timers.clear();await tick();
  assert.equal(requests,1);assert.equal(timers.size,1);
  ctx.document.hidden=false;
  ctx.startRaffleAdvanceRefresh({},'test');assert.equal(timers.size,0);assert.equal(requests,2);
  ctx.stopRaffleAdvanceRefresh();complete();await new Promise(setImmediate);
  assert.equal(timers.size,0);
});
