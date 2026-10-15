import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function render(site = { company: { nombre: "Empresa de prueba" } }) {
  const ctx = vm.createContext({ ASSETS: { brand: "/marca.svg" } });
  for (const name of ["escapeHtml", "escapeAttr", "renderPublicChatWidget"]) {
    const match = source.match(new RegExp("function " + name + "\\([^]*?\\n}"));
    assert.ok(match, `Production function ${name} is present`);
    vm.runInContext(match[0], ctx);
  }
  return ctx.renderPublicChatWidget(site, "sorteo-prueba");
}

function launcher(html) {
  const match = html.match(/(<button\b[^>]*class="public-chat-launcher"[^>]*>)([^]*?)<\/button>/);
  assert.ok(match, "The existing launcher remains a native button");
  return { opening: match[1], body: match[2] };
}

test("el lanzador muestra solo burbuja gráfica y mantiene nombre accesible y enlace al panel", () => {
  const html = render();
  const { opening, body } = launcher(html);
  assert.match(opening, /type="button"/);
  assert.match(opening, /data-action="toggle-public-chat"/);
  assert.match(opening, /aria-expanded="false"/);
  assert.match(opening, /aria-label="Abrir chat de atención"/);
  assert.match(opening, /title="[^"]+"/);
  assert.match(opening, /aria-controls="public-chat-panel"/);
  assert.match(html, /<section\b[^>]*id="public-chat-panel"[^>]*>/);
  assert.doesNotMatch(body, /Necesita ayuda/i);
  assert.equal(body.replace(/<[^>]*>/g, "").trim(), "", "The launcher has no visible text label");
});

test("la burbuja SVG decorativa conserva tres puntos y el pulso no entra en el nombre accesible", () => {
  const { body } = launcher(render());
  assert.match(body, /<svg\b[^>]*viewBox="0 0 64 64"[^>]*aria-hidden="true"[^>]*>/);
  assert.match(body, /<path\b/);
  assert.equal((body.match(/<circle\b/g) || []).length, 3);
  assert.match(body, /<span\b[^>]*class="public-chat-launcher-pulse"[^>]*aria-hidden="true"[^>]*><\/span>/);
});

test("el panel, cierre y formularios de atención mantienen sus controles sin abrir el chat al renderizar", () => {
  const html = render();
  assert.match(html, /<section\b[^>]*data-public-chat-panel[^>]*\bhidden\b[^>]*aria-label="Chat de Empresa de prueba"/);
  assert.match(html, /<button\b[^>]*data-action="close-public-chat"[^>]*aria-label="Cerrar chat"/);
  assert.match(html, /data-public-chat-messages aria-live="polite"/);
  assert.match(html, /<form\b[^>]*data-public-chat-onboarding>/);
  assert.match(html, /<input\b[^>]*name="name"/);
  assert.match(html, /<input\b[^>]*name="phone"/);
  assert.match(html, /<form\b[^>]*data-public-chat-composer hidden>/);
  assert.match(html, /<textarea\b[^>]*name="message"/);
  assert.match(html, /aria-label="Enviar mensaje"/);
});
