import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function setup() {
  let resolve, reject;
  const availability = new Promise((yes, no) => { resolve = yes; reject = no; });
  const raffle = { campaign: {id:7}, publicConfig: {showQuickPackages:true} };
  const state = {requestId:0,selected:[]};
  const calls = {paint:0,refresh:0};
  const ctx = vm.createContext({
    window:{__PUBLIC_SITE_STATE__:{slug:"test",site:{activeRaffles:[raffle]}}},
    document:{querySelector:()=>null,activeElement:null},
    paymentModalState:state,raffleSelectorState:{open:false},publicQuickAvailability:new Map(),
    RAFFLE_SELECTOR_LIMIT:100,asArray:x=>Array.isArray(x)?x:[],
    getQuickPackageOptions:()=>[{quantity:2,value:1500}],shouldShowQuickPackages:r=>r.publicConfig.showQuickPackages,
    getRaffleSelectorAutoConfig:()=>({}),getRaffleSelectorCombinationSize:()=>1,
    formatTicketSelectionLabel:x=>x.number,
    getPaymentModalSelectionTotal:r=>r.quickPackage?.value || 1000,
    getCurrentRaffleSelection:()=>["99"],loadQuickPackageAvailability:()=>availability,
    getPaymentModalContactPayload:()=>({customer_name:state.customerName,customer_city:state.customerCity,customer_phone:state.customerPhone}),
    paintPaymentModal:()=>calls.paint++,syncPaymentModal:()=>{},refreshPaymentModalActionState:()=>calls.refresh++,
    submitPublicPaymentStateNotice:message=>{state.notice=message;},
  });
  for (const name of ["getRafflePricingStrategy","openQuickPackagePayment","prepareQuickPackageNumbers","awaitPackageBeforePayment","openPaymentModal","closePaymentModal"]) {
    vm.runInContext(source.match(new RegExp("(?:async )?function " + name + "\\([^]*?\\n}"))[0],ctx);
  }
  return {ctx,state,calls,resolve,reject,raffle};
}

test("abre pagos sin esperar números ni bloquear el formulario; no repinta los datos al terminar", async () => {
  const {ctx,state,calls,resolve}=setup();
  const preparation=ctx.openQuickPackagePayment(7,2);
  assert.equal(state.open,true);assert.equal(state.preparingPackage,true);assert.equal(state.loading,false);
  assert.equal(state.selected.length,0);assert.equal(state.amount,1500);
  state.customerName="Cliente";state.customerCity="Ciudad";state.customerPhone="3001234567";
  const paints=calls.paint;
  resolve({numbers:[{number:"01"},{number:"02"},{number:"03"}]});
  assert.equal(await preparation,true);
  assert.equal(state.selected.length,2);assert.equal(new Set(state.selected).size,2);
  assert.equal(state.customerName,"Cliente");assert.equal(calls.paint,paints);
  assert.equal(state.preparingPackage,false);
});

test("comprobante anticipado espera disponibilidad y bloquea envíos duplicados", async () => {
  const {ctx,state,resolve}=setup();
  const preparation=ctx.openQuickPackagePayment(7,2);
  const confirmation=ctx.awaitPackageBeforePayment();
  assert.equal(state.loading,true);
  assert.equal(await ctx.awaitPackageBeforePayment(),false);
  resolve({numbers:[{number:"01"},{number:"02"}]});
  await preparation;
  assert.equal(await confirmation,true);assert.equal(state.loading,false);
});

test("sin inventario suficiente no permite confirmar y conserva los datos para reintentar", async () => {
  const {ctx,state,calls,resolve}=setup();
  const preparation=ctx.openQuickPackagePayment(7,2);
  state.customerName="Cliente";
  const confirmation=ctx.awaitPackageBeforePayment();
  resolve({numbers:[{number:"01"},{number:"01"}]});
  assert.equal(await preparation,false);assert.equal(await confirmation,false);
  assert.equal(state.loading,false);assert.equal(state.selected.length,0);
  assert.equal(state.customerName,"Cliente");assert.ok(state.error);assert.ok(calls.paint>=2);
});

test("cerrar el modal cancela la continuación de un comprobante pendiente", async () => {
  const {ctx,state,resolve}=setup();
  const preparation=ctx.openQuickPackagePayment(7,2);
  const confirmation=ctx.awaitPackageBeforePayment();
  ctx.closePaymentModal();
  resolve({numbers:[{number:"01"},{number:"02"}]});
  await preparation;
  assert.equal(await confirmation,false);assert.equal(state.open,false);assert.equal(state.selected.length,0);
});

test("errores de red permiten reintento y la compra manual no espera esta consulta", async () => {
  const {ctx,state,reject}=setup();
  assert.equal(await ctx.awaitPackageBeforePayment(),true);
  const preparation=ctx.openQuickPackagePayment(7,2);
  reject(Error("Sin conexión"));
  assert.equal(await preparation,false);assert.equal(state.loading,false);assert.equal(state.preparingPackage,false);
  assert.equal(state.selected.length,0);assert.equal(state.error,"Sin conexión");
});
