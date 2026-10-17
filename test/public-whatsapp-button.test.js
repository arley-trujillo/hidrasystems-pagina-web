import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
for (const name of ['escapeHtml', 'escapeAttr', 'whatsappLink', 'getRaffleDisplayWhatsApp', 'socialIconMarkup', 'renderPublicWhatsAppButton']) {
  vm.runInContext(source.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0], ctx);
}

test('floating button opens the configured WhatsApp directly, with no web-chat action', () => {
  const html = ctx.renderPublicWhatsAppButton({ settings: { whatsappNumber: '+57 300 000 0001' }, company: { whatsapp_number: '573000000002' } });
  assert.match(html, /<a class="public-whatsapp-launcher" href="https:\/\/wa.me\/573000000001"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /aria-label="Contactar por WhatsApp"/);
  assert.match(html, /<svg[^>]+aria-hidden="true"/);
  assert.doesNotMatch(html, /<form|<input|data-action|data-public-chat-panel/);
});

test('uses company fallback, never invents a phone or displays a broken link', () => {
  assert.match(ctx.renderPublicWhatsAppButton({ company: { whatsapp_number: '573000000002' } }), /wa.me\/573000000002/);
  for (const site of [{}, { settings: { whatsappNumber: '' } }, { settings: { whatsappNumber: 'not configured' } }]) {
    assert.equal(ctx.renderPublicWhatsAppButton(site), '');
  }
});

test('public shell renders WhatsApp instead of the web chat panel and launcher', () => {
  const shell = source.match(/function renderShell\([^]*?\n}/)[0];
  assert.match(shell, /\$\{renderPublicWhatsAppButton\(site\)\}/);
  assert.doesNotMatch(shell, /renderPublicChatWidget\(/);
});
