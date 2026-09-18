const corporateConfig = window.__HIDRA_SUITE_CONFIG__ || {};
const corporateApp = document.getElementById("app");
const apiBaseUrl = String(corporateConfig.apiBaseUrl || window.HIDRA_API_BASE_URL || "").replace(/\/+$/, "") || "https://hidrasystems-backend.onrender.com";
const siteSlug = String(corporateConfig.slug || "hidra-suite").trim();

const starterSections = [
  {
    sectionType: "suite_problems",
    title: "Entendemos cómo funciona realmente tu empresa.",
    subtitle: "Antes de proponer tecnología, conocemos cómo vendes, atiendes, cobras, registras información y dónde tu equipo pierde tiempo.",
    config: { items: [
      { title: "Información dispersa", text: "WhatsApp, Excel, pagos, clientes y registros que no conversan entre sí." },
      { title: "Trabajo repetitivo", text: "Tareas manuales que consumen tiempo, generan errores y retrasan la atención." },
      { title: "Procesos que dependen de personas", text: "Operaciones sin visibilidad ni continuidad cuando falta quien conoce el paso a paso." },
    ] },
  },
  {
    sectionType: "suite_capabilities",
    title: "Tecnología que se adapta a tu negocio.",
    subtitle: "No entregamos el mismo software a todos. Construimos o configuramos la solución alrededor de tu proceso y tus prioridades.",
    config: { items: [
      { title: "Adaptar antes que imponer", text: "Partimos de la realidad de tu empresa, no de una plantilla que te obligue a cambiar cómo trabajas." },
      { title: "Automatizar con propósito", text: "Automatizamos lo que ahorra tiempo, reduce errores, mejora la atención y permite crecer." },
      { title: "Conectar lo que está separado", text: "WhatsApp, web, pagos, clientes, registros y reportes pueden operar como un solo ecosistema." },
      { title: "Potenciar a las personas", text: "Quitamos trabajo repetitivo para que el equipo se enfoque en decisiones, clientes y crecimiento." },
    ] },
  },
  {
    sectionType: "suite_methodology",
    title: "Conecta. Automatiza. Evoluciona.",
    subtitle: "Una forma práctica de transformar la operación sin perder de vista a las personas ni a los procesos que hacen único a tu negocio.",
    config: { items: [
      { number: "01", title: "Conecta", text: "Unimos lo que hoy está disperso para que la información fluya donde se necesita." },
      { number: "02", title: "Automatiza", text: "Liberamos al equipo de tareas repetitivas que no requieren hacerse manualmente." },
      { number: "03", title: "Evoluciona", text: "Mejoramos la forma de operar con datos, acompañamiento y soluciones que pueden crecer contigo." },
    ] },
  },
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeWhatsApp(value = "") {
  return String(value).replace(/\D/g, "");
}

function buildWhatsAppUrl(number, message) {
  const normalized = sanitizeWhatsApp(number);
  if (!normalized) return "#diagnostico";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function sectionItems(section) {
  const config = section?.config && typeof section.config === "object" ? section.config : {};
  return asArray(config.items);
}

function getCorporateSections(site) {
  const sections = asArray(site?.sections).filter((section) => /^(suite|corporate)_/i.test(String(section?.sectionType || "")));
  return sections.length ? sections.sort((a, b) => Number(a.position || 0) - Number(b.position || 0)) : starterSections;
}

function renderCards(section) {
  const isMethodology = /methodology|process/i.test(String(section.sectionType || ""));
  const items = sectionItems(section);
  if (!items.length) return "";
  return `<div class="corporate-cards ${isMethodology ? "is-steps" : ""}">
    ${items.map((item, index) => `
      <article class="corporate-card">
        ${isMethodology ? `<span class="step-number">${escapeHtml(item.number || `0${index + 1}`)}</span>` : `<span class="card-spark">✦</span>`}
        <h3>${escapeHtml(item.title || "Capacidad HIDRA SUITE")}</h3>
        <p>${escapeHtml(item.text || item.description || "")}</p>
      </article>`).join("")}
  </div>`;
}

function renderSection(section) {
  const type = String(section.sectionType || "").toLowerCase();
  const isCases = /case|result/.test(type);
  const items = sectionItems(section);
  const cards = items.length ? renderCards(section) : "";
  return `<section class="corporate-section ${isCases ? "is-case-section" : ""}">
    <div class="section-heading">
      <p class="eyebrow">${isCases ? "Resultados" : "HIDRA SUITE"}</p>
      <h2>${escapeHtml(section.title || "Una solución conectada a tu operación.")}</h2>
      ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
    </div>
    ${cards || `<div class="corporate-note">Este bloque está listo para que lo completes desde Casa Matriz.</div>`}
  </section>`;
}

function renderFaq(items) {
  if (!items.length) return "";
  return `<section class="corporate-section faq-section" id="preguntas"><div class="section-heading"><p class="eyebrow">Preguntas frecuentes</p><h2>Conversemos con claridad.</h2></div><div class="faq-list">
    ${items.map((item) => `<details><summary>${escapeHtml(item.question || item.pregunta || "Pregunta")}</summary><p>${escapeHtml(item.answer || item.respuesta || "")}</p></details>`).join("")}
  </div></section>`;
}

function renderSite(site = {}) {
  const settings = site.settings || {};
  const company = site.company || {};
  // La raíz pertenece a Casa Matriz: la marca institucional es HIDRA SAS.
  // El nombre legal de la empresa puede ser más extenso y no debe sustituirla en la vitrina comercial.
  const corporateName = "HIDRA SAS";
  const suiteName = "HIDRA SUITE";
  const configuredHeroTitle = settings.heroTitle || settings.hero_title || "";
  const configuredHeroSubtitle = settings.heroSubtitle || settings.hero_subtitle || "";
  const legacyTicketsCopy = /ticket|sorteo|boleta/i.test(`${configuredHeroTitle} ${configuredHeroSubtitle}`);
  const heroTitle = !legacyTicketsCopy && configuredHeroTitle ? configuredHeroTitle : "La tecnología debe adaptarse al negocio, no el negocio a la tecnología.";
  const heroSubtitle = !legacyTicketsCopy && configuredHeroSubtitle ? configuredHeroSubtitle : "HIDRA SUITE entiende cómo vendes, atiendes, cobras y operas para conectar tus procesos, automatizar lo repetitivo y ayudarte a crecer.";
  const whatsappUrl = buildWhatsAppUrl(settings.whatsappNumber || settings.whatsapp_number, "Hola, quiero conocer cómo HIDRA SUITE puede ayudar a mi empresa.");
  const primaryCta = settings.heroButtonLabel || settings.hero_button_label || "Solicitar diagnóstico";
  const primaryUrl = settings.heroButtonUrl || settings.hero_button_url || whatsappUrl;
  const logo = "/hidra-sas-logo.png";
  const heroImage = settings.heroImageUrl || settings.hero_image_url || "";
  const sections = getCorporateSections(site);
  const faq = asArray(site.faq);

  document.title = `${corporateName} | ${suiteName}`;
  corporateApp.innerHTML = `
    <div class="corporate-page" style="--brand:${escapeHtml(settings.primaryColor || settings.primary_color || "#0a3158")}; --accent:${escapeHtml(settings.secondaryColor || settings.secondary_color || "#28c79a")}">
      <header class="corporate-header"><div class="corporate-shell nav-wrap">
        <a class="brand" href="#inicio"><img src="${escapeHtml(logo)}" alt="${escapeHtml(corporateName)}" /><span>${escapeHtml(corporateName)}</span></a>
        <nav aria-label="Navegación principal"><a href="#soluciones">Soluciones</a><a href="#como-trabajamos">Cómo trabajamos</a><a href="#contacto">Contacto</a></nav>
        <a class="nav-cta" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">Hablemos</a>
      </div></header>
      <main>
        <section class="hero" id="inicio"><div class="corporate-shell hero-grid">
          <div class="hero-copy"><p class="eyebrow">${escapeHtml(corporateName)} PRESENTA · ${escapeHtml(suiteName)}</p><h1>${escapeHtml(heroTitle)}</h1><p class="hero-text">${escapeHtml(heroSubtitle)}</p>
          <div class="hero-actions"><a class="button-primary" href="${escapeHtml(primaryUrl)}" ${String(primaryUrl).startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(primaryCta)} <span>→</span></a><a class="button-secondary" href="#soluciones">Conocer capacidades</a></div>
          <p class="hero-note">Diagnóstico inicial para entender tu operación antes de proponer una solución.</p></div>
          <div class="hero-visual">${heroImage ? `<img src="${escapeHtml(heroImage)}" alt="Equipo y operación HIDRA SUITE" />` : `<div class="visual-placeholder"><span>HIDRA</span><strong>Procesos conectados.<br/>Decisiones claras.</strong><i></i><i></i><i></i></div>`}</div>
        </div></section>
        <section class="trust-band"><div class="corporate-shell"><p>Conecta lo que hoy está disperso. Automatiza lo que no necesita hacerse manualmente. Evoluciona la manera en que funciona tu negocio.</p></div></section>
        <div id="soluciones">${sections.map(renderSection).join("")}</div>
        <section class="diagnostic-cta" id="contacto"><div class="corporate-shell diagnostic-inner"><div><p class="eyebrow">EMPECEMOS POR TU OPERACIÓN</p><h2>Cuéntanos cómo funciona hoy tu empresa.</h2><p>Analizamos el contexto, identificamos oportunidades y preparamos una propuesta que se adapte a tu negocio.</p></div><div><a class="button-light" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">Solicitar diagnóstico por WhatsApp <span>→</span></a><small>Un asesor de HIDRA SAS continuará contigo por este canal.</small></div></div></section>
        ${renderFaq(faq)}
      </main>
      <footer><div class="corporate-shell footer-inner"><div><strong>${escapeHtml(corporateName)}</strong><p>${escapeHtml(settings.slogan || `${suiteName}: tecnología que se adapta a tu negocio.`)}</p></div><a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">WhatsApp comercial</a></div></footer>
    </div>`;
}

async function loadCorporateSite() {
  renderSite({});
  try {
    const response = await fetch(`${apiBaseUrl}/public-site/${encodeURIComponent(siteSlug)}`, { cache: "no-store" });
    if (!response.ok) return;
    const site = await response.json();
    if (site && typeof site === "object") renderSite(site);
  } catch {
    // La versión comercial base se mantiene disponible incluso si el backend inicia lentamente.
  }
}

loadCorporateSite();
