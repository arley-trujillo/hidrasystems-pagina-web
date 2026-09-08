const CONFIG = window.__PUBLIC_SITE_CONFIG__ || {};
function resolvePublicApiBaseUrl() {
  const configured = String(CONFIG.apiBaseUrl || "").trim().replace(/\/+$/, "");
  if (configured && configured !== "__API_BASE_URL__") {
    return configured;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:10000";
  }

  return "https://luis-d038.onrender.com";
}

const API_BASE_URL = resolvePublicApiBaseUrl();
const app = document.getElementById("app");
const PUBLIC_SITE_FETCH_ATTEMPTS = 3;
const PUBLIC_SITE_RETRY_DELAYS_MS = [0, 700, 1500];

function waitForPublicSiteRetry(delayMs) {
  return delayMs > 0
    ? new Promise((resolve) => window.setTimeout(resolve, delayMs))
    : Promise.resolve();
}

async function fetchPublicSitePayload(slug) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw new Error("No se especifico el sitio publico.");
  }

  let lastError = null;
  for (let attempt = 0; attempt < PUBLIC_SITE_FETCH_ATTEMPTS; attempt += 1) {
    await waitForPublicSiteRetry(PUBLIC_SITE_RETRY_DELAYS_MS[attempt] || 0);

    try {
      const retryQuery = attempt > 0 ? `?retry=${attempt}` : "";
      const response = await fetch(
        `${API_BASE_URL}/public-site/${encodeURIComponent(normalizedSlug)}${retryQuery}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const error = new Error(`No se encontro el sitio para /${normalizedSlug}`);
        error.responseStatus = response.status;
        throw error;
      }

      const site = await response.json();
      return site && typeof site === "object" ? site : null;
    } catch (error) {
      lastError = error;
      const status = Number(error?.responseStatus || 0);
      const retryable = !status || status >= 500;
      if (!retryable || attempt === PUBLIC_SITE_FETCH_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No fue posible cargar el sitio publico.");
}

const PUBLIC_SITE_MODE = (() => {
  const configured = String((window.__PUBLIC_SITE_CONFIG__ || {}).mode || "").trim().toLowerCase();
  if (configured === "retail" || configured === "raffles") {
    return configured;
  }

  const pathname = String(window.location.pathname || "").toLowerCase();
  if (pathname.startsWith("/negocio/") || pathname === "/negocio" || pathname.startsWith("/retail/")) {
    return "retail";
  }

  return "raffles";
})();
const PUBLIC_SITE_CACHE_PREFIX = "public-site-cache:v1:";
const RAFFLE_SELECTOR_SEARCH_DELAY_MS = 1500;
const ASSETS = {
  brand: "/assets/logo-placeholder.webp",
  hero: "/assets/hero-caballo.webp",
  raffle: "/assets/raffle-card.webp",
  winner: "/assets/winner-video.webp",
  payments: "/assets/payment-methods.webp",
  pse: "/assets/pse-logo.svg",
};
const RAFFLE_SELECTOR_LIMIT = 100;
const RAFFLE_SELECTOR_PAGE_SIZE = 100;
const raffleSelectorState = {
  open: false,
  site: null,
  slug: "",
  raffle: null,
  query: "",
  page: 1,
  selected: [],
  numbers: [],
  stats: null,
  pagination: null,
  loading: false,
  error: "",
  notice: "",
  noticeTone: "info",
  updatedAt: "",
  requestId: 0,
  pollTimer: null,
  queryTimer: null,
};

const paymentModalState = {
  open: false,
  site: null,
  slug: "",
  raffle: null,
  selected: [],
  amount: 0,
  customerName: "",
  customerCity: "",
  customerPhone: "",
  file: null,
  fileName: "",
  checkoutUrl: "",
  loading: false,
  error: "",
  notice: "",
  noticeTone: "info",
  requestId: 0,
};

const receiptUploadState = {
  open: false,
  title: "Subiendo comprobante",
  description: "Espera un momento mientras verificamos tu pago.",
  detail: "No cierres esta ventana hasta que termine el proceso.",
  tone: "info",
  requestId: 0,
};

const deliveryModalState = {
  open: false,
  loading: false,
  site: null,
  slug: "",
  raffle: null,
  paymentReference: "",
  customerPhone: "",
  assets: [],
  whatsappUrl: "",
  expanded: false,
  downloadRequested: false,
  error: "",
  notice: "",
  noticeTone: "info",
  requestId: 0,
};

const raffleResultsModalState = {
  open: false,
  loading: false,
  error: "",
  results: [],
  selectedSeriesId: "",
  selectedDrawId: "",
  requestId: 0,
  confettiTimer: null,
};

const publicUiState = {
  mobileMenuOpen: false,
};

const publicChatState = {
  slug: "",
  site: null,
  token: "",
  open: false,
  loading: false,
  deliveryLoading: false,
  customerName: "",
  customerPhone: "",
  purchases: [],
  purchase: {
    open: false,
    raffleId: "",
    numbers: [],
    selected: [],
    city: "",
    file: null,
    previewUrl: "",
    loadingNumbers: false,
    submitting: false,
    notice: "",
    noticeTone: "info",
  },
  pollTimer: null,
};

window.addEventListener("pagehide", () => {
  window.clearInterval(publicChatState.pollTimer);
  publicChatState.pollTimer = null;
  publicChatState.token = "";
  publicChatState.customerName = "";
  publicChatState.customerPhone = "";
  publicChatState.purchases = [];
});

const retailUiState = {
  slug: "",
  imageIndexByProductId: {},
  searchQuery: "",
  selectedCategorySlug: "",
  shellRenderTimer: null,
};

const retailCartState = {
  slug: "",
  itemsByKey: {},
};

const retailCheckoutState = {
  open: false,
  openReceipt: false,
  loading: false,
  order: null,
  paymentMethod: "PSE",
  deliveryMode: "pickup",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  customerAddress: "",
  customerCity: "",
  note: "",
  receiptFile: null,
  receiptFileName: "",
  notice: "",
  noticeTone: "info",
};

window.__PUBLIC_RETAIL_MODAL__ = window.__PUBLIC_RETAIL_MODAL__ || null;
window.__PUBLIC_RETAIL_CART__ = window.__PUBLIC_RETAIL_CART__ || null;
window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ = window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ || false;

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-CO");

function formatCOP(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : currencyFormatter.format(0);
}

function socialIconMarkup(type) {
  const icons = {
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8.5V7c0-.7.5-1.2 1.2-1.2h1.8V3h-2.5C12.3 3 11 4.4 11 6.3v2.2H8.5V11H11v10h3v-10h2.6l.4-2.5H14Z" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10A3.5 3.5 0 0 1 20.5 7v10A3.5 3.5 0 0 1 17 20.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5Zm0 2A1.5 1.5 0 0 0 5.5 7v10A1.5 1.5 0 0 0 7 18.5h10a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 17 5.5H7Zm5 2.2A4.3 4.3 0 1 1 7.7 12 4.3 4.3 0 0 1 12 7.7Zm0 2A2.3 2.3 0 1 0 14.3 12 2.3 2.3 0 0 0 12 9.7Zm4.7-3.2a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" fill="currentColor"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3.5c.8 2.5 2.4 3.7 4.5 3.9V11c-1.7 0-3.3-.5-4.5-1.4V16a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v3.3a2.2 2.2 0 1 0 1.6 2.1V3.5h3Z" fill="currentColor"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 7.3a3 3 0 0 0-2.1-2.1C17.7 4.7 12 4.7 12 4.7s-5.7 0-7.5.5a3 3 0 0 0-2.1 2.1A31.3 31.3 0 0 0 2 12a31.3 31.3 0 0 0 .4 4.7 3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 22 12a31.3 31.3 0 0 0-.4-4.7ZM10 15.2V8.8l5.6 3.2L10 15.2Z" fill="currentColor"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 3.8A10.6 10.6 0 0 0 2.3 15.7L1 22l6.4-1.7a10.6 10.6 0 0 0 5.1 1.3h0A10.6 10.6 0 0 0 20.2 3.8Zm-8 16.5h0a8.8 8.8 0 0 1-4.5-1.2l-.3-.2-3.8 1 1-3.7-.2-.4a8.8 8.8 0 1 1 7.8 4.5Zm5-6.5c-.3-.2-1.7-.9-1.9-1s-.3-.2-.4.2-.7 1-1 1.2-.4.2-.7 0a7.2 7.2 0 0 1-2.1-1.3 8 8 0 0 1-1.5-1.9c-.2-.4 0-.6.2-.8l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.5-1.4-.7-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.6 1.2 3 1.4 3.2c.2.2 2.1 3.2 5.1 4.4.7.3 1.2.5 1.7.7.7.2 1.3.2 1.7.1.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.4Z" fill="currentColor"/></svg>',
  };
  return icons[type] || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSlug(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)[0] || "";
}

function getSlugFromLocation() {
  const fromQuery = new URL(window.location.href).searchParams.get("slug");
  const normalizedPath = normalizeSlug(window.location.pathname);
  const fromPath = (normalizedPath === "negocio" || normalizedPath === "retail")
    ? normalizeSlug(window.location.pathname.split("/").slice(2).join("/"))
    : normalizedPath;
  return normalizeSlug(fromQuery || fromPath);
}

function pickHeroImage(site) {
  return site?.settings?.heroImageUrl || ASSETS.hero;
}

function pickHeroVideo(site) {
  return site?.settings?.heroVideoUrl || "";
}

function getRaffleDisplayTitle(raffle = {}) {
  return (
    raffle?.publicConfig?.publicTitle
    || raffle?.publicTitle
    || raffle?.campaign?.name
    || raffle?.campaign?.nombre
    || raffle?.campaign?.descripcion
    || "Sorteo"
  );
}

function getRaffleDisplayDescription(raffle = {}) {
  return (
    raffle?.publicConfig?.publicDescription
    || raffle?.publicDescription
    || raffle?.campaign?.descripcion
    || ""
  );
}

function getRaffleDisplayImage(raffle = {}, site = {}) {
  return (
    raffle?.publicConfig?.coverImageUrl
    || raffle?.coverImageUrl
    || site?.settings?.heroImageUrl
    || ASSETS.raffle
  );
}

function getRaffleDisplayPrice(raffle = {}) {
  const pricingConfig = getRafflePricingConfig(raffle);
  const raw = pricingConfig?.precioUnitario
    ?? pricingConfig?.precio_unitario
    ?? getRafflePricingPackages(raffle).find((item) => Number(item.quantity || 0) === 1)?.value
    ?? raffle?.campaign?.numberValue
    ?? raffle?.campaign?.valor_numero
    ?? raffle?.numberValue
    ?? raffle?.valor_numero;
  const numeric = Number(String(raw || "").replace(/[^\d.-]/g, "")) || 0;
  return Number.isFinite(numeric) && numeric > 0 ? currencyFormatter.format(numeric) : "";
}

function getRafflePricingConfig(raffle = {}) {
  const raw = raffle?.campaign?.pricingConfig || raffle?.campaign?.pricing_config || raffle?.pricingConfig || raffle?.pricing_config || {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

function getRafflePricingStrategy(raffle = {}) {
  return String(
    raffle?.campaign?.pricingStrategy
      || raffle?.campaign?.pricing_strategy
      || raffle?.pricingStrategy
      || raffle?.pricing_strategy
      || "",
  ).toLowerCase();
}

function getRafflePricingPackages(raffle = {}) {
  const pricingConfig = getRafflePricingConfig(raffle);
  const rawPackages = Array.isArray(pricingConfig.packages) ? pricingConfig.packages : [];

  return rawPackages
    .map((item) => {
      const quantity = Number(item?.cantidad ?? item?.quantity ?? item?.cant ?? (item?.n || 0));
      const rawValue = item?.valor ?? item?.value ?? item?.precio ?? item?.price ?? "";
      const value = Number(String(rawValue || "").replace(/[^\d.-]/g, "")) || 0;
      return quantity > 0 && value > 0 ? { quantity, value } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.quantity - b.quantity);
}

function getRafflePriceForQuantity(raffle = {}, quantity = 1) {
  const packages = getRafflePricingPackages(raffle);
  const count = Math.max(1, Number.parseInt(quantity, 10) || 1);

  const exact = packages.find((item) => item.quantity === count);
  if (exact) {
    return exact.value;
  }

  if (!packages.length) {
    const fallback = Number(
      raffle?.campaign?.numberValue
      ?? raffle?.campaign?.valor_numero
      ?? raffle?.numberValue
      ?? raffle?.valor_numero
      ?? 0,
    );
    return Number.isFinite(fallback) ? fallback * count : 0;
  }

  const sorted = [...packages].sort((a, b) => b.quantity - a.quantity);
  let remaining = count;
  let total = 0;

  for (const item of sorted) {
    if (!item.quantity) continue;
    while (remaining >= item.quantity) {
      total += item.value;
      remaining -= item.quantity;
    }
  }

  if (remaining > 0) {
    const unit = packages.find((item) => item.quantity === 1);
    total += unit ? unit.value * remaining : (packages[0]?.value || 0) * remaining;
  }

  return total;
}

function formatRafflePricingSummary(raffle = {}) {
  const packages = getRafflePricingPackages(raffle);
  if (!packages.length) {
    const price = getRaffleDisplayPrice(raffle);
    return price ? `Precio por boleta ${price}` : "";
  }

  return packages
    .map((item) => `${item.quantity} boleta${item.quantity === 1 ? "" : "s"} = ${currencyFormatter.format(item.value)}`)
    .join(" | ");
}

function getRafflePricingBadge(raffle = {}) {
  const packages = getRafflePricingPackages(raffle);
  if (packages.length > 0) {
    return "";
  }

  const price = getRaffleDisplayPrice(raffle);
  return price ? `Boleta ${price}` : "";
}

function getRaffleDisplayDate(raffle = {}) {
  const value = raffle?.campaign?.drawDate || raffle?.campaign?.fecha_sorteo || raffle?.drawDate || raffle?.fecha_sorteo;
  return value ? formatDate(value) : "";
}

function getRaffleDisplayMode(raffle = {}) {
  return String(
    raffle?.campaign?.registrationMode
      || raffle?.campaign?.ticketRegistrationMode
      || raffle?.registrationMode
      || raffle?.ticketRegistrationMode
      || "automatico",
  ).trim();
}

function getRaffleDisplayTotal(raffle = {}) {
  const raw = raffle?.campaign?.totalNumbers
    ?? raffle?.campaign?.totalNumeros
    ?? raffle?.campaign?.total_numeros
    ?? raffle?.totalNumbers
    ?? raffle?.totalNumeros
    ?? raffle?.total_numeros;
  const numeric = Number(raw || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getRaffleAdvanceStats(site = {}) {
  const stats = site?.raffleStats || site?.stats || null;
  const total = Number(stats?.inventoryTotal || stats?.inventory_total || 0);
  const sold = Number(stats?.soldCount || stats?.sold_count || 0);
  const reserved = Number(stats?.reservedCount || stats?.reserved_count || 0);
  const processed = Math.max(0, sold + reserved);
  const percent = total > 0 ? Math.min(100, Math.max(0, (processed / total) * 100)) : 0;
  const displayPercent = Math.round(percent * 10) / 10;
  return {
    total,
    sold,
    reserved,
    processed,
    percent: displayPercent,
  };
}

function formatRaffleAdvanceLabel(advance = {}) {
  if (!advance.total) {
    return "Avance del sorteo";
  }

  return `${advance.percent}% vendido`;
}

function renderRaffleAdvanceBlock(raffle = {}, options = {}) {
  const campaignId = String(raffle?.campaign?.id || "");
  const title = getRaffleDisplayTitle(raffle);
  const compact = Boolean(options.compact);
  const advance = getRaffleAdvanceStats(raffle);
  const total = advance.total || getRaffleDisplayTotal(raffle);

  return `
    <div class="raffle-progress${compact ? " raffle-progress--subtle" : ""}" data-raffle-progress data-raffle-id="${escapeHtml(campaignId)}" data-raffle-title="${escapeHtml(title)}">
      <div class="raffle-progress-track" aria-hidden="true">
        <span class="raffle-progress-fill" data-raffle-progress-fill style="width: ${advance.percent}%; min-width: ${advance.percent > 0 ? "4px" : "0"}"></span>
      </div>
      <div class="raffle-progress-meta" data-raffle-progress-meta>
        ${total ? `${escapeHtml(String(advance.percent))}% de avance` : "Cargando avance del sorteo..."}
      </div>
    </div>
  `;
}

function getRaffleDisplayWhatsApp(site = {}) {
  return site?.settings?.whatsappNumber || site?.company?.whatsapp_number || "";
}

function getFooterSocialLinks(site = {}) {
  const settings = site?.settings || {};
  const company = site?.company || {};
  const links = [
    (settings.whatsappNumber || company.whatsapp_number) ? { key: "whatsapp", label: "WhatsApp", href: whatsappLink(settings.whatsappNumber || company.whatsapp_number) } : null,
    settings.facebookUrl || settings.facebook_url ? { key: "facebook", label: "Facebook", href: settings.facebookUrl || settings.facebook_url } : null,
    settings.instagramUrl || settings.instagram_url ? { key: "instagram", label: "Instagram", href: settings.instagramUrl || settings.instagram_url } : null,
    settings.tiktokUrl || settings.tiktok_url ? { key: "tiktok", label: "TikTok", href: settings.tiktokUrl || settings.tiktok_url } : null,
    settings.youtubeUrl || settings.youtube_url ? { key: "youtube", label: "YouTube", href: settings.youtubeUrl || settings.youtube_url } : null,
  ];

  return links.filter(Boolean);
}

function normalizeTicketDisplayValue(value) {
  return String(value ?? "").trim();
}

function getRaffleSelectorAutoConfig(raffle = {}) {
  const raw = raffle?.campaign?.ticketAutoConfig || raffle?.campaign?.ticket_auto_config || {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

function getRaffleSelectorCombinationSize(raffle = {}) {
  const autoConfig = getRaffleSelectorAutoConfig(raffle);
  const configured = Number(
    autoConfig.combinationsPerTicket
    || autoConfig.combinations_per_ticket
    || 0,
  );

  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.max(configured, 1), 12)
    : 1;
}

function getRaffleSelectorSelectionSummary(raffle = {}, selected = []) {
  const normalizedSelected = asArray(selected)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const groupSize = getRaffleSelectorCombinationSize(raffle);
  const supportUploadMode = Boolean(raffle?.campaign?.ticket_auto_config?.public_support_upload);
  const totalNumbers = normalizedSelected.length;
  const completeTickets = groupSize > 0 ? Math.floor(totalNumbers / groupSize) : 0;
  const remainder = groupSize > 0 ? totalNumbers % groupSize : totalNumbers;
  const isComplete = totalNumbers > 0 && remainder === 0;
  const missingForNext = isComplete ? 0 : (groupSize - remainder);
  const total = completeTickets > 0 ? getRafflePriceForQuantity(raffle, completeTickets) : 0;

  return {
    groupSize,
    supportUploadMode,
    totalNumbers,
    completeTickets,
    remainder,
    isComplete,
    missingForNext,
    total,
  };
}

function groupRaffleSelections(selected = [], groupSize = 1) {
  const normalizedSelected = asArray(selected)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const safeGroupSize = Number.isFinite(Number(groupSize)) && Number(groupSize) > 0
    ? Math.max(1, Number(groupSize))
    : 1;
  const groups = [];

  for (let index = 0; index < normalizedSelected.length; index += safeGroupSize) {
    groups.push(normalizedSelected.slice(index, index + safeGroupSize));
  }

  return groups;
}

function getRaffleSelectorFallbackNumbers(raffle = {}) {
  const total = Number(
    raffle?.campaign?.totalNumeros
    ?? raffle?.campaign?.total_numeros
    ?? raffle?.totalNumeros
    ?? raffle?.total_numeros
    ?? 0,
  );
  const autoConfig = getRaffleSelectorAutoConfig(raffle);
  const digitsRaw = Number(autoConfig.numberDigits || autoConfig.number_digits || 0);
  const digits = Number.isFinite(digitsRaw) && digitsRaw > 0
    ? Math.min(Math.max(digitsRaw, 2), 6)
    : Math.min(Math.max(String(Math.max(total, 1)).length, 2), 6);
  const startRaw = String(autoConfig.numberStart || autoConfig.number_start || "").trim();
  const endRaw = String(autoConfig.numberEnd || autoConfig.number_end || "").trim();

  const startNumeric = startRaw ? Number.parseInt(startRaw.replace(/\D/g, ""), 10) : NaN;
  const endNumeric = endRaw ? Number.parseInt(endRaw.replace(/\D/g, ""), 10) : NaN;

  let numbers = [];
  if (Number.isFinite(startNumeric) && Number.isFinite(endNumeric) && endNumeric >= startNumeric) {
    const limit = Math.min(endNumeric - startNumeric + 1, 500);
    for (let index = 0; index < limit; index += 1) {
      const value = startNumeric + index;
      numbers.push(String(value).padStart(digits, "0"));
    }
  } else if (total > 0) {
    const limit = Math.min(total, 500);
    for (let value = 1; value <= limit; value += 1) {
      numbers.push(String(value).padStart(digits, "0"));
    }
  }

  return numbers.map((number) => ({
    id: number,
    number,
    display: number,
    numbers: [number],
    updatedAt: null,
    source: "fallback",
  }));
}

function filterRaffleSelectorNumbers(numbers = [], query = "") {
  const normalizedQuery = String(query || "").trim().replace(/\s+/g, "");
  if (!normalizedQuery) {
    return numbers;
  }

  const queryDigits = normalizedQuery.replace(/\D/g, "");
  const queryLower = normalizedQuery.toLowerCase();

  return numbers.filter((ticket) => {
    const haystacks = [
      String(ticket?.display || ""),
      String(ticket?.number || ""),
      Array.isArray(ticket?.numbers) ? ticket.numbers.join(" ") : "",
    ]
      .map((item) => String(item || "").toLowerCase())
      .filter(Boolean);

    if (haystacks.some((value) => value.includes(queryLower))) {
      return true;
    }

    if (queryDigits && haystacks.some((value) => value.includes(queryDigits))) {
      return true;
    }

    return false;
  });
}

function selectRaffleSelectorTicket(value) {
  handleRaffleSelectorTicketValue(value);
}

function removeRaffleSelectorTicket(value) {
  handleRaffleSelectorRemoveValue(value);
}

function formatTicketSelectionLabel(ticket = {}) {
  const numbers = Array.isArray(ticket.numbers)
    ? ticket.numbers.map(normalizeTicketDisplayValue).filter(Boolean)
    : [];

  if (ticket.display) {
    return String(ticket.display).trim();
  }

  if (numbers.length > 1) {
    return numbers.join(" · ");
  }

  if (ticket.number) {
    return String(ticket.number).trim();
  }

  return numbers[0] || "";
}

function buildSelectionMessage(raffle = {}, selected = []) {
  const title = getRaffleDisplayTitle(raffle);
  const numbers = selected.map((item) => String(item || "").trim()).filter(Boolean);
  return `Estas seleccionando tus números para el sorteo "${title}" llevas estos seleccionados: ${numbers.join(", ")}.`;
}

function isYoutubeUrl(url = "") {
  return /(?:youtube\.com|youtu\.be)/i.test(String(url || ""));
}

function isVimeoUrl(url = "") {
  return /vimeo\.com/i.test(String(url || ""));
}

function buildEmbeddedVideoUrl(url = "") {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";

  if (isYoutubeUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const videoId =
        parsed.hostname.includes("youtu.be")
          ? parsed.pathname.split("/").filter(Boolean)[0]
          : parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1` : "";
    } catch {
      return "";
    }
  }

  if (isVimeoUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const videoId = parsed.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?title=0&byline=0&portrait=0` : "";
    } catch {
      return "";
    }
  }

  return "";
}

function renderInlineVideo(url, title) {
  const embedded = buildEmbeddedVideoUrl(url);
  if (embedded) {
    return `<iframe class="embedded-video" src="${escapeHtml(embedded)}" title="${escapeHtml(title || "Video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  return `
    <video class="embedded-video" controls playsinline preload="metadata">
      <source src="${escapeHtml(url)}" />
      Tu navegador no soporta la reproduccion de video.
    </video>
  `;
}

function normalizePublicVideoType(value = "") {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (["social", "social_support", "apoyo_social", "apoyos_sociales", "apoyos", "support"].includes(normalized)) {
    return "social_support";
  }

  return "winner";
}

function groupPublicVideosByType(site = {}) {
  const videos = asArray(site.winnerVideos).filter((video) => video && video.isVisible !== false);
  const winner = [];
  const socialSupport = [];

  for (const video of videos) {
    const type = normalizePublicVideoType(video.videoType || video.video_type || video.type || "winner");
    if (type === "social_support") {
      socialSupport.push(video);
    } else {
      winner.push(video);
    }
  }

  return { winner, socialSupport };
}

function renderVideoCards(videos = [], kind = "winner", layout = "grid") {
  const containerClass = layout === "strip" ? "grid-3 video-strip" : "grid-3";
  return `
    <div class="${containerClass}">
      ${videos
        .map((video) => {
          const preview = video.thumbnailUrl || ASSETS.winner;
          const subtitle = kind === "social_support"
            ? (video.winnerName || "Apoyo social")
            : (video.winnerName || "Ganador verificado");
          const cardBadge = kind === "social_support" ? "Apoyo social" : "Ganador";
          return `
            <article class="card">
              <div class="card-media">
                <img src="${escapeHtml(preview)}" alt="${escapeHtml(video.title)}" loading="lazy" decoding="async" />
                ${video.videoUrl ? `
                  <button
                    type="button"
                    class="play-overlay"
                    data-video-url="${escapeAttr(video.videoUrl)}"
                    data-video-title="${escapeAttr(video.title)}"
                    data-video-subtitle="${escapeAttr(subtitle)}"
                    aria-label="Reproducir video"
                  >
                    <span class="play-overlay-badge">?</span>
                    <span class="play-overlay-text">
                      <strong>Ver video</strong>
                      <small>${escapeHtml(cardBadge)}</small>
                    </span>
                  </button>
                ` : ""}
              </div>
              <div class="card-body">
                <div class="chip-row">
                  <span class="chip">${escapeHtml(cardBadge)}</span>
                  ${video.city ? `<span class="chip">${escapeHtml(video.city)}</span>` : ""}
                  ${video.drawDate ? `<span class="chip">${escapeHtml(formatDate(video.drawDate))}</span>` : ""}
                </div>
                <h3 class="card-title">${escapeHtml(video.title)}</h3>
                <p class="card-copy">${escapeHtml(subtitle)}${video.prize ? ` · ${escapeHtml(video.prize)}` : ""}</p>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function getPublicSiteCacheKey(slug = "") {
  return `${PUBLIC_SITE_CACHE_PREFIX}${PUBLIC_SITE_MODE}:${normalizeSlug(slug)}`;
}

function readCachedPublicSite(slug = "") {
  const key = getPublicSiteCacheKey(slug);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.site) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedPublicSite(slug = "", site = null) {
  const key = getPublicSiteCacheKey(slug);
  try {
    window.localStorage.setItem(key, JSON.stringify({
      site,
      cachedAt: new Date().toISOString(),
    }));
  } catch {
    // Ignore storage errors on restricted browsers.
  }
}

window.__PUBLIC_VIDEO_MODAL__ = window.__PUBLIC_VIDEO_MODAL__ || null;

function openVideoModal(payload = {}) {
  const modal = document.getElementById("video-modal");
  const frame = document.getElementById("video-modal-frame");
  const title = document.getElementById("video-modal-title");
  const subtitle = document.getElementById("video-modal-subtitle");

  if (!modal || !frame || !title || !subtitle) {
    return;
  }

  const embedded = buildEmbeddedVideoUrl(payload.url || "");
  const source = embedded || String(payload.url || "").trim();

  title.textContent = payload.title || "Video";
  subtitle.textContent = payload.subtitle || "Ganador verificado";

  if (embedded) {
    frame.innerHTML = `<iframe class="video-modal-player" src="${escapeAttr(embedded)}" title="${escapeAttr(payload.title || "Video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else if (source) {
    frame.innerHTML = `<video class="video-modal-player" controls autoplay playsinline preload="metadata"><source src="${escapeAttr(source)}" />Tu navegador no soporta la reproduccion de video.</video>`;
  } else {
    frame.innerHTML = `<div class="video-modal-empty">No hay video disponible.</div>`;
  }

  modal.classList.add("is-open");
  document.body.classList.add("modal-open");
  window.__PUBLIC_VIDEO_MODAL__ = payload;
}

function closeVideoModal() {
  const modal = document.getElementById("video-modal");
  const frame = document.getElementById("video-modal-frame");
  if (modal) {
    modal.classList.remove("is-open");
  }
  if (frame) {
    frame.innerHTML = "";
  }
  document.body.classList.remove("modal-open");
  window.__PUBLIC_VIDEO_MODAL__ = null;
}

function maskPublicWinnerName(value = "") {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name) return "";

  const characters = Array.from(name);
  if (characters.length < 2) return "****";

  return `${characters[0]}****${characters[characters.length - 1]}`;
}

function getSelectedRaffleResult() {
  const results = asArray(raffleResultsModalState.results);
  const series = results.find((item) => String(item?.id) === String(raffleResultsModalState.selectedSeriesId)) || results[0] || null;
  const draws = asArray(series?.draws);
  const draw = draws.find((item) => String(item?.id) === String(raffleResultsModalState.selectedDrawId)) || draws[0] || null;
  return { series, draw };
}

function renderRaffleResultsModalContent() {
  if (raffleResultsModalState.loading) {
    return `<div class="raffle-results-state"><strong>Cargando resultados oficiales...</strong><span>Estamos consultando la información más reciente.</span></div>`;
  }

  if (raffleResultsModalState.error) {
    return `<div class="raffle-results-state is-error"><strong>No fue posible cargar los resultados.</strong><span>${escapeHtml(raffleResultsModalState.error)}</span></div>`;
  }

  const { series, draw } = getSelectedRaffleResult();
  if (!series) {
    return `<div class="raffle-results-state"><strong>Aún no hay resultados publicados.</strong><span>Vuelve pronto para conocer los próximos ganadores.</span></div>`;
  }

  const results = asArray(raffleResultsModalState.results);
  const draws = asArray(series.draws);
  const prizes = asArray(draw?.prizes);

  return `
    <div class="raffle-results-controls">
      <label>
        <span>Nombre del sorteo</span>
        <select data-raffle-results-series>
          ${results.map((item) => `<option value="${escapeAttr(item.id)}" ${String(item.id) === String(series.id) ? "selected" : ""}>${escapeHtml(item.title || "Sorteo")}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Fecha del sorteo</span>
        <select data-raffle-results-draw ${draws.length ? "" : "disabled"}>
          ${draws.map((item) => `<option value="${escapeAttr(item.id)}" ${String(item.id) === String(draw?.id) ? "selected" : ""}>${escapeHtml(item.drawDate ? formatDate(item.drawDate) : "Fecha sin publicar")}</option>`).join("")}
        </select>
      </label>
    </div>
    ${draw ? `
      <div class="raffle-results-draw-head">
        <div>
          <span class="section-tag">Resultados oficiales</span>
          <h4>${escapeHtml(series.title || "Sorteo")}</h4>
          ${draw.drawDate ? `<p>Fecha del sorteo: ${escapeHtml(formatDate(draw.drawDate))}</p>` : ""}
        </div>
        <span class="raffle-results-count">${prizes.length} premio${prizes.length === 1 ? "" : "s"}</span>
      </div>
      ${prizes.length ? `
        <div class="raffle-results-prizes">
          ${prizes.map((prize) => {
            return `
              <article class="raffle-result-prize-card">
                <span class="raffle-result-prize-label">Premio</span>
                <strong>${escapeHtml(prize?.prizeName || "Premio menor")}</strong>
                <div class="raffle-result-data">
                  <span>Número ganador</span>
                  <strong>${escapeHtml(prize?.winningNumber || "Pendiente de publicación")}</strong>
                </div>
                <div class="raffle-result-data">
                  <span>Ganador</span>
                  <strong class="raffle-result-winner">${escapeHtml(maskPublicWinnerName(prize?.winnerName) || "Por confirmar")}</strong>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      ` : `<div class="raffle-results-state"><strong>Esta fecha no tiene premios publicados todavía.</strong></div>`}
    ` : `<div class="raffle-results-state"><strong>Selecciona otra edición.</strong><span>No hay fechas publicadas para este sorteo.</span></div>`}
  `;
}

function syncRaffleResultsModal() {
  const modal = document.getElementById("raffle-results-modal");
  const content = document.getElementById("raffle-results-modal-content");
  if (!modal || !content) return;

  modal.classList.toggle("is-open", raffleResultsModalState.open);
  modal.setAttribute("aria-hidden", raffleResultsModalState.open ? "false" : "true");
  content.innerHTML = renderRaffleResultsModalContent();

  const anotherModalIsOpen = raffleSelectorState.open
    || paymentModalState.open
    || deliveryModalState.open
    || document.getElementById("video-modal")?.classList.contains("is-open");
  document.body.classList.toggle("modal-open", raffleResultsModalState.open || anotherModalIsOpen);
}

function renderRaffleResultsModal() {
  return `
    <div id="raffle-results-modal" class="video-modal raffle-results-modal" role="dialog" aria-modal="true" aria-hidden="true">
      <div id="raffle-results-confetti" class="raffle-results-confetti" aria-hidden="true"></div>
      <div class="video-modal-card raffle-results-modal-card" role="document">
        <button type="button" class="video-modal-close" data-action="close-raffle-results" aria-label="Cerrar resultados">×</button>
        <div class="video-modal-head">
          <div class="section-tag">Historial publicado</div>
          <h3>Resultados de sorteos</h3>
          <p>Consulta los ganadores y premios de cada fecha.</p>
        </div>
        <div id="raffle-results-modal-content" class="raffle-results-modal-content"></div>
      </div>
    </div>
  `;
}

function triggerRaffleResultsConfetti() {
  const container = document.getElementById("raffle-results-confetti");
  if (!container) return;

  if (raffleResultsModalState.confettiTimer) {
    window.clearTimeout(raffleResultsModalState.confettiTimer);
  }

  const colors = ["#fbbf24", "#fb7185", "#60a5fa", "#34d399", "#c084fc", "#f97316"];
  const pieces = window.matchMedia("(max-width: 640px)").matches ? 24 : 38;
  container.innerHTML = Array.from({ length: pieces }, (_, index) => {
    const horizontal = (index * 37 + 11) % 100;
    const delay = ((index * 29) % 180) / 1000;
    const drift = ((index * 41) % 150) - 75;
    const rotation = (index * 53) % 360;
    const color = colors[index % colors.length];
    return `<span style="--confetti-x:${horizontal}%;--confetti-delay:${delay}s;--confetti-drift:${drift}px;--confetti-rotation:${rotation}deg;--confetti-color:${color}"></span>`;
  }).join("");

  raffleResultsModalState.confettiTimer = window.setTimeout(() => {
    container.innerHTML = "";
    raffleResultsModalState.confettiTimer = null;
  }, 5400);
}

async function openRaffleResultsModal() {
  const slug = String(window.__PUBLIC_SITE_STATE__?.slug || "").trim();
  if (!slug) return;

  raffleResultsModalState.open = true;
  raffleResultsModalState.loading = true;
  raffleResultsModalState.error = "";
  raffleResultsModalState.results = [];
  raffleResultsModalState.selectedSeriesId = "";
  raffleResultsModalState.selectedDrawId = "";
  const requestId = ++raffleResultsModalState.requestId;
  syncRaffleResultsModal();
  triggerRaffleResultsConfetti();

  try {
    const response = await fetch(`${API_BASE_URL}/public-site/${encodeURIComponent(slug)}/results`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "No fue posible consultar los resultados.");
    }
    if (requestId !== raffleResultsModalState.requestId) return;

    const results = asArray(payload?.results);
    raffleResultsModalState.results = results;
    raffleResultsModalState.selectedSeriesId = String(results[0]?.id || "");
    raffleResultsModalState.selectedDrawId = String(asArray(results[0]?.draws)[0]?.id || "");
  } catch (error) {
    if (requestId !== raffleResultsModalState.requestId) return;
    raffleResultsModalState.error = error?.message || "No fue posible consultar los resultados.";
  } finally {
    if (requestId === raffleResultsModalState.requestId) {
      raffleResultsModalState.loading = false;
      syncRaffleResultsModal();
    }
  }
}

function closeRaffleResultsModal() {
  raffleResultsModalState.open = false;
  raffleResultsModalState.loading = false;
  raffleResultsModalState.requestId += 1;
  syncRaffleResultsModal();
}

function whatsappLink(number) {
  const digits = String(number || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "#";
}

function renderPublicChatWidget(site, slug) {
  const companyName = site?.company?.nombre || site?.settings?.title || "Atencion en linea";
  return `
    <div class="public-chat" data-public-chat-root>
      <section class="public-chat-panel" data-public-chat-panel hidden aria-label="Chat de ${escapeAttr(companyName)}">
        <header class="public-chat-header">
          <div class="public-chat-avatar" aria-hidden="true">
            <img src="${escapeAttr(site?.settings?.logoUrl || site?.company?.logo || ASSETS.brand)}" alt="" />
          </div>
          <div>
            <strong>${escapeHtml(companyName)}</strong>
            <span><i></i> Asistente virtual disponible</span>
          </div>
          <button type="button" class="public-chat-close" data-action="close-public-chat" aria-label="Cerrar chat">×</button>
        </header>
        <div class="public-chat-body">
          <div class="public-chat-intro">
            <span>Atencion inteligente</span>
            <p>Pregunte por sorteos, precios, reglas o deje que le guiemos para comprar.</p>
          </div>
          <div class="public-chat-messages" data-public-chat-messages aria-live="polite"></div>
          <div class="public-chat-purchases" data-public-chat-purchases hidden></div>
          <div class="public-chat-deliveries" data-public-chat-deliveries hidden></div>
          <div class="public-chat-action" data-public-chat-action hidden></div>
          <div class="public-chat-purchase" data-public-chat-purchase hidden></div>
          <div class="public-chat-notice" data-public-chat-notice hidden></div>
          <form class="public-chat-onboarding" data-public-chat-onboarding>
            <label>Nombre
              <input type="text" name="name" autocomplete="name" maxlength="90" placeholder="Su nombre" required />
            </label>
            <label>Telefono
              <input type="tel" name="phone" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="Ej. 3001234567" required />
            </label>
            <button type="submit">Iniciar conversacion</button>
            <small>Sus datos se usan para atender esta conversacion y darle seguimiento.</small>
          </form>
          <form class="public-chat-composer" data-public-chat-composer hidden>
            <textarea name="message" rows="1" maxlength="1200" placeholder="Escriba su mensaje..." required></textarea>
            <button type="submit" aria-label="Enviar mensaje">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </form>
        </div>
      </section>
      <button type="button" class="public-chat-launcher" data-action="toggle-public-chat" aria-expanded="false" aria-label="Abrir chat de atencion">
        <span class="public-chat-launcher-pulse"></span>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v7.4a2.8 2.8 0 0 1-2.8 2.8H10l-5.2 4v-4.4A2.8 2.8 0 0 1 4 13.2V5.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 8h8M8 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span>¿Necesita ayuda?</span>
      </button>
    </div>
  `;
}

function setPublicChatNotice(message = "", tone = "info") {
  const notice = app.querySelector("[data-public-chat-notice]");
  if (!notice) return;
  notice.textContent = String(message || "");
  notice.dataset.tone = tone;
  notice.hidden = !message;
}

function renderPublicChatMessages(messages = [], { forceBottom = false } = {}) {
  const root = app.querySelector("[data-public-chat-messages]");
  if (!root) return;
  const hadMessages = root.childElementCount > 0;
  const previousScrollTop = root.scrollTop;
  const previousScrollHeight = root.scrollHeight;
  const distanceFromBottom = previousScrollHeight - previousScrollTop - root.clientHeight;
  const wasNearBottom = distanceFromBottom <= 48;
  root.replaceChildren();
  messages.forEach((item) => {
    const bubble = document.createElement("div");
    bubble.className = `public-chat-message public-chat-message-${item.direction === "in" ? "customer" : "agent"}`;
    const text = document.createElement("p");
    text.textContent = String(item.message || "");
    bubble.appendChild(text);
    root.appendChild(bubble);
  });
  if (forceBottom || !hadMessages || wasNearBottom) {
    root.scrollTop = root.scrollHeight;
    return;
  }
  root.scrollTop = previousScrollTop;
}

function renderPublicChatPurchases(purchases = []) {
  publicChatState.purchases = Array.isArray(purchases) ? purchases : [];
  const root = app.querySelector("[data-public-chat-purchases]");
  if (!root) return;
  const pending = publicChatState.purchases.filter((purchase) => purchase.status !== "APROBADO");
  root.replaceChildren();
  root.hidden = !pending.length;
  pending.forEach((purchase) => {
    const card = document.createElement("article");
    card.className = `public-chat-purchase-status is-${String(purchase.status || "pending").toLowerCase()}`;
    const title = document.createElement("strong");
    title.textContent = purchase.campaignName || "Compra registrada";
    const status = document.createElement("span");
    status.textContent = purchase.status === "RECHAZADO"
      ? "Comprobante rechazado"
      : "Comprobante en revision";
    const reference = document.createElement("small");
    reference.textContent = `Referencia ${purchase.reference}`;
    card.append(title, status, reference);
    root.appendChild(card);
  });
}

function getPublicChatPurchaseRaffle() {
  return asArray(publicChatState.site?.activeRaffles)
    .find((item) => String(item?.campaign?.id || "") === String(publicChatState.purchase.raffleId || "")) || null;
}

function releasePublicChatPurchasePreview() {
  if (publicChatState.purchase.previewUrl) URL.revokeObjectURL(publicChatState.purchase.previewUrl);
  publicChatState.purchase.previewUrl = "";
}

function resetPublicChatPurchase({ keepOpen = false } = {}) {
  releasePublicChatPurchasePreview();
  publicChatState.purchase = {
    open: keepOpen,
    raffleId: String(asArray(publicChatState.site?.activeRaffles)[0]?.campaign?.id || ""),
    numbers: [],
    selected: [],
    city: "",
    file: null,
    previewUrl: "",
    loadingNumbers: false,
    submitting: false,
    notice: "",
    noticeTone: "info",
  };
}

function paintPublicChatPurchase() {
  const root = app.querySelector("[data-public-chat-purchase]");
  if (!root) return;
  const state = publicChatState.purchase;
  root.hidden = !state.open;
  if (!state.open) {
    root.replaceChildren();
    return;
  }
  const raffles = asArray(publicChatState.site?.activeRaffles);
  const raffle = getPublicChatPurchaseRaffle();
  const summary = getRaffleSelectorSelectionSummary(raffle || {}, state.selected);
  const supportUploadMode = Boolean(getRaffleSelectorAutoConfig(raffle || {}).public_support_upload);
  const contactReady = Boolean(publicChatState.customerName && publicChatState.customerPhone && state.city.trim());
  const canAttach = Boolean(raffle && summary.isComplete && contactReady && (!supportUploadMode || summary.completeTickets === 1));
  const canSubmit = canAttach && Boolean(state.file) && !state.submitting;
  root.innerHTML = `
    <div class="public-chat-purchase-head">
      <div><span>Compra en el chat</span><strong>Prepare su boleta</strong></div>
      <button type="button" data-action="close-public-chat-purchase" aria-label="Cerrar compra">×</button>
    </div>
    <form data-public-chat-purchase-form>
      <label class="public-chat-purchase-field">Sorteo
        <select name="raffle_id" ${state.submitting ? "disabled" : ""}>
          ${raffles.map((item) => `<option value="${escapeAttr(item?.campaign?.id || "")}" ${String(item?.campaign?.id) === String(state.raffleId) ? "selected" : ""}>${escapeHtml(getRaffleDisplayTitle(item))}</option>`).join("")}
        </select>
      </label>
      <div class="public-chat-number-head">
        <span>Numeros disponibles</span>
        <small>${state.loadingNumbers ? "Actualizando..." : `${state.numbers.length} opciones`}</small>
      </div>
      <div class="public-chat-number-grid">
        ${state.loadingNumbers
          ? `<div class="public-chat-purchase-empty">Consultando disponibilidad...</div>`
          : state.numbers.length
            ? state.numbers.map((number) => `<button type="button" data-action="toggle-public-chat-number" data-number="${escapeAttr(number)}" class="${state.selected.includes(number) ? "is-selected" : ""}">${escapeHtml(number)}</button>`).join("")
            : `<div class="public-chat-purchase-empty">No hay numeros cargados.</div>`}
      </div>
      <div class="public-chat-selected-summary">
        <strong>${summary.completeTickets} boleta${summary.completeTickets === 1 ? "" : "s"} · ${formatCOP(summary.total)}</strong>
        <span>${state.selected.length ? escapeHtml(state.selected.join(" · ")) : "Seleccione sus numeros"}</span>
        ${summary.isComplete ? "" : `<small>Faltan ${summary.missingForNext} numero${summary.missingForNext === 1 ? "" : "s"} para completar la boleta.</small>`}
      </div>
      <label class="public-chat-purchase-field">Nombre
        <input name="customer_name" value="${escapeAttr(publicChatState.customerName)}" readonly />
      </label>
      <label class="public-chat-purchase-field">Ciudad
        <input name="customer_city" value="${escapeAttr(state.city)}" placeholder="Su ciudad" required ${state.submitting ? "disabled" : ""} />
      </label>
      <label class="public-chat-purchase-field">Telefono
        <input name="customer_phone" value="${escapeAttr(publicChatState.customerPhone)}" readonly />
      </label>
      <input type="file" name="receipt_file" accept="image/jpeg,image/png,image/webp" data-public-chat-receipt-input hidden />
      <button type="button" class="public-chat-clip ${state.file ? "has-file" : ""}" data-action="pick-public-chat-receipt" ${canAttach && !state.submitting ? "" : "disabled"}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-8.7 8.7a5 5 0 0 1-7.1-7.1l8.6-8.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span>${state.file ? escapeHtml(state.file.name) : supportUploadMode ? "Adjuntar captura de fidelizacion" : "Adjuntar comprobante de pago"}</span>
      </button>
      ${state.previewUrl ? `<div class="public-chat-receipt-preview"><img src="${escapeAttr(state.previewUrl)}" alt="Vista previa del comprobante" /><button type="button" data-action="remove-public-chat-receipt">Cambiar imagen</button></div>` : ""}
      ${!canAttach ? `<p class="public-chat-purchase-help">Complete los numeros y la ciudad para habilitar el clip.</p>` : ""}
      ${state.notice ? `<div class="public-chat-purchase-notice is-${escapeAttr(state.noticeTone)}">${escapeHtml(state.notice)}</div>` : ""}
      <button type="submit" class="public-chat-purchase-submit" ${canSubmit ? "" : "disabled"}>${state.submitting ? "Enviando comprobante..." : "Enviar comprobante y registrar compra"}</button>
    </form>
  `;
}

async function loadPublicChatPurchaseNumbers() {
  const raffle = getPublicChatPurchaseRaffle();
  if (!raffle?.campaign?.id) return;
  publicChatState.purchase.loadingNumbers = true;
  publicChatState.purchase.notice = "";
  paintPublicChatPurchase();
  try {
    const params = new URLSearchParams({ limit: "36", page: "1" });
    const response = await fetch(`${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/raffles/${encodeURIComponent(raffle.campaign.id)}/availability?${params.toString()}`, { cache: "no-store" });
    const payload = await parsePublicChatResponse(response);
    publicChatState.purchase.numbers = asArray(payload?.numbers)
      .map((ticket) => formatTicketSelectionLabel(ticket))
      .filter(Boolean);
  } catch (error) {
    publicChatState.purchase.numbers = [];
    publicChatState.purchase.notice = error?.message || "No fue posible consultar los numeros.";
    publicChatState.purchase.noticeTone = "error";
  } finally {
    publicChatState.purchase.loadingNumbers = false;
    paintPublicChatPurchase();
  }
}

function openPublicChatPurchase() {
  resetPublicChatPurchase({ keepOpen: true });
  renderPublicChatAction(null);
  paintPublicChatPurchase();
  void loadPublicChatPurchaseNumbers();
}

async function submitPublicChatPurchase() {
  const state = publicChatState.purchase;
  const raffle = getPublicChatPurchaseRaffle();
  const summary = getRaffleSelectorSelectionSummary(raffle || {}, state.selected);
  const autoConfig = getRaffleSelectorAutoConfig(raffle || {});
  const supportUploadMode = Boolean(autoConfig.public_support_upload);
  if (!raffle?.campaign?.id || !summary.isComplete || !state.city.trim() || !state.file || state.submitting) return;
  if (supportUploadMode && summary.completeTickets !== 1) {
    state.notice = "En fidelizacion solo puede registrar una boleta por cliente.";
    state.noticeTone = "error";
    paintPublicChatPurchase();
    return;
  }
  state.submitting = true;
  state.notice = supportUploadMode ? "Enviando captura..." : "Enviando comprobante...";
  state.noticeTone = "info";
  paintPublicChatPurchase();
  try {
    const formData = new FormData();
    formData.append("selected_numbers", JSON.stringify(groupRaffleSelections(state.selected, summary.groupSize)));
    formData.append("receipt_file", state.file, state.file.name || (supportUploadMode ? "captura" : "comprobante"));
    formData.append("support_upload", supportUploadMode ? "true" : "false");
    formData.append("customer_name", publicChatState.customerName);
    formData.append("customer_city", state.city.trim());
    formData.append("customer_phone", publicChatState.customerPhone);
    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/raffles/${encodeURIComponent(raffle.campaign.id)}/receipt`,
      { method: "POST", body: formData, cache: "no-store" },
    );
    const payload = await parsePublicChatResponse(response);
    const reference = payload?.payment_reference || payload?.reference || "";
    releasePublicChatPurchasePreview();
    state.file = null;
    state.selected = [];
    state.notice = payload?.auto_approved
      ? `Compra aprobada. Referencia ${reference}. Estamos preparando su boleta.`
      : payload?.client_message || `Comprobante recibido. Referencia ${reference}. Quedo en revision.`;
    state.noticeTone = "success";
    state.open = false;
    paintPublicChatPurchase();
    setPublicChatNotice(state.notice, "success");
    await loadPublicChatMessages();
  } catch (error) {
    state.notice = error?.message || "No fue posible registrar la compra.";
    state.noticeTone = "error";
    paintPublicChatPurchase();
  } finally {
    state.submitting = false;
    if (state.open) paintPublicChatPurchase();
  }
}

function renderPublicChatDeliveries(deliveries = []) {
  const root = app.querySelector("[data-public-chat-deliveries]");
  if (!root) return;
  root.replaceChildren();
  root.hidden = !deliveries.length;
  deliveries.forEach((delivery) => {
    const card = document.createElement("article");
    card.className = "public-chat-delivery";
    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = "Boleta comprada";
    const title = document.createElement("strong");
    title.textContent = delivery.campaignName || "Su boleta esta lista";
    const reference = document.createElement("small");
    reference.textContent = `Referencia ${delivery.reference}`;
    copy.append(eyebrow, title, reference);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "download-public-chat-delivery";
    button.dataset.reference = delivery.reference || "";
    button.textContent = "Descargar boleta";
    const whatsappButton = document.createElement("button");
    whatsappButton.type = "button";
    whatsappButton.className = "is-whatsapp";
    whatsappButton.dataset.action = "receive-public-chat-delivery-whatsapp";
    whatsappButton.dataset.reference = delivery.reference || "";
    whatsappButton.textContent = "Recibir por WhatsApp";
    const actions = document.createElement("div");
    actions.className = "public-chat-delivery-actions";
    actions.append(button, whatsappButton);
    card.append(copy, actions);
    root.appendChild(card);
  });
}

async function downloadPublicChatDelivery(reference, button = null) {
  if (!publicChatState.token || !reference || publicChatState.deliveryLoading) return;
  publicChatState.deliveryLoading = true;
  const originalLabel = button?.textContent || "Descargar boleta";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparando...";
  }
  setPublicChatNotice("Generando su boleta oficial...", "info");
  try {
    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/chat/deliveries/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${publicChatState.token}` } },
    );
    const payload = await parsePublicChatResponse(response);
    const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
    if (!tickets.length) throw new Error("No encontre imagenes disponibles para esta compra.");
    tickets.forEach((ticket, index) => {
      window.setTimeout(() => {
        const anchor = document.createElement("a");
        anchor.href = ticket.dataUrl;
        anchor.download = ticket.fileName || `boleta-${index + 1}-${reference}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }, index * 250);
    });
    setPublicChatNotice(tickets.length === 1 ? "Su boleta fue descargada." : "Sus boletas fueron descargadas.", "success");
  } catch (error) {
    setPublicChatNotice(error?.message || "No fue posible descargar la boleta.", "error");
  } finally {
    publicChatState.deliveryLoading = false;
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

async function receivePublicChatDeliveryWhatsApp(reference, button = null) {
  if (!publicChatState.token || !reference || publicChatState.deliveryLoading) return;
  publicChatState.deliveryLoading = true;
  const originalLabel = button?.textContent || "Recibir por WhatsApp";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparando...";
  }
  try {
    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/chat/deliveries/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${publicChatState.token}` } },
    );
    const payload = await parsePublicChatResponse(response);
    if (!payload.whatsapp_url) throw new Error("No hay un WhatsApp configurado para esta entrega.");
    window.open(payload.whatsapp_url, "_blank", "noopener,noreferrer");
  } catch (error) {
    setPublicChatNotice(error?.message || "No fue posible preparar WhatsApp.", "error");
  } finally {
    publicChatState.deliveryLoading = false;
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

function renderPublicChatAction(action = null) {
  const root = app.querySelector("[data-public-chat-action]");
  if (!root) return;
  root.replaceChildren();
  root.hidden = true;
  if (!action?.url) return;
  if (action.type === "chat_purchase") {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "start-public-chat-purchase";
    button.textContent = action.label || "Comprar en este chat";
    root.appendChild(button);
    root.hidden = false;
    return;
  }
  const link = document.createElement("a");
  link.href = action.url;
  if (action.type === "site") {
    link.dataset.action = "close-public-chat";
  } else {
    link.target = "_blank";
    link.rel = "noreferrer";
  }
  link.textContent = action.label || "Continuar por WhatsApp";
  root.appendChild(link);
  root.hidden = false;
}

function syncPublicChatForms() {
  const onboarding = app.querySelector("[data-public-chat-onboarding]");
  const composer = app.querySelector("[data-public-chat-composer]");
  if (onboarding) onboarding.hidden = Boolean(publicChatState.token);
  if (composer) composer.hidden = !publicChatState.token;
}

async function parsePublicChatResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || "No fue posible conectar con el chat.");
  return payload;
}

async function loadPublicChatMessages() {
  if (!publicChatState.token || !publicChatState.slug || publicChatState.loading) return;
  publicChatState.loading = true;
  try {
    const response = await fetch(`${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/chat/messages`, {
      headers: { Authorization: `Bearer ${publicChatState.token}` },
    });
    const payload = await parsePublicChatResponse(response);
    publicChatState.customerName = payload?.customer?.name || publicChatState.customerName;
    publicChatState.customerPhone = payload?.customer?.phone || publicChatState.customerPhone;
    renderPublicChatMessages(payload.messages || []);
    renderPublicChatPurchases(payload.purchases || []);
    renderPublicChatDeliveries(payload.deliveries || []);
    setPublicChatNotice("");
  } catch (error) {
    if (/sesion|expir/i.test(String(error?.message || ""))) {
      publicChatState.token = "";
      syncPublicChatForms();
    }
    setPublicChatNotice(error?.message || "No fue posible actualizar el chat.", "error");
  } finally {
    publicChatState.loading = false;
  }
}

function startPublicChatPolling() {
  window.clearInterval(publicChatState.pollTimer);
  publicChatState.pollTimer = null;
  if (!publicChatState.token || !publicChatState.open) return;
  publicChatState.pollTimer = window.setInterval(() => void loadPublicChatMessages(), 5000);
}

function initializePublicChat(site, slug) {
  window.clearInterval(publicChatState.pollTimer);
  publicChatState.slug = slug;
  publicChatState.site = site;
  publicChatState.open = false;
  publicChatState.loading = false;
  publicChatState.deliveryLoading = false;
  publicChatState.customerName = "";
  publicChatState.customerPhone = "";
  resetPublicChatPurchase();
  publicChatState.token = "";
  syncPublicChatForms();
}

function isMobileDevice() {
  return (
    typeof navigator !== "undefined"
    && (
      /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "")
      || (navigator.maxTouchPoints || 0) > 1
      || window.matchMedia?.("(pointer: coarse)")?.matches
    )
  );
}

function buildWhatsAppHref(number, message) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return "#";

  const text = encodeURIComponent(String(message || ""));
  if (isMobileDevice()) {
    return `https://wa.me/${digits}?text=${text}`;
  }

  return `https://web.whatsapp.com/send?phone=${digits}&text=${text}`;
}

function scrollToPaymentSection() {
  const target = document.getElementById("pagos");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

async function fetchFreshPublicSite(slug = "") {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    return null;
  }

  try {
    const site = await fetchPublicSitePayload(normalizedSlug);
    return site && typeof site === "object" ? site : null;
  } catch {
    return null;
  }
}

function getSelectionStorageKey(raffleId) {
  const slug = raffleSelectorState.slug || window.__PUBLIC_SITE_STATE__?.slug || "public";
  return `hidra-tickets-selection:${slug}:${String(raffleId || "")}`;
}

function readPersistedSelection(raffleId) {
  try {
    const raw = window.localStorage.getItem(getSelectionStorageKey(raffleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function readDomSelectedTickets() {
  return Array.from(document.querySelectorAll("#raffle-selector-content [data-selector-ticket].is-selected"))
    .map((button) => String(button.getAttribute("data-selector-ticket") || "").trim())
    .filter(Boolean);
}

function getCurrentRaffleSelection(raffleId) {
  const inMemory = asArray(raffleSelectorState.selected)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (inMemory.length > 0) {
    return [...new Set(inMemory)];
  }

  const persisted = readPersistedSelection(raffleId);
  if (persisted.length > 0) {
    return [...new Set(persisted)];
  }

  const fromDom = readDomSelectedTickets();
  if (fromDom.length > 0) {
    return [...new Set(fromDom)];
  }

  return [];
}

function getCurrentRaffleSelectionForRender(raffleId) {
  const inMemory = asArray(raffleSelectorState.selected)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (inMemory.length > 0) {
    return [...new Set(inMemory)];
  }

  const persisted = readPersistedSelection(raffleId);
  if (persisted.length > 0) {
    return [...new Set(persisted)];
  }

  return [];
}

function persistSelection(raffleId, selected) {
  try {
    const value = JSON.stringify(asArray(selected).map((item) => String(item || "").trim()).filter(Boolean));
    window.localStorage.setItem(getSelectionStorageKey(raffleId), value);
  } catch {
    // Ignore storage failures.
  }
}

function clearPersistedSelection(raffleId) {
  try {
    window.localStorage.removeItem(getSelectionStorageKey(raffleId));
  } catch {
    // Ignore storage failures.
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date);
}

function listFromConfig(config = {}) {
  const candidates = [
    config.items,
    config.methods,
    config.channels,
    config.links,
    config.steps,
    config.points,
    config.cards,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.map((item) => {
        if (typeof item === "string") {
          return { title: item, text: "" };
        }
        return {
          title: item.title || item.label || item.name || item.text || "Item",
          text: item.text || item.description || item.subtitle || "",
          url: item.url || item.href || "",
        };
      });
    }
  }

  return [];
}

function getPaymentInstructionsText(raffle = {}, site = {}) {
  const candidates = [
    raffle?.campaign?.instrucciones_pago,
    site?.settings?.instrucciones_pago,
    raffle?.publicConfig?.instrucciones_pago,
    raffle?.instrucciones_pago,
    site?.instrucciones_pago,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function renderPaymentInstructionsPanel(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return `<div class="selector-empty selector-empty-inline">Aun no hay instrucciones de pago configuradas para este sorteo.</div>`;
  }

  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return `
    <div class="payment-instructions-panel">
      ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>
  `;
}

function sectionBody(section) {
  const config = section?.config || {};
  const text = config.text || config.content || config.body || section.subtitle || "";
  const items = listFromConfig(config);

  if (items.length === 0 && text) {
    return `<p class="card-copy">${escapeHtml(text)}</p>`;
  }

  if (items.length > 0) {
    return `
      <div class="list">
        ${items
          .map(
            (item) => `
              <div class="list-item">
                <strong>${escapeHtml(item.title)}</strong>
                ${item.text ? `<div>${escapeHtml(item.text)}</div>` : ""}
                ${item.url ? `<div style="margin-top:8px"><a class="button secondary" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Abrir enlace</a></div>` : ""}
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  return `<p class="card-copy">Esta seccion no tiene contenido definido todavia.</p>`;
}

function renderRaffles(site) {
  const raffles = asArray(site.activeRaffles);

  if (raffles.length === 0) {
    return `
      <div class="state-card">
        <h2>Sin sorteos publicados</h2>
        <p>No hay sorteos visibles en este momento.</p>
      </div>
    `;
  }

  const renderRaffleCard = ({ campaign, publicConfig }, featuredMode = false) => {
    const image = getRaffleDisplayImage({ campaign, publicConfig }, site);
    const isFeatured = featuredMode || publicConfig?.isFeatured;
    const heroTitle = getRaffleDisplayTitle({ campaign, publicConfig });
    const description = getRaffleDisplayDescription({ campaign, publicConfig });
    const drawDate = getRaffleDisplayDate({ campaign, publicConfig });
    const pricingBadge = getRafflePricingBadge({ campaign, publicConfig });
    const pricingSummary = formatRafflePricingSummary({ campaign, publicConfig });
    const mode = getRaffleDisplayMode({ campaign, publicConfig });
    const total = getRaffleDisplayTotal({ campaign, publicConfig });

    if (featuredMode) {
      return `
        <article class="raffle-feature">
          <div class="raffle-feature-media">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(heroTitle)}" loading="eager" fetchpriority="high" decoding="async" />
            <div class="raffle-feature-badge">${isFeatured ? "Sorteo destacado" : "Sorteo disponible"}</div>
          </div>
            <div class="raffle-feature-body">
              <div class="chip-row">
                ${pricingBadge ? `<span class="chip">${escapeHtml(pricingBadge)}</span>` : ""}
                ${drawDate ? `<span class="chip">${escapeHtml(drawDate)}</span>` : ""}
            </div>
            ${pricingSummary ? `
              <div class="raffle-price-label">Precio de boletería:</div>
              <p class="raffle-price-summary">${escapeHtml(pricingSummary)}</p>
            ` : ""}
            <h3 class="raffle-feature-title">${escapeHtml(heroTitle)}</h3>
            ${description ? `<p class="raffle-feature-copy">${escapeHtml(description)}</p>` : ""}
            ${renderRaffleAdvanceBlock({ campaign, publicConfig })}
            <div class="raffle-feature-actions">
              <button
                type="button"
                class="button gold js-open-raffle-selector"
                data-raffle-id="${escapeAttr(String(campaign?.id || ""))}"
              >
                Escoger mis números
              </button>
            </div>
            <div class="raffle-feature-meta">
              <span>${escapeHtml(mode)}</span>
              ${total ? `<span>${escapeHtml(String(total))} boletas</span>` : ""}
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="raffle-card raffle-card-compact">
        <div class="raffle-card-media">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(heroTitle)}" loading="lazy" decoding="async" />
          ${isFeatured ? `<div class="card-flag">Destacado</div>` : ""}
        </div>
        <div class="raffle-card-body">
          <h3 class="raffle-card-title">${escapeHtml(heroTitle)}</h3>
          ${description ? `<p class="raffle-card-copy">${escapeHtml(description)}</p>` : ""}
          <div class="chip-row">
            ${pricingBadge ? `<span class="chip">${escapeHtml(pricingBadge)}</span>` : ""}
            <span class="chip">${escapeHtml(mode)}</span>
          </div>
          ${pricingSummary ? `<p class="raffle-price-summary">${escapeHtml(pricingSummary)}</p>` : ""}
          <div class="chip-row">
            ${drawDate ? `<span class="chip">${escapeHtml(drawDate)}</span>` : ""}
            ${total ? `<span class="chip">${escapeHtml(String(total))} boletas</span>` : ""}
          </div>
          ${renderRaffleAdvanceBlock({ campaign, publicConfig }, { compact: true })}
          <div class="raffle-card-actions">
            <button
              type="button"
              class="button gold js-open-raffle-selector"
              data-raffle-id="${escapeAttr(String(campaign?.id || ""))}"
            >
              Escoger mis números
            </button>
          </div>
        </div>
      </article>
    `;
  };

  const renderRaffleCarouselCard = (raffle = {}, index = 0) => {
    const campaign = raffle?.campaign || {};
    const publicConfig = raffle?.publicConfig || {};
    const heroTitle = getRaffleDisplayTitle({ campaign, publicConfig });
    const image = getRaffleDisplayImage({ campaign, publicConfig }, site);
    const description = getRaffleDisplayDescription({ campaign, publicConfig });
    const drawDate = getRaffleDisplayDate({ campaign, publicConfig });
    const pricingBadge = getRafflePricingBadge({ campaign, publicConfig });
    const pricingSummary = formatRafflePricingSummary({ campaign, publicConfig });
    const mode = getRaffleDisplayMode({ campaign, publicConfig });
    const total = getRaffleDisplayTotal({ campaign, publicConfig });

    return `
      <article class="raffle-carousel-card">
        <div class="raffle-carousel-card-media">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(heroTitle)}" loading="${index === 0 ? "eager" : "lazy"}" fetchpriority="${index === 0 ? "high" : "auto"}" decoding="async" />
          <div class="raffle-carousel-card-badge">${index === 0 ? "Sorteo destacado" : "Sorteo activo"}</div>
        </div>
        <div class="raffle-carousel-card-body">
          <div class="chip-row">
            ${pricingBadge ? `<span class="chip">${escapeHtml(pricingBadge)}</span>` : ""}
            ${drawDate ? `<span class="chip">${escapeHtml(drawDate)}</span>` : ""}
            <span class="chip">${escapeHtml(mode)}</span>
            ${total ? `<span class="chip">${escapeHtml(String(total))} boletas</span>` : ""}
          </div>
          <h3 class="raffle-carousel-card-title">${escapeHtml(heroTitle)}</h3>
          ${description ? `<p class="raffle-carousel-card-copy">${escapeHtml(description)}</p>` : ""}
          ${pricingSummary ? `<p class="raffle-price-summary">${escapeHtml(pricingSummary)}</p>` : ""}
          ${renderRaffleAdvanceBlock({ campaign, publicConfig })}
          <div class="raffle-carousel-card-actions">
            <button
              type="button"
              class="button gold js-open-raffle-selector"
              data-raffle-id="${escapeAttr(String(campaign?.id || ""))}"
            >
              Escoger mis números
            </button>
          </div>
        </div>
      </article>
    `;
  };

  if (raffles.length === 1) {
    return `
      <div class="raffle-showcase">
        ${renderRaffleCard(raffles[0], true)}
      </div>
    `;
  }

  return `
    <div class="raffle-showcase raffle-showcase-grid">
      <div class="raffles-grid">
        ${raffles.map((raffle) => renderRaffleCard(raffle, false)).join("")}
      </div>
    </div>
  `;
}

const raffleCarouselState = {
  timer: null,
  root: null,
  count: 0,
  activeIndex: 0,
  hoverPaused: false,
  touchStartX: 0,
  touchStartY: 0,
  touchTracking: false,
};

function stopRaffleCarouselAutoplay() {
  if (raffleCarouselState.timer) {
    clearInterval(raffleCarouselState.timer);
    raffleCarouselState.timer = null;
  }
}

function getRaffleCarouselRoot() {
  return app.querySelector("[data-raffle-carousel]");
}

function bindRaffleCarouselInteractions(root) {
  if (!root || root.dataset.carouselBound === "true") {
    return;
  }

  root.dataset.carouselBound = "true";

  root.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }
    raffleCarouselState.touchStartX = touch.clientX;
    raffleCarouselState.touchStartY = touch.clientY;
    raffleCarouselState.touchTracking = true;
  }, { passive: true });

  root.addEventListener("touchend", (event) => {
    if (!raffleCarouselState.touchTracking) {
      return;
    }

    const touch = event.changedTouches?.[0];
    if (!touch) {
      raffleCarouselState.touchTracking = false;
      return;
    }

    const deltaX = touch.clientX - raffleCarouselState.touchStartX;
    const deltaY = touch.clientY - raffleCarouselState.touchStartY;
    raffleCarouselState.touchTracking = false;

    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    stepRaffleCarousel(deltaX < 0 ? 1 : -1);
  }, { passive: true });

  root.addEventListener("touchcancel", () => {
    raffleCarouselState.touchTracking = false;
  }, { passive: true });
}

function setRaffleCarouselIndex(nextIndex) {
  const root = getRaffleCarouselRoot();
  if (!root) {
    return;
  }

  const slides = Array.from(root.querySelectorAll("[data-raffle-carousel-slide]"));
  const dots = Array.from(root.querySelectorAll(".raffle-carousel-dot"));
  const total = slides.length;
  if (total < 2) {
    stopRaffleCarouselAutoplay();
    return;
  }

  const normalizedIndex = ((Number(nextIndex) || 0) % total + total) % total;
  raffleCarouselState.root = root;
  raffleCarouselState.count = total;
  raffleCarouselState.activeIndex = normalizedIndex;
  root.dataset.activeIndex = String(normalizedIndex);

  slides.forEach((slide, index) => {
    const isActive = index === normalizedIndex;
    const isPrev = index === ((normalizedIndex - 1 + total) % total);
    const isNext = index === ((normalizedIndex + 1) % total);
    slide.classList.toggle("is-active", isActive);
    slide.classList.toggle("is-prev", isPrev);
    slide.classList.toggle("is-next", isNext);
    slide.classList.toggle("is-hidden", !isActive && !isPrev && !isNext);
  });

  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === normalizedIndex);
  });
}

function stepRaffleCarousel(direction = 1) {
  const root = getRaffleCarouselRoot();
  if (!root) {
    return;
  }

  const total = Array.from(root.querySelectorAll("[data-raffle-carousel-slide]")).length;
  if (total < 2) {
    return;
  }

  const currentIndex = Number.parseInt(root.dataset.activeIndex || "0", 10) || 0;
  setRaffleCarouselIndex(currentIndex + direction);
}

function startRaffleCarouselAutoplay() {
  const root = getRaffleCarouselRoot();
  const total = Array.from(root?.querySelectorAll("[data-raffle-carousel-slide]") || []).length;
  if (!root || total < 2) {
    stopRaffleCarouselAutoplay();
    return;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    stopRaffleCarouselAutoplay();
    return;
  }

  stopRaffleCarouselAutoplay();
  raffleCarouselState.root = root;
  raffleCarouselState.count = total;
  raffleCarouselState.hoverPaused = false;
  bindRaffleCarouselInteractions(root);

  root.addEventListener("mouseenter", () => {
    raffleCarouselState.hoverPaused = true;
  });
  root.addEventListener("mouseleave", () => {
    raffleCarouselState.hoverPaused = false;
  });

  raffleCarouselState.timer = window.setInterval(() => {
    const currentRoot = getRaffleCarouselRoot();
    if (!currentRoot || raffleCarouselState.hoverPaused) {
      return;
    }
    stepRaffleCarousel(1);
  }, 11500);
}

function initRaffleCarousel() {
  const root = getRaffleCarouselRoot();
  if (!root) {
    stopRaffleCarouselAutoplay();
    return;
  }

  const total = Array.from(root.querySelectorAll("[data-raffle-carousel-slide]")).length;
  if (total < 2) {
    stopRaffleCarouselAutoplay();
    return;
  }

  setRaffleCarouselIndex(Number.parseInt(root.dataset.activeIndex || "0", 10) || 0);
  startRaffleCarouselAutoplay();
}

function renderWinnerVideos(site) {
  const { winner, socialSupport } = groupPublicVideosByType(site);

  if (winner.length === 0 && socialSupport.length === 0) {
    return `<div class="state-card"><h2>Sin videos publicados</h2><p>Cuando cargues testimonios, entregas o apoyos sociales, apareceran aqui.</p></div>`;
  }

  return `
    ${winner.length ? `
      <div class="section-group">
        <div class="section-head section-head-small">
          <div>
            <span class="section-kicker">Ganadores</span>
            <h3>Videos de ganadores</h3>
            <p>Testimonios, entregas y momentos reales de quienes ya participaron.</p>
          </div>
          <div class="section-scroll-hint">Desliza hacia los lados</div>
        </div>
        ${renderVideoCards(winner, "winner", "strip")}
      </div>
    ` : ""}

    ${socialSupport.length ? `
      <div class="section-group">
        <div class="section-head section-head-small">
          <div>
            <span class="section-kicker">Apoyos sociales</span>
            <h3>Historias de apoyo</h3>
            <p>Ayudas, aportes y acciones sociales que el cliente quiera mostrar públicamente.</p>
          </div>
          <div class="section-scroll-hint">Desliza hacia los lados</div>
        </div>
        ${renderVideoCards(socialSupport, "social_support", "strip")}
      </div>
    ` : ""}
  `;
}

function getRaffleSelectorNumbers() {
  const raffle = raffleSelectorState.raffle || null;
  const rawNumbers = asArray(raffleSelectorState.numbers);
  const numbers = rawNumbers.length > 0 ? rawNumbers : getRaffleSelectorFallbackNumbers(raffle);

  const expandedNumbers = numbers.flatMap((ticket) => {
    const ticketNumbers = Array.isArray(ticket?.numbers) && ticket.numbers.length > 0
      ? ticket.numbers.map(normalizeTicketDisplayValue).filter(Boolean)
      : [normalizeTicketDisplayValue(ticket?.number)].filter(Boolean);
    const groupedDisplay = formatTicketSelectionLabel(ticket);

    if (ticketNumbers.length <= 1) {
      return ticketNumbers.map((number) => ({
        ...ticket,
        number,
        display: number,
        groupedDisplay,
        groupSize: 1,
      }));
    }

    return ticketNumbers.map((number, index) => ({
      ...ticket,
      number,
      display: number,
      groupedDisplay,
      groupSize: ticketNumbers.length,
      itemIndex: index,
    }));
  });

  return filterRaffleSelectorNumbers(
    expandedNumbers,
    raffleSelectorState.query || "",
  );
}

function getRaffleSelectorPagination(numbers = []) {
  const serverPagination = raffleSelectorState.pagination || null;
  if (serverPagination) {
    const page = Math.max(1, Number.parseInt(serverPagination.page, 10) || 1);
    const pageSize = Math.max(1, Number.parseInt(serverPagination.pageSize, 10) || RAFFLE_SELECTOR_PAGE_SIZE);
    const total = Math.max(0, Number.parseInt(serverPagination.total, 10) || 0);
    const totalPages = Math.max(1, Number.parseInt(serverPagination.totalPages, 10) || Math.ceil(total / pageSize) || 1);
    const start = total > 0 ? ((page - 1) * pageSize) + 1 : 0;
    const end = total > 0 ? Math.min(page * pageSize, total) : 0;

    return {
      page,
      total,
      totalPages,
      start,
      end,
      pageNumbers: Array.isArray(numbers) ? numbers : [],
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };
  }

  const total = Array.isArray(numbers) ? numbers.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / RAFFLE_SELECTOR_PAGE_SIZE));
  const requestedPage = Number.parseInt(raffleSelectorState.page, 10) || 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = total > 0 ? (page - 1) * RAFFLE_SELECTOR_PAGE_SIZE : 0;
  const end = total > 0 ? Math.min(start + RAFFLE_SELECTOR_PAGE_SIZE, total) : 0;
  const pageNumbers = total > 0
    ? numbers.slice(start, start + RAFFLE_SELECTOR_PAGE_SIZE)
    : [];

  return {
    page,
    total,
    totalPages,
    start,
    end,
    pageNumbers,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);

  if (seconds < 30) return "hace unos segundos";
  if (seconds < 60) return "hace menos de 1 minuto";
  if (minutes < 2) return "hace 1 minuto";
  if (minutes < 60) return `hace ${minutes} minutos`;
  if (hours < 2) return "hace 1 hora";
  if (hours < 24) return `hace ${hours} horas`;

  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderRaffleSelectorContent() {
  const raffle = raffleSelectorState.raffle || null;
  const site = raffleSelectorState.site || {};
  const title = raffle ? getRaffleDisplayTitle(raffle) : "Selecciona un sorteo";
  const description = raffle ? getRaffleDisplayDescription(raffle) : "";
  const image = raffle ? getRaffleDisplayImage(raffle, site) : ASSETS.raffle;
  const pricingBadge = raffle ? getRafflePricingBadge(raffle) : "";
  const drawDate = raffle ? getRaffleDisplayDate(raffle) : "";
  const mode = raffle ? getRaffleDisplayMode(raffle) : "";
  const total = raffle ? getRaffleDisplayTotal(raffle) : 0;
  const pricingSummary = raffle ? formatRafflePricingSummary(raffle) : "";
  const pricingPackages = raffle ? getRafflePricingPackages(raffle) : [];
  const selected = raffle ? getCurrentRaffleSelectionForRender(raffle.campaign.id) : [];
  const selectionSummary = raffle ? getRaffleSelectorSelectionSummary(raffle, selected) : {
    groupSize: 1,
    supportUploadMode: false,
    totalNumbers: selected.length,
    completeTickets: 0,
    remainder: 0,
    isComplete: false,
    missingForNext: 0,
    total: 0,
  };
  const selectedAmount = selectionSummary.total;
  const fidelitySingleTicketOnly = Boolean(selectionSummary.supportUploadMode);
  const progressPercent = selectionSummary.groupSize > 0
    ? Math.min(100, Math.round((selectionSummary.totalNumbers / selectionSummary.groupSize) * 100))
    : 0;
  const progressMarkup = selected.length ? `
    <div class="selector-progress">
      <div class="selector-progress-row">
        <span class="selector-progress-chip is-active">${selectionSummary.totalNumbers} numero${selectionSummary.totalNumbers === 1 ? "" : "s"}</span>
        <span class="selector-progress-chip">${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completa${selectionSummary.completeTickets === 1 ? "" : "s"}</span>
        <span class="selector-progress-chip ${selectionSummary.isComplete ? "is-ready" : "is-warning"}">${selectionSummary.isComplete ? "Listo para pagar" : `Faltan ${selectionSummary.missingForNext}`}</span>
      </div>
      <div class="selector-progress-bar" aria-hidden="true">
        <span style="width: ${progressPercent}%"></span>
      </div>
    </div>
  ` : "";
  const selectedCopy = selected.length
    ? selected
      .map((item) => `
        <button
          type="button"
          class="selected-chip"
          data-selector-remove="${escapeAttr(item)}"
        >
          <span>${escapeHtml(item)}</span>
          <strong>·</strong>
        </button>
      `)
      .join("")
    : `<div class="selector-empty selector-empty-inline">Aun no has elegido numeros.</div>`;
  const numbers = getRaffleSelectorNumbers();
  const pagination = getRaffleSelectorPagination(numbers);
  const numbersHtml = raffleSelectorState.loading
    ? `
      <div class="selector-loading-panel">
        <div class="selector-loading-clock" aria-hidden="true"></div>
        <strong>Cargando numeros disponibles...</strong>
        <span>Estamos preparando la seleccion real del sorteo.</span>
      </div>
    `
    : pagination.pageNumbers.length > 0
      ? pagination.pageNumbers
        .map((ticket) => {
          const label = ticket.display || ticket.number || "";
          const isSelected = selected.includes(label);
          return `
            <button
              type="button"
              class="ticket-chip ${isSelected ? "is-selected" : ""}"
              data-selector-ticket="${escapeAttr(label)}"
              aria-pressed="${isSelected ? "true" : "false"}"
            >
              ${escapeHtml(label)}
            </button>
          `;
        })
        .join("")
      : `<div class="selector-empty selector-empty-large">No hay numeros disponibles en este momento.</div>`;
  const canContinueToPayment = Boolean(
    selected.length
    && selectionSummary.isComplete
    && (!fidelitySingleTicketOnly || selectionSummary.completeTickets === 1),
  );
  const limitInfo = raffleSelectorState.query ? `Resultados para "${escapeHtml(raffleSelectorState.query)}"` : `${numbers.length} numeros visibles`;
  const pageInfo = numbers.length > 0
    ? `Página ${pagination.page} de ${pagination.totalPages}`
    : "Sin paginacion";
  const pageRange = numbers.length > 0
    ? `${pagination.start + 1}-${pagination.end}`
    : "";
  const notice = raffleSelectorState.notice
    ? `<div class="selector-notice selector-notice-${escapeHtml(raffleSelectorState.noticeTone || "info")}">${escapeHtml(raffleSelectorState.notice)}</div>`
    : `<div class="selector-notice selector-notice-placeholder" aria-hidden="true"></div>`;
  const liveSummary = `
    <div class="selector-live-summary ${selected.length ? "is-active" : "is-empty"}">
      ${progressMarkup}
      <strong>${selected.length ? `${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completas` : "Selecciona tus números para empezar"}</strong>
      <span>${selected.length ? `${escapeHtml(formatCOP(selectedAmount))} · ${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} lista${selectionSummary.completeTickets === 1 ? "" : "s"}${selectionSummary.isComplete ? "" : ` · te faltan ${selectionSummary.missingForNext} número${selectionSummary.missingForNext === 1 ? "" : "s"} para completar la siguiente boleta`}` : "Tu total aparecerá aqué al instante."}</span>
      <p>${selected.length ? `Cada boleta se arma con ${selectionSummary.groupSize} números.${fidelitySingleTicketOnly ? " En fidelizacion solo se permite una boleta por cliente." : ""} ${selectionSummary.isComplete ? `Tienes ${selectionSummary.totalNumbers} números y ya puedes continuar al pago.` : `Llevas ${selectionSummary.totalNumbers} números: ${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completa${selectionSummary.completeTickets === 1 ? "" : "s"} y te faltan ${selectionSummary.missingForNext} para la siguiente.`}` : "Toca cualquier número para empezar."}</p>
    </div>
  `;
  const priceChips = pricingPackages.length
    ? pricingPackages.slice(0, 4).map((item) => `
        <span class="selector-price-chip">
          <strong>${escapeHtml(`${item.quantity} boleta${item.quantity === 1 ? "" : "s"}`)}</strong>
          <small>${escapeHtml(currencyFormatter.format(item.value))}</small>
        </span>
      `).join("")
    : (pricingSummary ? `
        <span class="selector-price-chip selector-price-chip-wide">
          <strong>Precio de boletería</strong>
          <small>${escapeHtml(pricingSummary)}</small>
        </span>
      ` : "");
  if (isMobileDevice()) {
    return `
      <div class="selector-head selector-head-mobile">
        <div class="selector-head-copy">
          <h3>${escapeHtml(title)}</h3>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        </div>
        <button type="button" class="selector-close" data-action="close-raffle-selector">Cerrar</button>
      </div>

      ${raffle ? `
        <div class="selector-mobile-meta selector-mobile-meta-compact">
          ${pricingBadge ? `<span class="chip">${escapeHtml(pricingBadge)}</span>` : ""}
          ${drawDate ? `<span class="chip">${escapeHtml(drawDate)}</span>` : ""}
          ${mode ? `<span class="chip">${escapeHtml(mode)}</span>` : ""}
        </div>
      ` : ""}

      <div class="selector-mobile-toolbar">
        <label class="selector-search">
          <span>Buscar numero</span>
          <input
            type="search"
            data-selector-search
            value="${escapeHtml(raffleSelectorState.query || "")}"
            placeholder="Ej. 705"
            autocomplete="off"
          />
        </label>
        <div class="selector-toolbar-actions selector-toolbar-actions-mobile">
          <div class="selector-toolbar-note">${escapeHtml(limitInfo)}</div>
          <button type="button" class="button secondary selector-refresh" data-action="refresh-raffle-selector">Actualizar</button>
        </div>
      </div>

      ${notice}
      ${liveSummary}

      <div class="selector-mobile-pagination selector-mobile-pagination-compact">
        <button type="button" class="selector-page-button" data-selector-page="prev" ${pagination.hasPrev ? "" : "disabled"}>Anterior</button>
        <div class="selector-pagination-current">
          <span>${escapeHtml(pageInfo)}</span>
          <strong>${escapeHtml(pageRange)}</strong>
        </div>
        <button type="button" class="selector-page-button" data-selector-page="next" ${pagination.hasNext ? "" : "disabled"}>Siguiente</button>
      </div>

      <div class="ticket-grid-shell selector-mobile-grid-shell">
        <div class="ticket-grid">
          ${numbersHtml}
        </div>
      </div>

      <div class="selector-summary-mobile selector-summary-mobile-inline selector-summary-mobile-compact">
        <div class="selector-summary-mobile-chips">
          ${selected.length
            ? selected
              .map((item) => `<button type="button" class="selected-chip mobile" data-selector-remove="${escapeAttr(item)}">${escapeHtml(item)}<strong>·</strong></button>`)
              .join("")
            : `<div class="selector-empty selector-empty-inline">Aun no has elegido numeros.</div>`}
        </div>
        <div class="selector-summary-mobile-actions">
          <button type="button" class="button primary" data-action="go-payment-section" ${canContinueToPayment ? "" : "disabled"}>Continuar al pago</button>
          <button type="button" class="button secondary" data-action="clear-raffle-selection" ${selected.length ? "" : "disabled"}>Borrar selección</button>
        </div>
      </div>
    `;
  }
  return `
      <div class="selector-head">
        <div class="selector-head-copy">
          <h3>${escapeHtml(title)}</h3>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        </div>
      <button type="button" class="selector-close" data-action="close-raffle-selector">Cerrar</button>
    </div>

    ${raffle ? `
      <div class="selector-hero selector-hero-minimal">
        <div class="selector-hero-body selector-hero-body-minimal">
          <div class="selector-hero-topline">
            <span class="selector-kicker">Precio de boletería</span>
            <div class="selector-price-strip">
              ${priceChips}
            </div>
          </div>
          <div class="selector-hero-chiprow selector-hero-chiprow-minimal">
            ${pricingBadge ? `<span class="chip">${escapeHtml(pricingBadge)}</span>` : ""}
            ${drawDate ? `<span class="chip">${escapeHtml(drawDate)}</span>` : ""}
            ${mode ? `<span class="chip">${escapeHtml(mode)}</span>` : ""}
          </div>
        </div>
      </div>
    ` : ""}

    <div class="selector-layout">
      <div class="selector-main">
        <div class="selector-main-top">
        <div class="selector-toolbar">
          <label class="selector-search">
            <span>Buscar numero</span>
            <input
              type="search"
              data-selector-search
              value="${escapeHtml(raffleSelectorState.query || "")}"
              placeholder="Ej. 705"
              autocomplete="off"
            />
          </label>
          <div class="selector-toolbar-actions">
            <div class="selector-toolbar-note">${escapeHtml(limitInfo)}</div>
            <button type="button" class="button secondary selector-refresh" data-action="refresh-raffle-selector">Actualizar</button>
          </div>
        </div>
        ${notice}
        ${liveSummary}
        <div class="selector-pagination selector-pagination-top">
          <button type="button" class="selector-page-button" data-selector-page="prev" ${pagination.hasPrev ? "" : "disabled"}>Anterior</button>
          <div class="selector-pagination-current">
            <span>${escapeHtml(pageInfo)}</span>
            <strong>${escapeHtml(pageRange)}</strong>
          </div>
          <button type="button" class="selector-page-button" data-selector-page="next" ${pagination.hasNext ? "" : "disabled"}>Siguiente</button>
        </div>
        </div>
        <div class="ticket-grid-shell">
          <div class="ticket-grid">
            ${numbersHtml}
          </div>
        </div>
        <div class="selector-pagination selector-pagination-bottom">
          <button type="button" class="selector-page-button" data-selector-page="prev" ${pagination.hasPrev ? "" : "disabled"}>Anterior</button>
          <div class="selector-pagination-current">
            <span>${escapeHtml(pageInfo)}</span>
            <strong>${escapeHtml(pageRange)}</strong>
          </div>
          <button type="button" class="selector-page-button" data-selector-page="next" ${pagination.hasNext ? "" : "disabled"}>Siguiente</button>
        </div>
      </div>

      <aside class="selector-summary">
      <div class="selector-summary-head">
          <h4>${selected.length ? `${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completas` : "Aun no seleccionas numeros"}</h4>
          ${selected.length ? `<p class="selector-summary-total">${escapeHtml(formatCOP(selectedAmount))}</p>` : ""}
        </div>
        <div class="selected-list">
          ${selectedCopy}
        </div>
        <div class="selector-summary-footer">
          <div class="selector-summary-note">
            <strong>${selected.length ? `Cada boleta se arma con ${selectionSummary.groupSize} números.` : "Selecciona los numeros que quieras apartar."}</strong>
            <span>${selected.length ? (selectionSummary.isComplete ? `Tienes ${selectionSummary.totalNumbers} números y ${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} lista${selectionSummary.completeTickets === 1 ? "" : "s"} para pagar.` : `Llevas ${selectionSummary.totalNumbers} números: ${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completa${selectionSummary.completeTickets === 1 ? "" : "s"} y te faltan ${selectionSummary.missingForNext} para la siguiente.`) : "Cuando selecciones numeros, aqui veras el acceso al pago."}</span>
          </div>
          <div class="selector-summary-actions">
            <button type="button" class="button primary" data-action="go-payment-section" ${canContinueToPayment ? "" : "disabled"}>Continuar al pago</button>
            <button type="button" class="button secondary" data-action="clear-raffle-selection" ${selected.length ? "" : "disabled"}>Borrar selección</button>
          </div>
        </div>
      </aside>
    </div>

    <div class="selector-summary-mobile">
      <div class="selector-summary-mobile-copy">
        <strong>${selected.length ? `${selected.length} numero${selected.length === 1 ? "" : "s"} elegidos` : "Sin numeros aun"}</strong>
        ${selected.length ? `<span class="selector-summary-mobile-total">${escapeHtml(formatCOP(selectedAmount))}</span>` : ""}
        <span>${selected.length ? buildSelectionMessage(raffle, selected) : "Toca un numero para empezar."}</span>
      </div>
      <div class="selector-summary-mobile-chips">
        ${selected.length
          ? selected
            .map((item) => `<button type="button" class="selected-chip mobile" data-selector-remove="${escapeAttr(item)}">${escapeHtml(item)}<strong>·</strong></button>`)
            .join("")
          : `<div class="selector-empty selector-empty-inline">Aun no has elegido numeros.</div>`}
      </div>
      <div class="selector-summary-mobile-actions">
        <button type="button" class="button primary" data-action="go-payment-section" ${canContinueToPayment ? "" : "disabled"}>Continuar al pago</button>
        <button type="button" class="button secondary" data-action="clear-raffle-selection" ${selected.length ? "" : "disabled"}>Borrar selección</button>
      </div>
    </div>
  `;
}

function renderRaffleSelectorModal() {
  return `
    <div
      id="raffle-selector-modal"
      class="raffle-selector-modal"
      role="dialog"
      aria-modal="true"
      aria-hidden="true"
    >
      <div class="raffle-selector-card">
        <div id="raffle-selector-content" class="raffle-selector-content">
          <div class="selector-empty selector-empty-large">Selecciona un sorteo para ver sus numeros disponibles.</div>
        </div>
      </div>
    </div>
  `;
}

function getPaymentModalSelectionTotal(raffle = {}, selected = []) {
  const summary = getRaffleSelectorSelectionSummary(raffle, selected);
  if (!raffle || summary.completeTickets <= 0) {
    return 0;
  }

  return summary.total;
}

function openPaymentModal(payload = {}) {
  const raffle = payload.raffle || null;
  const selected = asArray(payload.selected)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const resolvedSelected = selected.length > 0
    ? selected
    : raffle
      ? getCurrentRaffleSelection(raffle.campaign.id)
      : [];

  paymentModalState.open = true;
  paymentModalState.site = payload.site || null;
  paymentModalState.slug = String(payload.slug || "").trim();
  paymentModalState.raffle = raffle;
  paymentModalState.selected = [...new Set(resolvedSelected)];
  paymentModalState.amount = getPaymentModalSelectionTotal(raffle, paymentModalState.selected);
  paymentModalState.customerName = "";
  paymentModalState.customerCity = "";
  paymentModalState.customerPhone = "";
  paymentModalState.file = null;
  paymentModalState.fileName = "";
  paymentModalState.checkoutUrl = "";
  paymentModalState.loading = false;
  paymentModalState.error = "";
  paymentModalState.notice = "";
  paymentModalState.noticeTone = "info";
  paymentModalState.requestId += 1;
  syncPaymentModal();
  paintPaymentModal();
}

function closePaymentModal() {
  paymentModalState.open = false;
  paymentModalState.site = null;
  paymentModalState.slug = "";
  paymentModalState.raffle = null;
  paymentModalState.selected = [];
  paymentModalState.amount = 0;
  paymentModalState.customerName = "";
  paymentModalState.customerCity = "";
  paymentModalState.customerPhone = "";
  paymentModalState.file = null;
  paymentModalState.fileName = "";
  paymentModalState.checkoutUrl = "";
  paymentModalState.loading = false;
  paymentModalState.error = "";
  paymentModalState.notice = "";
  paymentModalState.noticeTone = "info";
  paymentModalState.requestId += 1;
  paintPaymentModal();
  syncPaymentModal();
}

function syncDeliveryModal() {
  const modal = document.getElementById("delivery-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", deliveryModalState.open);
  modal.setAttribute("aria-hidden", deliveryModalState.open ? "false" : "true");
  document.body.classList.toggle("modal-open", deliveryModalState.open || raffleSelectorState.open || paymentModalState.open);
}

function closeDeliveryModal() {
  deliveryModalState.open = false;
  deliveryModalState.loading = false;
  deliveryModalState.site = null;
  deliveryModalState.slug = "";
  deliveryModalState.raffle = null;
  deliveryModalState.paymentReference = "";
  deliveryModalState.customerPhone = "";
  deliveryModalState.assets = [];
  deliveryModalState.whatsappUrl = "";
  deliveryModalState.expanded = false;
  deliveryModalState.error = "";
  deliveryModalState.notice = "";
  deliveryModalState.noticeTone = "info";
  deliveryModalState.requestId += 1;
  paintDeliveryModal();
  syncDeliveryModal();
}

function submitDeliveryNotice(message, tone = "info") {
  deliveryModalState.notice = message;
  deliveryModalState.noticeTone = tone;
  deliveryModalState.error = tone === "error" ? message : "";
  paintDeliveryModal();
}

function triggerDeliveryAssetDownload(item = {}, index = 0) {
  const href = String(item?.dataUrl || "").trim();
  if (!href) return;

  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = String(item?.fileName || `boleta-${index + 1}.png`).trim() || `boleta-${index + 1}.png`;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadDeliveryAssets() {
  const assets = Array.isArray(deliveryModalState.assets) ? deliveryModalState.assets : [];
  if (!assets.length) return false;

  assets.forEach((item, index) => {
    window.setTimeout(() => triggerDeliveryAssetDownload(item, index), index * 250);
  });
  return true;
}

async function loadPublicDeliveryAssets() {
  const requestId = deliveryModalState.requestId;
  const site = deliveryModalState.site || window.__PUBLIC_SITE_STATE__?.site || null;
  const slug = deliveryModalState.slug || window.__PUBLIC_SITE_STATE__?.slug || "";
  const raffle = deliveryModalState.raffle || null;
  const paymentReference = String(deliveryModalState.paymentReference || "").trim();
  const customerPhone = String(deliveryModalState.customerPhone || "").trim();

  if (!site || !slug || !raffle?.campaign?.id || !paymentReference) {
    return;
  }

  deliveryModalState.loading = true;
  submitDeliveryNotice("Preparando tus boletas para descarga y WhatsApp...", "info");

  try {
    const params = new URLSearchParams();
    params.set("reference", paymentReference);
    if (customerPhone) {
      params.set("customer_phone", customerPhone);
    }

    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(slug)}/raffles/${encodeURIComponent(raffle.campaign.id)}/delivery?${params.toString()}`,
      { cache: "no-store" },
    );
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload?.message || "No fue posible preparar tus boletas.");
    }

    if (requestId !== deliveryModalState.requestId) {
      return;
    }

    deliveryModalState.assets = Array.isArray(payload?.tickets) ? payload.tickets : [];
    deliveryModalState.whatsappUrl = String(payload?.whatsapp_url || "").trim();
    deliveryModalState.loading = false;
    deliveryModalState.expanded = deliveryModalState.assets.length > 0;
    deliveryModalState.notice = deliveryModalState.assets.length > 0
      ? "Ya puedes descargar tus boletas o recibirlas por WhatsApp."
      : "Tus boletas estan listas.";
    deliveryModalState.noticeTone = "success";
    paintDeliveryModal();

    if (deliveryModalState.downloadRequested && deliveryModalState.assets.length > 0) {
      downloadDeliveryAssets();
      deliveryModalState.downloadRequested = false;
    }
  } catch (error) {
    if (requestId !== deliveryModalState.requestId) {
      return;
    }
    deliveryModalState.loading = false;
    submitDeliveryNotice(error?.message || "No fue posible preparar tus boletas.", "error");
  }
}

function openDeliveryModal({ site = null, slug = "", raffle = null, paymentReference = "", customerPhone = "" } = {}) {
  deliveryModalState.open = true;
  deliveryModalState.loading = false;
  deliveryModalState.site = site || null;
  deliveryModalState.slug = String(slug || "").trim();
  deliveryModalState.raffle = raffle || null;
  deliveryModalState.paymentReference = String(paymentReference || "").trim();
  deliveryModalState.customerPhone = String(customerPhone || "").trim();
  deliveryModalState.assets = [];
  deliveryModalState.whatsappUrl = "";
  deliveryModalState.expanded = false;
  deliveryModalState.downloadRequested = false;
  deliveryModalState.error = "";
  deliveryModalState.notice = "";
  deliveryModalState.noticeTone = "info";
  deliveryModalState.requestId += 1;
  paintDeliveryModal();
  syncDeliveryModal();
  loadPublicDeliveryAssets();
}

function syncPaymentModal() {
  const modal = document.getElementById("payment-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", paymentModalState.open);
  modal.setAttribute("aria-hidden", paymentModalState.open ? "false" : "true");
  document.body.classList.toggle("modal-open", paymentModalState.open || raffleSelectorState.open);
}

function refreshPaymentModalActionState() {
  const modal = document.getElementById("payment-modal");
  if (!modal) return;
  const selectionSummary = getRaffleSelectorSelectionSummary(paymentModalState.raffle || {}, paymentModalState.selected);
  const supportUploadMode = Boolean(paymentModalState.raffle?.campaign?.ticket_auto_config?.public_support_upload);
  const ready = Boolean(
    paymentModalState.open
    && !paymentModalState.loading
    && String(paymentModalState.customerName || "").trim()
    && String(paymentModalState.customerCity || "").trim()
    && String(paymentModalState.customerPhone || "").trim()
    && selectionSummary.isComplete
    && (!supportUploadMode || selectionSummary.completeTickets === 1)
  );

  modal.querySelectorAll('[data-action="start-public-pse"], [data-action="trigger-public-receipt-upload"]').forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = !ready;
    }
  });
}

function renderPaymentModalContent() {
  const raffle = paymentModalState.raffle || null;
  const site = paymentModalState.site || {};
  const selected = asArray(paymentModalState.selected);
  const selectionSummary = getRaffleSelectorSelectionSummary(raffle, selected);
  const paymentInstructions = getPaymentInstructionsText(raffle, site);
  const title = raffle ? getRaffleDisplayTitle(raffle) : "Pago";
  const description = raffle
    ? (getRaffleDisplayDescription(raffle) || "Contin·a con tu pago con el método que prefieras.")
    : "Contin·a con tu pago con el método que prefieras.";
  const total = Number(paymentModalState.amount || getPaymentModalSelectionTotal(raffle, selected) || 0);
  const pricingSummary = raffle ? formatRafflePricingSummary(raffle) : "";
  const selectedChips = selected.length
    ? selected
      .map((item) => `<span class="payment-chip">${escapeHtml(item)}</span>`)
      .join("")
    : `<div class="selector-empty selector-empty-inline">Aun no hay numeros seleccionados.</div>`;
  const receiptLabel = paymentModalState.fileName
    ? `<div class="payment-file-name">${escapeHtml(paymentModalState.fileName)}</div>`
    : "";
  const notice = paymentModalState.notice
    ? `<div class="payment-modal-notice payment-modal-notice-${escapeHtml(paymentModalState.noticeTone || "info")}">${escapeHtml(paymentModalState.notice)}</div>`
    : "";
  const checkoutUrl = paymentModalState.checkoutUrl || "";
  const customerName = String(paymentModalState.customerName || "").trim();
  const customerCity = String(paymentModalState.customerCity || "").trim();
  const customerPhone = String(paymentModalState.customerPhone || "").trim();
  const isContactReady = Boolean(selectionSummary.isComplete && customerName && customerCity && customerPhone);
  const supportUploadMode = Boolean(raffle?.campaign?.ticket_auto_config?.public_support_upload);
  const isFidelitySingleTicketValid = !supportUploadMode || selectionSummary.completeTickets === 1;
  const isDisabled = !isContactReady || paymentModalState.loading || !isFidelitySingleTicketValid;
  const supportLabel = getRaffleDisplayWhatsApp(site) ? `Soporte por WhatsApp: ${getRaffleDisplayWhatsApp(site)}` : "Soporte por WhatsApp";
  const paymentProgressMarkup = selected.length ? `
    <div class="payment-progress">
      <div class="payment-progress-row">
        <span class="payment-progress-chip is-active">${selectionSummary.totalNumbers} numero${selectionSummary.totalNumbers === 1 ? "" : "s"}</span>
        <span class="payment-progress-chip">${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completa${selectionSummary.completeTickets === 1 ? "" : "s"}</span>
        <span class="payment-progress-chip ${selectionSummary.isComplete ? "is-ready" : "is-warning"}">${selectionSummary.isComplete ? "Puedes pagar" : `Faltan ${selectionSummary.missingForNext}`}</span>
      </div>
      <div class="payment-progress-bar" aria-hidden="true">
        <span style="width: ${selectionSummary.groupSize > 0 ? Math.min(100, Math.round((selectionSummary.totalNumbers / selectionSummary.groupSize) * 100)) : 0}%"></span>
      </div>
    </div>
  ` : "";

  return `
      <div class="payment-modal-head">
        <div class="payment-modal-head-copy">
          <h3>Completa tu compra</h3>
          <p>${escapeHtml(description)}</p>
        </div>
      <button type="button" class="selector-close" data-action="close-payment-modal">Cerrar</button>
    </div>

    ${notice}

    <div class="payment-modal-grid">
      <div class="payment-modal-left">
        <div class="payment-modal-summary">
          ${paymentProgressMarkup}
          <span class="payment-modal-kicker">Sorteo seleccionado</span>
          <h4>${escapeHtml(title)}</h4>
          <p class="payment-modal-copy">${escapeHtml(selected.length ? (selectionSummary.isComplete ? `Llevas ${selectionSummary.completeTickets} boleta${selectionSummary.completeTickets === 1 ? "" : "s"} completa${selectionSummary.completeTickets === 1 ? "" : "s"}.` : `Llevas ${selected.length} números y te faltan ${selectionSummary.missingForNext} para completar la siguiente boleta.`) : "Selecciona numeros antes de pagar.")}</p>
          <div class="payment-modal-chips">
            ${selectedChips}
          </div>
          <div class="payment-modal-total">
            <span>Total a pagar</span>
            <strong>${escapeHtml(formatCOP(total))}</strong>
          </div>
          ${selected.length && !selectionSummary.isComplete ? `
            <div class="payment-modal-pricing">
              <span>Estado de la selección:</span>
              <p>Te faltan ${selectionSummary.missingForNext} número${selectionSummary.missingForNext === 1 ? "" : "s"} para completar una boleta de ${selectionSummary.groupSize} números.</p>
            </div>
          ` : ""}
          ${pricingSummary ? `
            <div class="payment-modal-pricing">
              <span>Precio de boletería:</span>
              <p>${escapeHtml(pricingSummary)}</p>
            </div>
          ` : ""}
          <div class="payment-modal-footnote">${escapeHtml(supportLabel)}</div>
        </div>

          <div class="payment-action-card payment-instructions-card">
            <div class="payment-card-topline">
              <span class="payment-card-kicker">Instrucciones de pago</span>
              <span class="payment-card-badge">Lee antes de pagar</span>
            </div>
            <div class="payment-action-icon payment-action-icon-note"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M7 4h7l3 3v13H7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 4v4h4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11h6M9 14h6M9 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
            <div class="payment-card-copy">
              <strong>Así debes realizar tu pago</strong>
              <p>Esta información viene directamente de la configuraci·n del sorteo.</p>
            </div>
            ${renderPaymentInstructionsPanel(paymentInstructions)}
          </div>
      </div>

      <div class="payment-modal-right">
          <div class="payment-action-card payment-contact-card">
            <div class="payment-action-icon payment-action-icon-contact"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M20 18.5c-1.4-1.2-3.1-1.9-5-2.3l-1.1 2.2H10l-1.1-2.2c-1.9.4-3.6 1.1-5 2.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="9" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M7.2 20a8.9 8.9 0 0 1 9.6 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
            <div class="payment-card-copy">
              <span class="payment-card-kicker">Datos del comprador</span>
              <strong>Completa tus datos</strong>
              <p>Necesitamos estos datos para marcar y enviarte tus boletas y dejar tu compra registrada.</p>
            </div>
            <div class="payment-form-grid">
              <label class="payment-field">
                <span>Nombre</span>
                <input type="text" data-payment-field="customerName" value="${escapeAttr(paymentModalState.customerName || "")}" placeholder="Ej. Jennyfer Alvarado" />
              </label>
              <label class="payment-field">
                <span>Ciudad</span>
                <input type="text" data-payment-field="customerCity" value="${escapeAttr(paymentModalState.customerCity || "")}" placeholder="Ej. Neiva" />
              </label>
              <label class="payment-field">
                <span>Teléfono</span>
                <input type="tel" data-payment-field="customerPhone" value="${escapeAttr(paymentModalState.customerPhone || "")}" placeholder="Ej. 3001234567" />
              </label>
            </div>
          </div>

          <div class="payment-action-card">
            <div class="payment-action-icon payment-action-icon-upload"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M12 16V6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 9.5 12 6l3.5 3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="payment-card-copy">
              <span class="payment-card-kicker">${supportUploadMode ? "Captura de fidelizacion" : "Comprobante"}</span>
              <strong>${supportUploadMode ? "Sube tu captura" : "Sube tu soporte"}</strong>
              <p>${supportUploadMode ? "Sube una captura que demuestre que sigues la fan page. Este sorteo usa capturas en lugar de comprobantes de pago." : "Sube una imagen de tu comprobante para enviarlo a revisión."}</p>
            </div>
            <input type="file" accept="image/*" data-public-receipt-input hidden />
            <button type="button" class="button secondary" data-action="trigger-public-receipt-upload" ${isDisabled ? "disabled" : ""}>${supportUploadMode ? "Cargar captura" : "Cargar comprobante"}</button>
            ${receiptLabel}
          </div>

          <button type="button" class="button secondary payment-back" data-action="close-payment-modal">Volver</button>
      </div>
      </div>
    </div>
  `;
}

function paintPaymentModal() {
  const content = document.getElementById("payment-modal-content");
  if (!content) return;
  content.innerHTML = renderPaymentModalContent();
  syncPaymentModal();
  refreshPaymentModalActionState();
}

function renderPaymentModal() {
  return `
    <div
      id="payment-modal"
      class="payment-modal"
      role="dialog"
      aria-modal="true"
      aria-hidden="true"
    >
      <div class="payment-modal-card">
        <div id="payment-modal-content" class="payment-modal-content">
          <div class="selector-empty selector-empty-large">Selecciona numeros para continuar con el pago.</div>
        </div>
      </div>
    </div>
  `;
}

function renderDeliveryModalContent() {
  const raffle = deliveryModalState.raffle || paymentModalState.raffle || null;
  const title = raffle ? `Recibe tus boletas de ${getRaffleDisplayTitle(raffle)}` : "Recibe tus boletas";
  const description = raffle
    ? "El pago fue exitoso. Elige si quieres recibirlas por WhatsApp o descargarlas en tu celular."
    : "El pago fue exitoso. Elige cómo deseas recibir tus boletas.";
  const referenceChip = deliveryModalState.paymentReference
    ? `<span class="delivery-reference-chip">Referencia ${escapeHtml(deliveryModalState.paymentReference)}</span>`
    : "";
  const notice = deliveryModalState.notice
    ? `<div class="delivery-modal-notice delivery-modal-notice-${escapeHtml(deliveryModalState.noticeTone || "info")}">${escapeHtml(deliveryModalState.notice)}</div>`
    : "";
  const whatsappUrl = deliveryModalState.whatsappUrl || "";
  const whatsappDisabled = !whatsappUrl || deliveryModalState.loading;
  return `
    <div class="delivery-modal-head">
      <div class="delivery-modal-head-copy">
        <span class="payment-card-kicker">Pago exitoso</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        ${referenceChip}
      </div>
      <button type="button" class="selector-close" data-action="close-delivery-modal">Cerrar</button>
    </div>

    ${notice}

    <div class="delivery-choice-grid">
      <div class="delivery-choice-card delivery-choice-whatsapp">
        <div class="payment-action-icon payment-action-icon-whatsapp"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M20.2 3.8A10.6 10.6 0 0 0 2.3 15.7L1 22l6.4-1.7a10.6 10.6 0 0 0 5.1 1.3h0A10.6 10.6 0 0 0 20.2 3.8Zm-8 16.5h0a8.8 8.8 0 0 1-4.5-1.2l-.3-.2-3.8 1 1-3.7-.2-.4a8.8 8.8 0 1 1 7.8 4.5Zm5-6.5c-.3-.2-1.7-.9-1.9-1s-.3-.2-.4.2-.7 1-1 1.2-.4.2-.7 0a7.2 7.2 0 0 1-2.1-1.3 8 8 0 0 1-1.5-1.9c-.2-.4 0-.6.2-.8l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.5-1.4-.7-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.6 1.2 3 1.4 3.2c.2.2 2.1 3.2 5.1 4.4.7.3 1.2.5 1.7.7.7.2 1.3.2 1.7.1.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.4Z" fill="currentColor"/></svg></div>
        <div class="payment-card-copy">
          <strong>Enviar por WhatsApp</strong>
          <p>Se abrirá WhatsApp con un mensaje que lleva tu c·digo de compra.</p>
        </div>
        <a class="button payment-whatsapp ${whatsappDisabled ? "is-disabled" : ""}" href="${escapeHtml(whatsappUrl || "#")}" target="_blank" rel="noreferrer" ${whatsappDisabled ? 'aria-disabled="true"' : ""}>Enviar por WhatsApp</a>
      </div>
    </div>
  `;
}

function paintDeliveryModal() {
  const content = document.getElementById("delivery-modal-content");
  if (!content) return;
  content.innerHTML = renderDeliveryModalContent();
  syncDeliveryModal();
}

function renderDeliveryModal() {
  return `
    <div
      id="delivery-modal"
      class="delivery-modal"
      role="dialog"
      aria-modal="true"
      aria-hidden="true"
    >
      <div class="delivery-modal-card">
        <div id="delivery-modal-content" class="delivery-modal-content">
          <div class="selector-empty selector-empty-large">Estamos preparando la entrega de tus boletas.</div>
        </div>
      </div>
    </div>
  `;
}

function syncRaffleSelectorModal() {
  const modal = document.getElementById("raffle-selector-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", raffleSelectorState.open);
  modal.setAttribute("aria-hidden", raffleSelectorState.open ? "false" : "true");
  document.body.classList.toggle("modal-open", raffleSelectorState.open);
}

function paintRaffleSelector() {
  const content = document.getElementById("raffle-selector-content");
  if (!content) return;
  content.innerHTML = renderRaffleSelectorContent();
  bindRaffleSelectorActions(content);
  syncRaffleSelectorModal();
}

function handleRaffleSelectorTicketValue(rawValue) {
  const value = normalizeTicketDisplayValue(rawValue);
  if (!value || !raffleSelectorState.raffle) {
    return;
  }

  const selectionSummary = getRaffleSelectorSelectionSummary(raffleSelectorState.raffle, raffleSelectorState.selected);
  const supportUploadMode = Boolean(raffleSelectorState.raffle?.campaign?.ticket_auto_config?.public_support_upload);
  const exists = raffleSelectorState.selected.includes(value);
  if (supportUploadMode && !exists && selectionSummary.totalNumbers >= selectionSummary.groupSize) {
    raffleSelectorState.notice = "En fidelizacion solo puedes registrar una boleta por cliente.";
    raffleSelectorState.noticeTone = "warning";
    paintRaffleSelector();
    return;
  }

  raffleSelectorState.selected = exists
    ? raffleSelectorState.selected.filter((item) => item !== value)
    : [...raffleSelectorState.selected, value];
  persistSelection(raffleSelectorState.raffle?.campaign?.id, raffleSelectorState.selected);
  raffleSelectorState.notice = exists
    ? `Quitaste ${value} de tu seleccion.`
    : `Agregaste ${value} a tu seleccion.`;
  raffleSelectorState.noticeTone = "success";
  paintRaffleSelector();
}

function handleRaffleSelectorRemoveValue(rawValue) {
  const value = normalizeTicketDisplayValue(rawValue);
  if (!raffleSelectorState.raffle) {
    return;
  }

  raffleSelectorState.selected = raffleSelectorState.selected.filter((item) => item !== value);
  persistSelection(raffleSelectorState.raffle?.campaign?.id, raffleSelectorState.selected);
  raffleSelectorState.notice = value ? `Quitaste ${value} de tu seleccion.` : "";
  raffleSelectorState.noticeTone = "info";
  paintRaffleSelector();
}

function bindRaffleSelectorActions(content) {
  if (!content) {
    return;
  }

  if (!content.dataset.raffleSelectorBound) {
    content.dataset.raffleSelectorBound = "1";
    content.addEventListener("click", (event) => {
      const ticketButton = event.target.closest("[data-selector-ticket]");
      if (ticketButton && content.contains(ticketButton)) {
        event.preventDefault();
        event.stopPropagation();
        handleRaffleSelectorTicketValue(ticketButton.getAttribute("data-selector-ticket"));
        return;
      }

      const removeButton = event.target.closest("[data-selector-remove]");
      if (removeButton && content.contains(removeButton)) {
        event.preventDefault();
        event.stopPropagation();
        handleRaffleSelectorRemoveValue(removeButton.getAttribute("data-selector-remove"));
        return;
      }

      const pageButton = event.target.closest("[data-selector-page]");
      if (pageButton && content.contains(pageButton)) {
        event.preventDefault();
        event.stopPropagation();
        const pagination = getRaffleSelectorPagination(getRaffleSelectorNumbers());
        const direction = pageButton.getAttribute("data-selector-page");
        if (direction === "prev" && pagination.hasPrev) {
          raffleSelectorState.page = Math.max(1, pagination.page - 1);
        } else if (direction === "next" && pagination.hasNext) {
          raffleSelectorState.page = Math.min(pagination.totalPages, pagination.page + 1);
        } else {
          return;
        }
        fetchRaffleSelectorNumbers();
      }
    });
  }
}

function clearRaffleSelectorTimers() {
  if (raffleSelectorState.pollTimer) {
    clearInterval(raffleSelectorState.pollTimer);
    raffleSelectorState.pollTimer = null;
  }
  if (raffleSelectorState.queryTimer) {
    clearTimeout(raffleSelectorState.queryTimer);
    raffleSelectorState.queryTimer = null;
  }
}

async function fetchRaffleSelectorNumbers({ silent = false } = {}) {
  const site = raffleSelectorState.site || {};
  const slug = raffleSelectorState.slug || "";
  const raffle = raffleSelectorState.raffle || null;
  if (!site || !slug || !raffle?.campaign?.id) {
    return;
  }

  const requestId = ++raffleSelectorState.requestId;
  raffleSelectorState.loading = !silent;
  raffleSelectorState.error = "";
  if (!silent) {
    raffleSelectorState.notice = "Cargando numeros disponibles...";
    raffleSelectorState.noticeTone = "info";
  }
  paintRaffleSelector();

  try {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(RAFFLE_SELECTOR_LIMIT));
    searchParams.set("page", String(raffleSelectorState.page || 1));
    if (raffleSelectorState.query) {
      searchParams.set("query", raffleSelectorState.query);
    }

    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(slug)}/raffles/${encodeURIComponent(raffle.campaign.id)}/availability?${searchParams.toString()}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("No fue posible cargar los numeros de este sorteo.");
    }

    const payload = await response.json();
    if (requestId !== raffleSelectorState.requestId) {
      return;
    }

    raffleSelectorState.raffle = payload?.raffle
      ? {
          ...raffle,
          campaign: {
            ...(raffle.campaign || {}),
            id: payload.raffle.id,
            codigo: payload.raffle.code,
            nombre: payload.raffle.name,
            descripcion: payload.raffle.description,
            fecha_sorteo: payload.raffle.drawDate,
            hora_sorteo: payload.raffle.drawTime,
            valor_numero: payload.raffle.numberValue,
            pricing_strategy: payload.raffle.pricingStrategy,
            pricing_config: payload.raffle.pricingConfig || {},
            total_numeros: payload.raffle.totalNumeros,
            ticket_registration_mode: payload.raffle.ticketRegistrationMode,
            ticket_auto_config: payload.raffle.ticketAutoConfig || {},
            instrucciones_pago: payload.raffle.paymentInstructions || payload.raffle.payment_instructions || "",
            paymentInstructions: payload.raffle.paymentInstructions || payload.raffle.payment_instructions || "",
            payment_instructions: payload.raffle.paymentInstructions || payload.raffle.payment_instructions || "",
            updated_at: payload.raffle.updatedAt,
          },
        }
      : raffle;
    const payloadNumbers = asArray(payload?.numbers).map((ticket) => ({
      ...ticket,
      display: formatTicketSelectionLabel(ticket),
    }));
    raffleSelectorState.numbers = payloadNumbers.length > 0
      ? payloadNumbers
      : getRaffleSelectorFallbackNumbers(raffleSelectorState.raffle);
    raffleSelectorState.stats = payload?.stats || null;
    raffleSelectorState.pagination = payload?.pagination || null;
    raffleSelectorState.updatedAt = payload?.updatedAt || new Date().toISOString();
    raffleSelectorState.loading = false;
    raffleSelectorState.error = "";
    raffleSelectorState.notice = raffleSelectorState.query
      ? `Resultados actualizados para "${raffleSelectorState.query}".`
      : "Numeros actualizados en tiempo real.";
    raffleSelectorState.noticeTone = "success";
    paintRaffleSelector();
  } catch (error) {
    if (requestId !== raffleSelectorState.requestId) {
      return;
    }
    raffleSelectorState.loading = false;
    raffleSelectorState.error = error?.message || "No fue posible cargar los numeros.";
    raffleSelectorState.notice = raffleSelectorState.error;
    raffleSelectorState.noticeTone = "error";
    raffleSelectorState.pagination = null;
    paintRaffleSelector();
  }
}

async function openRaffleSelector(raffleId) {
  const fallbackSite = raffleSelectorState.site || window.__PUBLIC_SITE_STATE__?.site || null;
  const fallbackSlug = window.__PUBLIC_SITE_STATE__?.slug || raffleSelectorState.slug || getSlugFromLocation();
  const site = fallbackSite || window.__PUBLIC_SITE_STATE__?.site || null;
  const requestedId = String(raffleId || "");
  const previousRaffleId = String(raffleSelectorState.raffle?.campaign?.id || "");
  const initialRaffles = asArray(site?.activeRaffles);
  const raffle =
    initialRaffles.find((item) => String(item?.campaign?.id || "") === requestedId)
    || initialRaffles.find((item) => item?.publicConfig?.isFeatured)
    || initialRaffles[0]
    || null;
  if (!raffle) {
    const freshSite = await fetchFreshPublicSite(fallbackSlug);
    const freshRaffles = asArray(freshSite?.activeRaffles);
    const freshRaffle =
      freshRaffles.find((item) => String(item?.campaign?.id || "") === requestedId)
      || freshRaffles.find((item) => item?.publicConfig?.isFeatured)
      || freshRaffles[0]
      || null;
    if (!freshRaffle) {
      return;
    }

    raffleSelectorState.site = freshSite;
    raffleSelectorState.slug = fallbackSlug;
    raffleSelectorState.raffle = freshRaffle;
    raffleSelectorState.query = "";
    raffleSelectorState.page = 1;
    const currentSelection = previousRaffleId === String(freshRaffle.campaign?.id || "")
      ? asArray(raffleSelectorState.selected)
      : [];
    const persistedSelection = readPersistedSelection(freshRaffle.campaign.id);
    raffleSelectorState.selected = currentSelection.length > 0 ? currentSelection : persistedSelection;
    raffleSelectorState.numbers = [];
    raffleSelectorState.stats = null;
    raffleSelectorState.pagination = null;
    raffleSelectorState.loading = true;
    raffleSelectorState.error = "";
    raffleSelectorState.notice = "Cargando numeros disponibles...";
    raffleSelectorState.noticeTone = "info";
    raffleSelectorState.updatedAt = "";
    raffleSelectorState.open = true;

    window.__PUBLIC_SITE_STATE__ = {
      site: freshSite,
      slug: fallbackSlug,
      raffles: freshRaffles,
    };

    clearRaffleSelectorTimers();
    syncRaffleSelectorModal();
    paintRaffleSelector();
    fetchRaffleSelectorNumbers();
    raffleSelectorState.pollTimer = setInterval(() => {
      if (raffleSelectorState.open) {
        fetchRaffleSelectorNumbers({ silent: true });
      }
    }, 18000);
    return;
  }

  raffleSelectorState.site = site;
  raffleSelectorState.slug = fallbackSlug;
  raffleSelectorState.raffle = raffle;
  raffleSelectorState.query = "";
  raffleSelectorState.page = 1;
  const currentSelection = previousRaffleId === requestedId
    && raffleSelectorState.selected.length > 0
    ? raffleSelectorState.selected
    : [];
  const persistedSelection = readPersistedSelection(raffle.campaign.id);
  raffleSelectorState.selected = currentSelection.length > 0 ? currentSelection : persistedSelection;
  raffleSelectorState.numbers = [];
  raffleSelectorState.stats = null;
  raffleSelectorState.pagination = null;
  raffleSelectorState.loading = true;
  raffleSelectorState.error = "";
  raffleSelectorState.notice = "Cargando numeros disponibles...";
  raffleSelectorState.noticeTone = "info";
  raffleSelectorState.updatedAt = "";
  raffleSelectorState.open = true;

  window.__PUBLIC_SITE_STATE__ = {
    site,
    slug: fallbackSlug,
    raffles: asArray(site?.activeRaffles),
  };

  clearRaffleSelectorTimers();
  syncRaffleSelectorModal();
  paintRaffleSelector();
  fetchRaffleSelectorNumbers();
  raffleSelectorState.pollTimer = setInterval(() => {
    if (raffleSelectorState.open) {
      fetchRaffleSelectorNumbers({ silent: true });
    }
  }, 18000);
}

function closeRaffleSelector() {
  raffleSelectorState.open = false;
  raffleSelectorState.raffle = null;
  raffleSelectorState.query = "";
  raffleSelectorState.page = 1;
  raffleSelectorState.numbers = [];
  raffleSelectorState.stats = null;
  raffleSelectorState.pagination = null;
  raffleSelectorState.loading = false;
  raffleSelectorState.error = "";
  raffleSelectorState.notice = "";
  raffleSelectorState.noticeTone = "info";
  raffleSelectorState.updatedAt = "";
  raffleSelectorState.requestId += 1;
  raffleSelectorState.retryCount = 0;
  clearRaffleSelectorTimers();
  paintRaffleSelector();
  syncRaffleSelectorModal();
}

function submitPublicPaymentStateNotice(message, tone = "info") {
  paymentModalState.notice = message;
  paymentModalState.noticeTone = tone;
  paymentModalState.error = tone === "error" ? message : "";
  paintPaymentModal();
}

function syncReceiptUploadModal() {
  const modal = document.getElementById("receipt-upload-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", receiptUploadState.open);
  modal.setAttribute("aria-hidden", receiptUploadState.open ? "false" : "true");
  document.body.classList.toggle("modal-open", receiptUploadState.open || deliveryModalState.open || raffleSelectorState.open || paymentModalState.open);
}

function openReceiptUploadModal({
  title = "Subiendo comprobante",
  description = "Espera un momento mientras verificamos tu pago.",
  detail = "No cierres esta ventana hasta que termine el proceso.",
  tone = "info",
} = {}) {
  receiptUploadState.open = true;
  receiptUploadState.title = String(title || "Subiendo comprobante").trim();
  receiptUploadState.description = String(description || "").trim();
  receiptUploadState.detail = String(detail || "").trim();
  receiptUploadState.tone = tone || "info";
  receiptUploadState.requestId += 1;
  paintReceiptUploadModal();
  syncReceiptUploadModal();
}

function closeReceiptUploadModal() {
  receiptUploadState.open = false;
  receiptUploadState.title = "Subiendo comprobante";
  receiptUploadState.description = "Espera un momento mientras verificamos tu pago.";
  receiptUploadState.detail = "No cierres esta ventana hasta que termine el proceso.";
  receiptUploadState.tone = "info";
  receiptUploadState.requestId += 1;
  syncReceiptUploadModal();
}

function renderReceiptUploadModalContent() {
  return `
    <div class="receipt-upload-modal-head">
      <div class="receipt-upload-spinner" aria-hidden="true"></div>
      <div class="receipt-upload-copy">
        <span class="payment-card-kicker">Procesando</span>
        <h3>${escapeHtml(receiptUploadState.title)}</h3>
        <p>${escapeHtml(receiptUploadState.description)}</p>
        <small>${escapeHtml(receiptUploadState.detail)}</small>
      </div>
    </div>
    <div class="receipt-upload-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
  `;
}

function paintReceiptUploadModal() {
  const content = document.getElementById("receipt-upload-modal-content");
  if (!content) return;
  content.innerHTML = renderReceiptUploadModalContent();
  syncReceiptUploadModal();
}

function renderReceiptUploadModal() {
  return `
    <div
      id="receipt-upload-modal"
      class="receipt-upload-modal"
      role="dialog"
      aria-modal="true"
      aria-hidden="true"
    >
      <div class="receipt-upload-card">
        <div id="receipt-upload-modal-content" class="receipt-upload-content">
          <div class="selector-empty selector-empty-large">Subiendo comprobante...</div>
        </div>
      </div>
    </div>
  `;
}

function updatePaymentModalField(field, value) {
  const normalized = String(value || "");
  if (field === "customerName") {
    paymentModalState.customerName = normalized;
  } else if (field === "customerCity") {
    paymentModalState.customerCity = normalized;
  } else if (field === "customerPhone") {
    paymentModalState.customerPhone = normalized;
  }
  refreshPaymentModalActionState();
}

function getPaymentModalContactPayload() {
  return {
    customer_name: String(paymentModalState.customerName || "").trim(),
    customer_city: String(paymentModalState.customerCity || "").trim(),
    customer_phone: String(paymentModalState.customerPhone || "").trim(),
  };
}

function ensurePaymentModalContactReady() {
  const payload = getPaymentModalContactPayload();
  if (!payload.customer_name || !payload.customer_city || !payload.customer_phone) {
    return false;
  }
  return true;
}

async function submitPublicPseCheckout() {
  const site = paymentModalState.site || window.__PUBLIC_SITE_STATE__?.site || null;
  const slug = paymentModalState.slug || window.__PUBLIC_SITE_STATE__?.slug || "";
  const raffle = paymentModalState.raffle || null;
  const supportUploadMode = Boolean(raffle?.campaign?.ticket_auto_config?.public_support_upload);
  const selected = asArray(paymentModalState.selected);
  const selectionSummary = getRaffleSelectorSelectionSummary(raffle, selected);
  if (!site || !slug || !raffle?.campaign?.id || !selected.length || paymentModalState.loading || !ensurePaymentModalContactReady() || !selectionSummary.isComplete) {
    submitPublicPaymentStateNotice("Completa nombre, ciudad y teléfono para continuar.", "warning");
    return;
  }

  if (supportUploadMode) {
    if (selectionSummary.completeTickets !== 1) {
      submitPublicPaymentStateNotice("En fidelizacion solo puedes registrar una boleta por cliente.", "warning");
      return;
    }
    submitPublicPaymentStateNotice("Este sorteo usa capturas de fidelizacion. Usa el boton de subir captura.", "warning");
    return;
  }

  const checkoutWindow = window.open("", "_blank");
  paymentModalState.loading = true;
  paymentModalState.checkoutUrl = "";
  submitPublicPaymentStateNotice("Preparando el checkout de PSE...", "info");

  try {
    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(slug)}/raffles/${encodeURIComponent(raffle.campaign.id)}/pse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selected_numbers: groupRaffleSelections(selected, selectionSummary.groupSize),
          ...getPaymentModalContactPayload(),
        }),
        cache: "no-store",
      },
    );

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload?.message || "No fue posible preparar el pago en linea.");
    }

    paymentModalState.loading = false;
    paymentModalState.checkoutUrl = payload?.checkout_url || "";
    paintPaymentModal();

    if (paymentModalState.checkoutUrl) {
      if (checkoutWindow) {
        checkoutWindow.location.href = paymentModalState.checkoutUrl;
        checkoutWindow.focus?.();
        submitPublicPaymentStateNotice("Abrimos la pasarela de PSE en una nueva pesta·a.", "success");
      } else {
        submitPublicPaymentStateNotice("Ya esta listo tu checkout de PSE. Usa el boton para abrirlo.", "warning");
      }
    } else {
      submitPublicPaymentStateNotice("El checkout quedo listo, pero no recibimos la URL de apertura.", "warning");
    }
  } catch (error) {
    paymentModalState.loading = false;
    try {
      checkoutWindow?.close?.();
    } catch {
      // Ignore popup cleanup failures.
    }
    submitPublicPaymentStateNotice(error?.message || "No fue posible preparar el pago en linea.", "error");
  }
}

async function submitPublicReceiptUpload(file = null) {
  const site = paymentModalState.site || window.__PUBLIC_SITE_STATE__?.site || null;
  const slug = paymentModalState.slug || window.__PUBLIC_SITE_STATE__?.slug || "";
  const raffle = paymentModalState.raffle || null;
  const supportUploadMode = Boolean(raffle?.campaign?.ticket_auto_config?.public_support_upload);
  const selected = asArray(paymentModalState.selected);
  const selectionSummary = getRaffleSelectorSelectionSummary(raffle, selected);
  if (!site || !slug || !raffle?.campaign?.id || !selected.length || paymentModalState.loading || !file || !ensurePaymentModalContactReady() || !selectionSummary.isComplete) {
    return;
  }

  if (supportUploadMode && selectionSummary.completeTickets !== 1) {
    submitPublicPaymentStateNotice("En fidelizacion solo puedes registrar una boleta por cliente.", "warning");
    return;
  }

  paymentModalState.loading = true;
  paymentModalState.file = file;
  paymentModalState.fileName = file.name || (supportUploadMode ? "Captura" : "Comprobante");
  openReceiptUploadModal({
    title: supportUploadMode ? "Subiendo captura" : "Subiendo comprobante",
    description: supportUploadMode
      ? "Espera un momento mientras registramos tu captura."
      : "Espera un momento mientras verificamos tu pago.",
    detail: supportUploadMode
      ? "Estamos leyendo el archivo y confirmando la fidelizacion."
      : "Estamos leyendo el archivo y validando la compra.",
    tone: "info",
  });
  submitPublicPaymentStateNotice(`Cargando ${paymentModalState.fileName}...`, "info");

  try {
    const formData = new FormData();
    formData.append("selected_numbers", JSON.stringify(groupRaffleSelections(selected, selectionSummary.groupSize)));
    formData.append("receipt_file", file, file.name || (supportUploadMode ? "captura" : "comprobante"));
    formData.append("support_upload", supportUploadMode ? "true" : "false");
    const contactPayload = getPaymentModalContactPayload();
    formData.append("customer_name", contactPayload.customer_name);
    formData.append("customer_city", contactPayload.customer_city);
    formData.append("customer_phone", contactPayload.customer_phone);

    const response = await fetch(
      `${API_BASE_URL}/public-site/${encodeURIComponent(slug)}/raffles/${encodeURIComponent(raffle.campaign.id)}/receipt`,
      {
        method: "POST",
        body: formData,
        cache: "no-store",
      },
    );

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || (supportUploadMode ? "No fue posible cargar la captura." : "No fue posible cargar el comprobante."));
    }

    paymentModalState.loading = false;
    paymentModalState.file = null;
    paymentModalState.fileName = "";
    paymentModalState.checkoutUrl = "";
    paymentModalState.selected = [];
    paymentModalState.amount = 0;
    raffleSelectorState.selected = [];
    clearPersistedSelection(raffleSelectorState.raffle?.campaign?.id || raffle?.campaign?.id || "");
      raffleSelectorState.notice = supportUploadMode
        ? "Tu captura quedo registrada y la seleccion fue limpiada."
        : "Tu compra quedo registrada y la seleccion fue limpiada.";
    raffleSelectorState.noticeTone = "success";
    paintRaffleSelector();
    if (payload?.auto_approved && payload?.payment_reference) {
      const contactPayload = getPaymentModalContactPayload();
      const nextSite = site || window.__PUBLIC_SITE_STATE__?.site || null;
      const nextSlug = slug || window.__PUBLIC_SITE_STATE__?.slug || "";
      const nextRaffle = raffle || null;
      closeReceiptUploadModal();
      closePaymentModal();
      openDeliveryModal({
        site: nextSite,
        slug: nextSlug,
        raffle: nextRaffle,
        paymentReference: payload.payment_reference,
        customerPhone: contactPayload.customer_phone || contactPayload.customerPhone || "",
      });
    } else {
      closeReceiptUploadModal();
      paintPaymentModal();
      const validationReasons = asArray(payload?.validation?.reasons)
        .map((reason) => String(reason || "").trim())
        .filter(Boolean);
      const rejectionReason = validationReasons.length > 0
        ? validationReasons[0]
        : String(payload?.receipt_warning || "").trim();
      const reviewMessage = payload?.client_message || (supportUploadMode ? "Tu captura quedo cargada y ya esta en revision." : "Tu comprobante quedo cargado y ya esta en revision.");
      const fallbackReason = payload?.validation?.decision === "NEEDS_MANUAL_REVIEW"
        ? "La validacion automatica no encontro una coincidencia suficiente y quedo pendiente de revision manual."
        : "";
      const rejectionMessage = rejectionReason
        ? `${reviewMessage} Motivo: ${rejectionReason}.`
        : fallbackReason
          ? `${reviewMessage} Motivo: ${fallbackReason}`
          : reviewMessage;
      submitPublicPaymentStateNotice(rejectionMessage, payload?.receipt_warning ? "warning" : "warning");
    }
  } catch (error) {
    closeReceiptUploadModal();
    paymentModalState.loading = false;
    submitPublicPaymentStateNotice(error?.message || (supportUploadMode ? "No fue posible cargar la captura." : "No fue posible cargar el comprobante."), "error");
  }
}

function renderFaq(site) {
  const faq = asArray(site.faq);
  if (faq.length === 0) {
    return `<div class="state-card"><h2>Sin preguntas frecuentes</h2><p>Aqui veras respuestas utiles cuando cargues el contenido en el admin.</p></div>`;
  }

  return `
    <div class="faq">
      ${faq
        .map(
          (item) => `
            <details>
              <summary>${escapeHtml(item.question)}</summary>
              <div class="answer">${escapeHtml(item.answer)}</div>
            </details>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSections(site, sections, title, description) {
  if (!sections || sections.length === 0) {
    return "";
  }

    return `
      <section class="section section-anchor">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(title)}</h2>
            ${description ? `<p>${escapeHtml(description)}</p>` : ""}
          </div>
      </div>
      <div class="grid-2">
        ${sections
          .map(
            (section) => `
              <article class="info-panel">
                <h3 style="margin:0 0 8px">${escapeHtml(section.title || "Seccion")}</h3>
                ${section.subtitle ? `<p class="card-copy">${escapeHtml(section.subtitle)}</p>` : ""}
                ${sectionBody(section)}
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTrustStrip(site) {
  const settings = site?.settings || {};
  const company = site?.company || {};
  const items = [
    {
      title: "Compra segura",
      text: "Tu información y tu pago se gestionan desde el backend.",
    },
    {
      title: "Sorteos visibles",
      text: `${asArray(site.activeRaffles).length} sorteos activos en la landing.`,
    },
    {
      title: "Videos publicados",
      text: `${asArray(site.winnerVideos).length} videos visibles publicados.`,
    },
    {
      title: "Atención directa",
      text: settings.whatsappNumber || company.whatsapp_number ? `WhatsApp: ${settings.whatsappNumber || company.whatsapp_number}` : "Soporte por WhatsApp",
    },
  ];

  return `
    <section class="section shell trust-strip">
      ${items
        .map(
          (item) => `
            <div class="trust-item">
              <div class="trust-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M12 3 5 6v5c0 4.9 3.2 8.7 7 10 3.8-1.3 7-5.1 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.text)}</span>
              </div>
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderHowItWorks() {
  const steps = [
    ["Escoge tus números", "Selecciona los números que más te gusten."],
    ["Realiza el pago", "Paga por el medio que prefieras."],
    ["Env·a comprobante", "Sube el soporte desde WhatsApp."],
    ["Recibe tu boleta", "La boleta queda lista para seguimiento."],
  ];

  return `
    <section class="section shell section-anchor how-it-works-section" id="como-participar">
      <div class="how-it-works-panel">
        <div class="section-head how-it-works-head">
          <div>
            <span class="section-kicker">Proceso simple</span>
            <h2>Compra en menos de 2 minutos</h2>
            <p>Una ruta clara y rápida para pasar de ver el sorteo a tener tu boleta registrada.</p>
          </div>
          <div class="how-it-works-note">Selecciona, paga y recibe seguimiento</div>
        </div>
        <div class="how-it-works-track">
          ${steps
            .map(
              ([title, text], index) => `
                <article class="step-card premium-step">
                  <div class="step-card-top">
                    <div class="step-number">${index + 1}</div>
                    ${index < steps.length - 1 ? '<span class="step-connector"></span>' : ""}
                  </div>
                  <strong>${escapeHtml(title)}</strong>
                  <p>${escapeHtml(text)}</p>
                </article>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function getRetailProductImage(product = {}) {
  const gallery = getRetailProductGallery(product);
  if (gallery.length > 0) {
    return gallery[0];
  }

  return (
    product?.imageUrl
    || product?.image_url
    || product?.coverImageUrl
    || product?.cover_image_url
    || ASSETS.raffle
  );
}

function getRetailProductGallery(product = {}) {
  const rawGallery = asArray(product?.gallery || product?.gallery_json || product?.images);
  const gallery = rawGallery
    .map((item) => {
      if (!item) {
        return "";
      }
      if (typeof item === "string") {
        return item.trim();
      }
      if (typeof item === "object") {
        return String(
          item.imageUrl
          || item.image_url
          || item.url
          || item.src
          || item.value
          || "",
        ).trim();
      }
      return String(item || "").trim();
    })
    .filter(Boolean);

  const fallback = (
    product?.imageUrl
    || product?.image_url
    || product?.coverImageUrl
    || product?.cover_image_url
    || ASSETS.raffle
  );

  return gallery.length ? Array.from(new Set(gallery)) : [fallback];
}

function getRetailProductKey(product = {}) {
  return String(product?.id || product?.slug || product?.sku || product?.name || "").trim();
}

function getRetailProductActiveImage(product = {}) {
  const gallery = getRetailProductGallery(product);
  const productKey = getRetailProductKey(product);
  if (!productKey || gallery.length <= 1) {
    return gallery[0] || ASSETS.raffle;
  }

  const currentIndex = retailUiState.imageIndexByProductId[productKey] || 0;
  const normalizedIndex = ((Number(currentIndex) || 0) % gallery.length + gallery.length) % gallery.length;
  return gallery[normalizedIndex] || gallery[0] || ASSETS.raffle;
}

function getRetailProductSummary(product = {}) {
  return String(
    product?.description
    || product?.descriptionText
    || product?.details
    || product?.summary
    || "Producto disponible en la vitrina virtual.",
  ).trim();
}

function getRetailProductHighlights(product = {}) {
  const stockValue = Number(product?.stock || product?.inventory || 0);
  const items = [
    product?.category_name || product?.categoryName ? `Categoria: ${product.category_name || product.categoryName}` : "",
    product?.sku ? `SKU: ${product.sku}` : "",
    stockValue > 0 ? `Disponible: ${stockValue}` : "",
    product?.price ? `Precio: ${getRetailProductPrice(product)}` : "",
  ];
  return items.filter(Boolean);
}

function getRetailCartStorageKey(slug = "") {
  return `retail-cart:v1:${normalizeSlug(slug)}`;
}

function loadRetailCart(slug = "") {
  try {
    const raw = window.localStorage.getItem(getRetailCartStorageKey(slug));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRetailCart(slug = "", itemsByKey = {}) {
  try {
    window.localStorage.setItem(getRetailCartStorageKey(slug), JSON.stringify(itemsByKey || {}));
  } catch {
    // ignore
  }
}

function getRetailCartItems() {
  return Object.entries(retailCartState.itemsByKey || {})
    .map(([key, entry]) => {
      const quantity = Math.max(0, Number(entry?.quantity || 0));
      return {
        key,
        productId: entry?.productId || null,
        quantity,
      };
    })
    .filter((item) => item.productId && item.quantity > 0);
}

function getRetailCartCount() {
  return getRetailCartItems().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function updateRetailCartBadge() {
  const badge = app.querySelector("[data-retail-cart-count]");
  if (badge) {
    badge.textContent = String(getRetailCartCount());
  }
}

function getRetailCartProduct(site = {}, cartItem = {}) {
  const products = asArray(site?.products);
  return products.find((product) => String(product?.id) === String(cartItem.productId)) || null;
}

function getRetailCartSubtotal(site = {}) {
  return getRetailCartItems().reduce((sum, item) => {
    const product = getRetailCartProduct(site, item);
    const price = Number(product?.price || 0);
    return sum + (price * Number(item.quantity || 0));
  }, 0);
}

function addRetailProductToCart(product = {}, quantity = 1) {
  const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
  const key = getRetailProductKey(product);
  if (!key || !product?.id) {
    return;
  }

  const current = Number(retailCartState.itemsByKey[key]?.quantity || 0);
  retailCartState.itemsByKey[key] = {
    productId: product.id,
    quantity: Math.max(1, current + Number(quantity || 1)),
  };
  saveRetailCart(slug, retailCartState.itemsByKey);
  window.__PUBLIC_RETAIL_CART__ = getRetailCartItems();
  updateRetailCartBadge();
  paintRetailCartModal();
}

function setRetailCartQuantity(productId, quantity) {
  const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
  const products = asArray(window.__PUBLIC_SITE_STATE__?.products);
  const product = products.find((item) => String(item?.id) === String(productId)) || null;
  if (!product) {
    return;
  }

  const key = getRetailProductKey(product);
  const normalized = Math.max(0, Math.trunc(Number(quantity || 0)));
  if (normalized <= 0) {
    delete retailCartState.itemsByKey[key];
  } else {
    retailCartState.itemsByKey[key] = {
      productId: product.id,
      quantity: normalized,
    };
  }
  saveRetailCart(slug, retailCartState.itemsByKey);
  window.__PUBLIC_RETAIL_CART__ = getRetailCartItems();
  updateRetailCartBadge();
  paintRetailCartModal();
}

function removeRetailCartItem(productId) {
  setRetailCartQuantity(productId, 0);
}

function openRetailCheckoutModal(method = "PSE") {
  retailCheckoutState.open = true;
  retailCheckoutState.paymentMethod = method === "COMPROBANTE" ? "COMPROBANTE" : "PSE";
  retailCheckoutState.notice = "";
  retailCheckoutState.noticeTone = "info";
  paintRetailCheckoutModal();
}

function closeRetailCheckoutModal() {
  retailCheckoutState.open = false;
  retailCheckoutState.loading = false;
  paintRetailCheckoutModal();
}

function setRetailCheckoutField(field, value) {
  if (field in retailCheckoutState) {
    retailCheckoutState[field] = String(value || "");
  }
}

function getRetailDeliveryFeeAmount(mode = "pickup", storefront = null) {
  const normalized = String(mode || "pickup").trim().toLowerCase();
  const config = storefront || window.__PUBLIC_SITE_STATE__?.storefront || {};
  if (normalized === "express") return Number(config.deliveryFeeExpress ?? config.delivery_fee_express ?? 12000) || 0;
  if (normalized === "domicilio" || normalized === "delivery") return Number(config.deliveryFeeStandard ?? config.delivery_fee_standard ?? 8000) || 0;
  return 0;
}

function getRetailDeliveryModeLabel(mode = "pickup") {
  const normalized = String(mode || "pickup").trim().toLowerCase();
  if (normalized === "express") return "Domicilio express";
  if (normalized === "domicilio" || normalized === "delivery") return "Domicilio";
  return "Recoger en tienda";
}

function setRetailProductImageIndex(productKey, nextIndex) {
  const key = String(productKey || "").trim();
  if (!key) {
    return;
  }

  retailUiState.imageIndexByProductId[key] = Number(nextIndex) || 0;
}

function stepRetailProductImage(productKey, direction = 1, total = 0) {
  const key = String(productKey || "").trim();
  if (!key || total < 2) {
    return;
  }

  const currentIndex = retailUiState.imageIndexByProductId[key] || 0;
  const nextIndex = ((Number(currentIndex) || 0) + Number(direction || 1)) % total;
  retailUiState.imageIndexByProductId[key] = nextIndex < 0 ? nextIndex + total : nextIndex;
}

function renderRetailProductGallery(product = {}) {
  const gallery = getRetailProductGallery(product);
  const productKey = getRetailProductKey(product);
  const currentIndex = productKey && gallery.length > 1
    ? ((Number(retailUiState.imageIndexByProductId[productKey]) || 0) % gallery.length + gallery.length) % gallery.length
    : 0;

  if (gallery.length <= 1) {
    return `
      <div role="button" tabindex="0" class="raffle-card-media retail-gallery-media" data-action="open-retail-product-modal" data-product-key="${escapeAttr(productKey)}" style="position:relative; aspect-ratio: 1.02; background: linear-gradient(180deg, rgba(8,25,47,0.04), rgba(8,25,47,0.02)); overflow:hidden; border:0; padding:0; width:100%; cursor: zoom-in; display:block;">
        <img src="${escapeHtml(gallery[0] || ASSETS.raffle)}" alt="${escapeHtml(product.name || product.title || "Producto")}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;" />
      </div>
    `;
  }

  const currentImage = gallery[currentIndex] || gallery[0] || ASSETS.raffle;
  return `
    <div role="button" tabindex="0" class="raffle-card-media retail-gallery-media" data-action="open-retail-product-modal" data-product-key="${escapeAttr(productKey)}" style="aspect-ratio: 1.02; position: relative; overflow: hidden; background: linear-gradient(180deg, rgba(8,25,47,0.04), rgba(8,25,47,0.02)); border:0; padding:0; width:100%; cursor: zoom-in; display:block;">
      <img src="${escapeHtml(currentImage)}" alt="${escapeHtml(product.name || product.title || "Producto")}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;" />
      <div style="position:absolute; inset: 12px 12px auto 12px; display:flex; justify-content:space-between; gap: 10px; align-items:flex-start; z-index: 2; pointer-events:none;">
        <div style="display:inline-flex; align-items:center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: rgba(8,25,47,0.84); color: #fff; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; box-shadow: 0 10px 18px rgba(8,25,47,0.12);">
          ${gallery.length} fotos
        </div>
        <button
          type="button"
          class="button secondary"
          data-action="retail-product-image-next"
          data-product-key="${escapeAttr(productKey)}"
          data-gallery-total="${escapeAttr(String(gallery.length))}"
          style="pointer-events:auto; padding: 10px 14px; border-radius: 999px; background: rgba(255,255,255,0.94); border-color: rgba(8,25,47,0.08); color: #0f172a; font-weight: 900; box-shadow: 0 10px 22px rgba(8,25,47,0.12);"
        >
          Correr imágenes
        </button>
      </div>
      <div style="position:absolute; inset:auto 12px 12px 12px; z-index: 2; display:grid; gap: 10px;">
        <div style="display:flex; gap: 8px; overflow:auto; padding-bottom: 2px;">
          ${gallery.map((imageUrl, index) => `
            <button
              type="button"
              data-action="retail-product-image-set"
              data-product-key="${escapeAttr(productKey)}"
              data-image-index="${escapeAttr(String(index))}"
              aria-label="Ver imagen ${index + 1}"
              aria-pressed="${index === currentIndex ? "true" : "false"}"
              style="width: 48px; height: 48px; flex: 0 0 auto; border-radius: 14px; overflow: hidden; padding: 0; border: 1px solid ${index === currentIndex ? "rgba(255,214,102,0.9)" : "rgba(255,255,255,0.18)"}; box-shadow: 0 10px 18px rgba(8,25,47,0.16); background: rgba(255,255,255,0.08);"
            >
              <img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" />
            </button>
          `).join("")}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 10px 12px; border-radius: 18px; background: rgba(8,25,47,0.72); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); color: #fff;">
          <button
            type="button"
            class="button secondary"
            data-action="retail-product-image-prev"
            data-product-key="${escapeAttr(productKey)}"
            data-gallery-total="${escapeAttr(String(gallery.length))}"
            style="min-width: 88px; justify-content:center; padding: 9px 12px; border-radius: 999px; background: rgba(255,255,255,0.9); border-color: transparent; color: #0f172a; font-weight: 900;"
          >
            Anterior
          </button>
          <span style="font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.84);">${currentIndex + 1}/${gallery.length}</span>
          <button
            type="button"
            class="button secondary"
            data-action="retail-product-image-next"
            data-product-key="${escapeAttr(productKey)}"
            data-gallery-total="${escapeAttr(String(gallery.length))}"
            style="min-width: 88px; justify-content:center; padding: 9px 12px; border-radius: 999px; background: rgba(255,255,255,0.9); border-color: transparent; color: #0f172a; font-weight: 900;"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  `;
}

function openRetailProductModal(product = {}) {
  ensureRetailModalStyles();
  const modal = document.getElementById("retail-product-modal");
  const frame = document.getElementById("retail-product-modal-frame");
  const title = document.getElementById("retail-product-modal-title");
  const subtitle = document.getElementById("retail-product-modal-subtitle");
  const summary = document.getElementById("retail-product-modal-summary");
  const action = document.getElementById("retail-product-modal-action");
  const badges = document.getElementById("retail-product-modal-badges");

  if (!modal || !frame || !title || !subtitle || !summary || !action || !badges) {
    return;
  }

  const gallery = getRetailProductGallery(product);
  const currentImage = getRetailProductActiveImage(product);
  const productKey = getRetailProductKey(product);
  const currentIndex = productKey && gallery.length > 1
    ? ((Number(retailUiState.imageIndexByProductId[productKey]) || 0) % gallery.length + gallery.length) % gallery.length
    : 0;
  const storefront = window.__PUBLIC_SITE_STATE__?.storefront || {};
  const contactLink = buildRetailWhatsAppLink(storefront, product);
  const productName = String(product.name || product.title || "Producto").trim();
  const price = getRetailProductPrice(product);
  const highlights = getRetailProductHighlights(product);

  title.textContent = productName;
  subtitle.textContent = gallery.length > 1 ? `${gallery.length} imágenes disponibles` : "Imagen del producto";
  summary.textContent = getRetailProductSummary(product);
  badges.innerHTML = highlights.length
    ? highlights.map((item) => `<span class="chip" style="background:#f8fafc; border-color: rgba(8,25,47,0.08);">${escapeHtml(item)}</span>`).join("")
    : "";
  action.innerHTML = contactLink
    ? `
      <div style="display:grid; gap: 10px;">
        <button type="button" class="button gold" data-action="retail-add-to-cart" data-product-key="${escapeAttr(productKey)}" style="width:100%; justify-content:center;">Agregar al carrito</button>
        <a class="button secondary" href="${escapeHtml(contactLink)}" target="_blank" rel="noreferrer" style="width:100%; justify-content:center;">Pedir por WhatsApp</a>
      </div>
    `
    : `<button type="button" class="button gold" data-action="retail-add-to-cart" data-product-key="${escapeAttr(productKey)}" style="width:100%; justify-content:center;">Agregar al carrito</button>`;

  frame.innerHTML = `
    <div class="retail-modal-shell" style="display:grid; gap: 14px; min-height: 0;">
      <div class="retail-modal-zoomable" style="position:relative; border-radius: 28px; overflow:hidden; background: radial-gradient(circle at top left, rgba(214,161,62,0.18), transparent 32%), linear-gradient(180deg, rgba(8,25,47,0.04), rgba(8,25,47,0.02)); border: 1px solid rgba(8,25,47,0.08); box-shadow: 0 28px 60px rgba(8,25,47,0.18); max-height: min(44vh, 420px); padding: 10px; box-sizing: border-box;">
        <img data-retail-main-image src="${escapeHtml(currentImage)}" alt="${escapeHtml(productName)}" loading="eager" decoding="async" style="width:100%;height:100%;max-height: min(44vh, 420px);object-fit:contain;object-position:center center;display:block;transition: opacity 220ms ease, filter 220ms ease; opacity:1; background: transparent;" />
        <div style="position:absolute; inset: 16px 16px auto 16px; display:flex; justify-content:space-between; gap: 10px; align-items:center;">
          <div style="display:inline-flex; align-items:center; gap: 8px; padding: 9px 12px; border-radius: 999px; background: rgba(8,25,47,0.9); color: #fff; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; box-shadow: 0 12px 24px rgba(8,25,47,0.16);">Vitrina premium</div>
          <div style="display:flex; align-items:center; gap: 8px;">
            <div data-retail-image-counter style="display:inline-flex; align-items:center; gap: 8px; padding: 9px 12px; border-radius: 999px; background: rgba(255,255,255,0.96); color: #0f172a; font-size: 12px; font-weight: 900; box-shadow: 0 12px 24px rgba(8,25,47,0.12);">${currentIndex + 1}/${gallery.length}</div>
            <div style="display:inline-flex; align-items:center; gap: 8px; padding: 9px 12px; border-radius: 999px; background: rgba(255,255,255,0.96); color: #0f172a; font-size: 12px; font-weight: 900; box-shadow: 0 12px 24px rgba(8,25,47,0.12);">${escapeHtml(price)}</div>
          </div>
        </div>
        ${gallery.length > 1 ? `
          <button type="button" class="retail-modal-nav retail-modal-nav-left" data-action="retail-product-image-prev" data-product-key="${escapeAttr(productKey)}" aria-label="Imagen anterior">·</button>
          <button type="button" class="retail-modal-nav retail-modal-nav-right" data-action="retail-product-image-next" data-product-key="${escapeAttr(productKey)}" aria-label="Imagen siguiente">·</button>
        ` : ""}
      </div>
      ${gallery.length > 1 ? `
      <div style="display:flex; gap: 10px; overflow:auto; padding-bottom: 2px;">
        ${gallery.map((imageUrl, index) => `
          <button
            type="button"
            data-action="retail-product-image-set"
            data-product-key="${escapeAttr(productKey)}"
            data-image-index="${escapeAttr(String(index))}"
            aria-label="Ver imagen ${index + 1}"
            aria-pressed="${imageUrl === currentImage ? "true" : "false"}"
            style="width: 72px; height: 72px; flex: 0 0 auto; border-radius: 20px; overflow: hidden; padding: 0; border: 2px solid ${imageUrl === currentImage ? "rgba(214,161,62,0.98)" : "rgba(8,25,47,0.10)"}; box-shadow: 0 12px 20px rgba(8,25,47,0.12); background: #fff; transform: ${imageUrl === currentImage ? "translateY(-2px)" : "translateY(0)"}; transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;"
          >
            <img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" />
          </button>
        `).join("")}
      </div>
      ` : ""}
    </div>
  `;

  const mainImage = frame.querySelector("[data-retail-main-image]");
  if (mainImage) {
    mainImage.addEventListener("mouseenter", () => {
      mainImage.style.filter = "saturate(1.02) contrast(1.02)";
    });
    mainImage.addEventListener("mouseleave", () => {
      mainImage.style.filter = "";
    });
  }

  if (gallery.length > 1) {
    const counter = frame.querySelector("[data-retail-image-counter]");
    if (counter) {
      counter.textContent = `${currentIndex + 1}/${gallery.length}`;
    }
  }

  modal.classList.add("is-open");
  document.body.classList.add("modal-open");
  window.__PUBLIC_RETAIL_MODAL__ = product;
}

function closeRetailProductModal() {
  const modal = document.getElementById("retail-product-modal");
  const frame = document.getElementById("retail-product-modal-frame");
  const action = document.getElementById("retail-product-modal-action");
  const badges = document.getElementById("retail-product-modal-badges");

  if (modal) {
    modal.classList.remove("is-open");
  }
  if (frame) {
    frame.innerHTML = "";
  }
  if (action) {
    action.innerHTML = "";
  }
  if (badges) {
    badges.innerHTML = "";
  }
  document.body.classList.remove("modal-open");
  window.__PUBLIC_RETAIL_MODAL__ = null;
}

function renderRetailCartModalContent() {
  const site = window.__PUBLIC_SITE_STATE__?.site || null;
  const products = asArray(site?.products);
  const items = getRetailCartItems();
  const subtotal = getRetailCartSubtotal(site);
  const count = getRetailCartCount();
  const currency = window.__PUBLIC_SITE_STATE__?.storefront?.currency || "COP";

  if (!count) {
    return `
      <div class="state-card" style="padding: 24px; border-radius: 24px; border: 1px solid rgba(8,25,47,0.08); background:#fff;">
        <div style="display:grid; gap: 10px;">
          <div class="section-tag">Carrito vacío</div>
          <h3 style="margin:0;">Aun no has agregado productos</h3>
          <p style="margin:0; color:#526074;">Agrega uno o varios productos para continuar con el pago.</p>
          <button type="button" class="button gold" data-action="close-retail-cart">Seguir comprando</button>
        </div>
      </div>
    `;
  }

  return `
    <div style="display:grid; gap: 16px;">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 16px;">
        <div>
          <div class="section-tag">Mi carrito</div>
          <h3 style="margin:10px 0 0;">${count} producto${count === 1 ? "" : "s"} en tu compra</h3>
          <p style="margin:8px 0 0; color:#526074;">Revisa cantidades antes de pasar al checkout.</p>
        </div>
        <div style="display:inline-flex; align-items:center; gap: 10px; padding: 12px 16px; border-radius: 18px; background: linear-gradient(135deg, #08192f, #1d5f46); color:#fff; box-shadow: 0 14px 30px rgba(8,25,47,0.16);">
          <span style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.82;">Subtotal</span>
          <strong style="font-size:1.15rem;">${escapeHtml(formatCOP(subtotal))}</strong>
        </div>
      </div>
      <div style="display:grid; gap: 12px; max-height: min(56vh, 480px); overflow:auto; padding-right: 4px;">
        ${items.map((item) => {
          const product = getRetailCartProduct({ products }, item);
          if (!product) {
            return "";
          }
          const image = getRetailProductActiveImage(product);
          const lineTotal = Number(product.price || 0) * Number(item.quantity || 0);
          return `
            <article style="display:grid; grid-template-columns: 76px 1fr auto; gap: 12px; padding: 12px; border-radius: 18px; background:#fff; border: 1px solid rgba(8,25,47,0.08); box-shadow: 0 12px 22px rgba(8,25,47,0.06);">
              <div style="width:76px; height:76px; border-radius: 18px; overflow:hidden; background:#f8fafc;">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name || "Producto")}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;" />
              </div>
              <div style="min-width:0;">
                <strong style="display:block; font-size:1rem; color:#0f172a;">${escapeHtml(product.name || "Producto")}</strong>
                <div style="margin-top:4px; color:#526074; font-size: 13px;">${escapeHtml(formatCOP(product.price || 0))} c/u</div>
                <div style="margin-top:8px; display:flex; gap: 8px; flex-wrap: wrap; align-items:center;">
                  <button type="button" class="button secondary" data-action="retail-cart-decrease" data-product-id="${escapeAttr(String(product.id))}">-</button>
                  <strong style="min-width: 32px; text-align:center;">${item.quantity}</strong>
                  <button type="button" class="button secondary" data-action="retail-cart-increase" data-product-id="${escapeAttr(String(product.id))}">+</button>
                  <button type="button" class="button secondary" data-action="retail-cart-remove" data-product-id="${escapeAttr(String(product.id))}" style="margin-left: 6px;">Quitar</button>
                </div>
              </div>
              <div style="text-align:right; font-weight:900; color:#0f172a;">${escapeHtml(formatCOP(lineTotal))}</div>
            </article>
          `;
        }).join("")}
      </div>
      <div style="display:flex; justify-content:space-between; gap: 12px; align-items:center; padding-top: 6px; border-top: 1px solid rgba(8,25,47,0.08);">
        <div style="color:#526074;">Total estimado</div>
        <strong style="font-size:1.4rem; color:#0f172a;">${escapeHtml(formatCOP(subtotal))}</strong>
      </div>
      <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
        <button type="button" class="button gold" data-action="open-retail-checkout" data-payment-method="PSE">Pagar con PSE</button>
        <button type="button" class="button secondary" data-action="open-retail-checkout" data-payment-method="COMPROBANTE">Subir comprobante</button>
      </div>
      <button type="button" class="button secondary" data-action="close-retail-cart">Seguir comprando</button>
    </div>
  `;
}

function paintRetailCartModal() {
  const modal = document.getElementById("retail-cart-modal");
  const content = document.getElementById("retail-cart-modal-content");
  if (!modal || !content) {
    return;
  }
  content.innerHTML = renderRetailCartModalContent();
  modal.classList.toggle("is-open", Boolean(window.__PUBLIC_RETAIL_CART_MODAL_OPEN__));
  modal.setAttribute("aria-hidden", window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ ? "false" : "true");
  document.body.classList.toggle("modal-open", Boolean(window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ || retailCheckoutState.open || retailCheckoutState.openReceipt));
}

function openRetailCartModal() {
  window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ = true;
  paintRetailCartModal();
}

function closeRetailCartModal() {
  window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ = false;
  paintRetailCartModal();
}

function renderRetailCheckoutModalContent() {
  const site = window.__PUBLIC_SITE_STATE__?.site || null;
  const storefront = window.__PUBLIC_SITE_STATE__?.storefront || {};
  const items = getRetailCartItems();
  const subtotal = getRetailCartSubtotal(site);
  const count = getRetailCartCount();
  const deliveryFee = getRetailDeliveryFeeAmount(retailCheckoutState.deliveryMode, storefront);
  const total = subtotal + deliveryFee;
  const currency = storefront.currency || "COP";
  const isPickup = retailCheckoutState.deliveryMode === "pickup";
  const isStandard = retailCheckoutState.deliveryMode === "domicilio" || retailCheckoutState.deliveryMode === "delivery";
  const isExpress = retailCheckoutState.deliveryMode === "express";
  const notice = retailCheckoutState.notice
    ? `<div class="payment-modal-notice payment-modal-notice-${escapeHtml(retailCheckoutState.noticeTone || "info")}" style="margin-bottom:14px;">${escapeHtml(retailCheckoutState.notice)}</div>`
    : "";

  return `
    <div class="payment-modal-head">
      <div class="payment-modal-head-copy">
        <div class="section-tag">Checkout premium</div>
        <h3 style="margin-top:10px;">Finaliza tu compra</h3>
        <p>Completa tus datos para pagar por PSE o subir el comprobante.</p>
      </div>
      <button type="button" class="selector-close" data-action="close-retail-checkout">Cerrar</button>
    </div>

    ${notice}

    <div style="display:grid; gap: 16px;">
      <div style="display:grid; grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr); gap: 16px; align-items:start;">
        <div style="padding: 18px; border-radius: 28px; background: linear-gradient(135deg, rgba(8,25,47,0.98), rgba(29,95,70,0.94)); color:#fff; box-shadow: 0 24px 56px rgba(8,25,47,0.18); border: 1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 16px; flex-wrap: wrap;">
            <div>
              <div style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background: rgba(255,214,102,0.14); color:#ffd766; font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase;">Resumen ejecutivo</div>
              <h4 style="margin:12px 0 0; font-size: 1.8rem; line-height:1.02;">${count} producto${count === 1 ? "" : "s"} en tu carrito</h4>
              <p style="margin:10px 0 0; max-width: 48ch; color: rgba(255,255,255,0.82); line-height:1.6;">Revisa el total con domicilio y confirma tu compra en un flujo claro y rápido.</p>
            </div>
            <div style="min-width: 220px; padding: 14px 16px; border-radius: 22px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08);">
              <div style="font-size: 11px; letter-spacing:.08em; text-transform:uppercase; color: rgba(255,255,255,0.68); font-weight:800;">Total final</div>
              <div style="margin-top: 8px; font-size: 2rem; font-weight: 900; line-height:1;">${escapeHtml(formatCOP(total))}</div>
              <div style="margin-top:6px; color: rgba(255,255,255,0.76); font-size: 12px;">
                ${deliveryFee > 0
                  ? `Subtotal ${escapeHtml(formatCOP(subtotal))} + ${escapeHtml(getRetailDeliveryModeLabel(retailCheckoutState.deliveryMode).toLowerCase())} ${escapeHtml(formatCOP(deliveryFee))}`
                  : `Subtotal ${escapeHtml(formatCOP(subtotal))} · sin costo de env·o`}
              </div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 16px;">
            <div style="padding: 12px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing:.08em; font-weight:800;">Pago seguro</div>
              <strong style="display:block; margin-top:6px;">PSE o comprobante</strong>
            </div>
            <div style="padding: 12px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing:.08em; font-weight:800;">Despacho</div>
              <strong style="display:block; margin-top:6px;">Con domicilio</strong>
            </div>
            <div style="padding: 12px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing:.08em; font-weight:800;">Atención</div>
              <strong style="display:block; margin-top:6px;">Confirmación inmediata</strong>
            </div>
          </div>
          <div style="margin-top: 16px; display:flex; flex-wrap:wrap; gap: 8px;">
            ${items.map((item) => {
              const product = getRetailCartProduct(site, item);
              return product ? `<span class="chip" style="background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.10); color:#fff;">${escapeHtml(product.name)} x${item.quantity}</span>` : "";
            }).join("")}
          </div>
        </div>

        <div style="display:grid; gap: 14px;">
          <div class="payment-action-card payment-contact-card" style="border-radius: 26px;">
            <div class="payment-action-icon payment-action-icon-contact"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M20 18.5c-1.4-1.2-3.1-1.9-5-2.3l-1.1 2.2H10l-1.1-2.2c-1.9.4-3.6 1.1-5 2.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="9" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M7.2 20a8.9 8.9 0 0 1 9.6 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
            <div class="payment-card-copy">
              <span class="payment-card-kicker">Datos del comprador</span>
              <strong>Completa tus datos</strong>
              <p>Necesitamos tus datos para registrar la orden y enviarte la confirmación.</p>
            </div>
            <div class="payment-form-grid">
              <label class="payment-field">
                <span>Nombre</span>
                <input type="text" data-retail-field="customerName" value="${escapeAttr(retailCheckoutState.customerName || "")}" placeholder="Ej. Laura P·rez" />
              </label>
              <label class="payment-field">
                <span>Teléfono</span>
                <input type="tel" data-retail-field="customerPhone" value="${escapeAttr(retailCheckoutState.customerPhone || "")}" placeholder="Ej. 3001234567" />
              </label>
              <label class="payment-field">
                <span>Correo</span>
                <input type="email" data-retail-field="customerEmail" value="${escapeAttr(retailCheckoutState.customerEmail || "")}" placeholder="Ej. correo@cliente.com" />
              </label>
              <label class="payment-field">
                <span>Dirección</span>
                <input type="text" data-retail-field="customerAddress" value="${escapeAttr(retailCheckoutState.customerAddress || "")}" placeholder="Ej. Calle 10 # 5-20" />
              </label>
              <label class="payment-field">
                <span>Ciudad</span>
                <input type="text" data-retail-field="customerCity" value="${escapeAttr(retailCheckoutState.customerCity || "")}" placeholder="Ej. Neiva" />
              </label>
              <label class="payment-field">
                <span>Nota</span>
                <input type="text" data-retail-field="note" value="${escapeAttr(retailCheckoutState.note || "")}" placeholder="Observaciones del pedido" />
              </label>
            </div>
          </div>

          <div class="payment-action-card" style="border-radius: 26px;">
            <div class="payment-action-icon payment-action-icon-upload"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M12 16V6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 9.5 12 6l3.5 3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="payment-card-copy">
              <span class="payment-card-kicker">Costo de env·o</span>
              <strong>Agrega domicilio al total</strong>
              <p>Si el pedido requiere entrega, digita el valor del env·o. Si lo recoge en tienda, d·jalo en cero.</p>
            </div>
            <div style="display:grid; gap:10px;">
              <button type="button" class="button secondary" data-action="set-retail-delivery-mode" data-delivery-mode="pickup" style="justify-content:space-between; display:flex; align-items:center; border-color:${isPickup ? "rgba(214,161,62,0.9)" : "rgba(8,25,47,0.12)"}; box-shadow:${isPickup ? "0 10px 22px rgba(214,161,62,0.12)" : "none"};">
                <span>Recoger en tienda</span>
                <strong>${escapeHtml(formatCOP(getRetailDeliveryFeeAmount("pickup", storefront)))}</strong>
              </button>
              <button type="button" class="button secondary" data-action="set-retail-delivery-mode" data-delivery-mode="domicilio" style="justify-content:space-between; display:flex; align-items:center; border-color:${isStandard ? "rgba(214,161,62,0.9)" : "rgba(8,25,47,0.12)"}; box-shadow:${isStandard ? "0 10px 22px rgba(214,161,62,0.12)" : "none"};">
                <span>Domicilio</span>
                <strong>${escapeHtml(formatCOP(getRetailDeliveryFeeAmount("domicilio", storefront)))}</strong>
              </button>
              <button type="button" class="button secondary" data-action="set-retail-delivery-mode" data-delivery-mode="express" style="justify-content:space-between; display:flex; align-items:center; border-color:${isExpress ? "rgba(214,161,62,0.9)" : "rgba(8,25,47,0.12)"}; box-shadow:${isExpress ? "0 10px 22px rgba(214,161,62,0.12)" : "none"};">
                <span>Domicilio express</span>
                <strong>${escapeHtml(formatCOP(getRetailDeliveryFeeAmount("express", storefront)))}</strong>
              </button>
            </div>
            <div style="margin-top:8px; font-size:12px; color:${isPickup ? "#0f172a" : "#526074"}; font-weight:${isPickup ? "900" : "600"};">Opción activa: ${escapeHtml(getRetailDeliveryModeLabel(retailCheckoutState.deliveryMode))}</div>
          </div>

          <div class="payment-action-card" style="border-radius: 26px;">
            <div class="payment-action-icon payment-action-icon-upload"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M12 16V6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 9.5 12 6l3.5 3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="payment-card-copy">
              <span class="payment-card-kicker">Método de pago</span>
              <strong>Elige cómo quieres pagar</strong>
              <p>PSE abre la pasarela y comprobante deja la orden pendiente de revisión.</p>
            </div>
            <div style="display:grid; gap:10px;">
              <button type="button" class="button gold" data-action="submit-retail-checkout" data-payment-method="PSE" ${retailCheckoutState.loading ? "disabled" : ""}>Pagar con PSE</button>
              <button type="button" class="button secondary" data-action="submit-retail-checkout" data-payment-method="COMPROBANTE" ${retailCheckoutState.loading ? "disabled" : ""}>Subir comprobante</button>
            </div>
            <button type="button" class="button secondary payment-back" data-action="close-retail-checkout">Volver al carrito</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function paintRetailCheckoutModal() {
  const modal = document.getElementById("retail-checkout-modal");
  const content = document.getElementById("retail-checkout-modal-content");
  if (!modal || !content) {
    return;
  }
  content.innerHTML = renderRetailCheckoutModalContent();
  modal.classList.toggle("is-open", retailCheckoutState.open);
  modal.setAttribute("aria-hidden", retailCheckoutState.open ? "false" : "true");
  document.body.classList.toggle("modal-open", Boolean(window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ || retailCheckoutState.open || retailCheckoutState.openReceipt));
}

function openRetailCheckoutFromCart(paymentMethod = "PSE") {
  if (!getRetailCartCount()) {
    return;
  }
  retailCheckoutState.paymentMethod = paymentMethod === "COMPROBANTE" ? "COMPROBANTE" : "PSE";
  retailCheckoutState.deliveryMode = "pickup";
  retailCheckoutState.notice = "";
  retailCheckoutState.noticeTone = "info";
  retailCheckoutState.open = true;
  window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ = false;
  paintRetailCartModal();
  paintRetailCheckoutModal();
}

function closeRetailCheckout() {
  retailCheckoutState.open = false;
  retailCheckoutState.openReceipt = false;
  retailCheckoutState.loading = false;
  paintRetailCheckoutModal();
}

function renderRetailReceiptModalContent() {
  const order = retailCheckoutState.order || null;
  const notice = retailCheckoutState.notice
    ? `<div class="payment-modal-notice payment-modal-notice-${escapeHtml(retailCheckoutState.noticeTone || "info")}">${escapeHtml(retailCheckoutState.notice)}</div>`
    : "";
  return `
    <div class="payment-modal-head">
      <div class="payment-modal-head-copy">
        <div class="section-tag">Comprobante premium</div>
        <h3 style="margin-top:10px;">Sube tu soporte de pago</h3>
        <p>Tu orden ${escapeHtml(order?.orderReference || "")} quedó lista. Adjunta el comprobante para revisión y confirmación.</p>
      </div>
      <button type="button" class="selector-close" data-action="close-retail-checkout">Cerrar</button>
    </div>

    ${notice}

    <div style="display:grid; gap: 16px; grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr); align-items:start;">
      <div style="padding: 18px; border-radius: 28px; background: linear-gradient(135deg, rgba(8,25,47,0.98), rgba(29,95,70,0.94)); color:#fff; box-shadow: 0 24px 56px rgba(8,25,47,0.18); border: 1px solid rgba(255,255,255,0.08); display:grid; gap: 14px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 16px; flex-wrap: wrap;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background: rgba(255,214,102,0.14); color:#ffd766; font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase;">Orden lista</div>
            <h4 style="margin:12px 0 0; font-size: 1.8rem; line-height:1.02;">Referencia ${escapeHtml(order?.orderReference || "pendiente")}</h4>
            <p style="margin:10px 0 0; max-width: 48ch; color: rgba(255,255,255,0.82); line-height:1.6;">Sube el comprobante para que el equipo pueda validar tu pago y continuar con la atenci·n.</p>
          </div>
          <div style="min-width: 200px; padding: 14px 16px; border-radius: 22px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08);">
            <div style="font-size: 11px; letter-spacing:.08em; text-transform:uppercase; color: rgba(255,255,255,0.68); font-weight:800;">Estado</div>
            <div style="margin-top: 8px; font-size: 1.2rem; font-weight: 900; line-height:1;">Pendiente de revisión</div>
            <div style="margin-top:6px; color: rgba(255,255,255,0.76); font-size: 12px;">Tu comprobante quedar· asociado a esta orden.</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;">
          <div style="padding: 12px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);">
            <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing:.08em; font-weight:800;">Archivo</div>
            <strong style="display:block; margin-top:6px;">Imagen nítida</strong>
          </div>
          <div style="padding: 12px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);">
            <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing:.08em; font-weight:800;">Revisión</div>
            <strong style="display:block; margin-top:6px;">Manual por la tienda</strong>
          </div>
          <div style="padding: 12px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.06);">
            <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing:.08em; font-weight:800;">Acci·n</div>
            <strong style="display:block; margin-top:6px;">Enviar ahora</strong>
          </div>
        </div>
      </div>

      <div class="payment-action-card payment-contact-card" style="border-radius: 26px;">
        <div class="payment-action-icon payment-action-icon-upload"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1em;height:1em;display:block;"><path d="M12 16V6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 9.5 12 6l3.5 3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="payment-card-copy">
          <span class="payment-card-kicker">Adjuntar comprobante</span>
          <strong>Selecciona la imagen del pago</strong>
          <p>Sube una foto o captura clara del soporte para que podamos validar tu pago sin demoras.</p>
        </div>
        <div style="display:grid; gap: 12px;">
          <input type="file" accept="image/*" data-retail-receipt-input />
          <button type="button" class="button gold" data-action="submit-retail-receipt" ${retailCheckoutState.loading ? "disabled" : ""}>Enviar comprobante</button>
          <button type="button" class="button secondary" data-action="close-retail-checkout">Cerrar</button>
        </div>
      </div>
    </div>
  `;
}

function paintRetailReceiptModal() {
  const modal = document.getElementById("retail-receipt-modal");
  const content = document.getElementById("retail-receipt-modal-content");
  if (!modal || !content) {
    return;
  }
  content.innerHTML = renderRetailReceiptModalContent();
  modal.classList.toggle("is-open", retailCheckoutState.openReceipt);
  modal.setAttribute("aria-hidden", retailCheckoutState.openReceipt ? "false" : "true");
  document.body.classList.toggle("modal-open", Boolean(window.__PUBLIC_RETAIL_CART_MODAL_OPEN__ || retailCheckoutState.open || retailCheckoutState.openReceipt));
}

function openRetailReceiptModal(order = null) {
  retailCheckoutState.order = order;
  retailCheckoutState.openReceipt = true;
  paintRetailReceiptModal();
}

function closeRetailReceiptModal() {
  retailCheckoutState.openReceipt = false;
  retailCheckoutState.receiptFile = null;
  retailCheckoutState.receiptFileName = "";
  paintRetailReceiptModal();
}

function setRetailCheckoutNotice(message, tone = "info") {
  retailCheckoutState.notice = message;
  retailCheckoutState.noticeTone = tone;
  paintRetailCheckoutModal();
}

async function submitRetailCheckout(paymentMethod = "PSE") {
  const site = window.__PUBLIC_SITE_STATE__?.site || null;
  const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
  const items = getRetailCartItems();
  if (!site || !slug || !items.length || retailCheckoutState.loading) {
    return;
  }

  if (!String(retailCheckoutState.customerName || "").trim() || !String(retailCheckoutState.customerPhone || "").trim()) {
    setRetailCheckoutNotice("Completa nombre y teléfono para continuar.", "warning");
    return;
  }

  retailCheckoutState.loading = true;
  retailCheckoutState.paymentMethod = paymentMethod === "COMPROBANTE" ? "COMPROBANTE" : "PSE";
  paintRetailCheckoutModal();

  const payload = {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    customer_name: retailCheckoutState.customerName,
    customer_phone: retailCheckoutState.customerPhone,
    customer_email: retailCheckoutState.customerEmail,
    customer_address: retailCheckoutState.customerAddress,
    customer_city: retailCheckoutState.customerCity,
    note: retailCheckoutState.note,
    payment_method: retailCheckoutState.paymentMethod,
    delivery_fee: getRetailDeliveryFeeAmount(retailCheckoutState.deliveryMode),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/public-retail/${encodeURIComponent(slug)}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data?.message || data?.error || "No fue posible crear la orden.");
    }

    retailCheckoutState.loading = false;
    retailCheckoutState.order = data?.order || null;
    retailCheckoutState.paymentMethod = data?.payment?.method || retailCheckoutState.paymentMethod;

    if (retailCheckoutState.paymentMethod === "PSE" && data?.payment?.paymentLink) {
      window.open(data.payment.paymentLink, "_blank", "noopener,noreferrer");
      setRetailCheckoutNotice("Abrimos el enlace de PSE en una nueva pesta·a.", "success");
      retailCartState.itemsByKey = {};
      saveRetailCart(slug, retailCartState.itemsByKey);
      window.__PUBLIC_RETAIL_CART__ = getRetailCartItems();
      paintRetailCartModal();
      return;
    }

    retailCheckoutState.open = false;
    paintRetailCheckoutModal();
    openRetailReceiptModal(data?.order || null);
    retailCheckoutState.notice = "La orden quedó lista. Ahora sube el comprobante.";
    retailCheckoutState.noticeTone = "success";
    paintRetailReceiptModal();
  } catch (error) {
    retailCheckoutState.loading = false;
    paintRetailCheckoutModal();
    setRetailCheckoutNotice(error?.message || "No fue posible crear la orden.", "error");
  }
}

async function submitRetailReceiptUpload() {
  const site = window.__PUBLIC_SITE_STATE__?.site || null;
  const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
  const order = retailCheckoutState.order || null;
  const file = retailCheckoutState.receiptFile || null;
  if (!site || !slug || !order?.orderReference || !file || retailCheckoutState.loading) {
    return;
  }

  retailCheckoutState.loading = true;
  paintRetailReceiptModal();

  try {
    const formData = new FormData();
    formData.append("receipt", file, file.name || "comprobante");
    formData.append("payment_method", "COMPROBANTE");

    const response = await fetch(`${API_BASE_URL}/public-retail/${encodeURIComponent(slug)}/orders/${encodeURIComponent(order.orderReference)}/receipt`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data?.message || data?.error || "No fue posible subir el comprobante.");
    }

    retailCheckoutState.loading = false;
    retailCheckoutState.receiptFile = null;
    retailCheckoutState.receiptFileName = "";
    retailCartState.itemsByKey = {};
    saveRetailCart(slug, retailCartState.itemsByKey);
    window.__PUBLIC_RETAIL_CART__ = getRetailCartItems();
    paintRetailCartModal();
    retailCheckoutState.order = data || order;
    retailCheckoutState.notice = "Tu comprobante fue enviado a revisión.";
    retailCheckoutState.noticeTone = "success";
    paintRetailReceiptModal();
  } catch (error) {
    retailCheckoutState.loading = false;
    paintRetailReceiptModal();
    setRetailCheckoutNotice(error?.message || "No fue posible subir el comprobante.", "error");
  }
}

function ensureRetailModalStyles() {
  if (document.getElementById("retail-modal-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "retail-modal-styles";
  style.textContent = `
    .retail-modal-zoomable img {
      transition: filter 180ms ease, opacity 220ms ease;
    }
    .retail-modal-zoomable:hover img {
      filter: saturate(1.03) contrast(1.03);
    }
    .retail-modal-zoomable img.is-fading {
      opacity: 0;
    }
    .retail-modal-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 46px;
      height: 46px;
      border-radius: 999px;
      border: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(8, 25, 47, 0.88);
      color: #fff;
      font-size: 26px;
      font-weight: 900;
      line-height: 1;
      box-shadow: 0 12px 24px rgba(8, 25, 47, 0.2);
      cursor: pointer;
      z-index: 3;
    }
    .retail-modal-nav:hover {
      background: rgba(214, 161, 62, 0.96);
      color: #0f172a;
    }
    .retail-modal-nav-left {
      left: 14px;
    }
    .retail-modal-nav-right {
      right: 14px;
    }
    .retail-product-modal .video-modal-card,
    #retail-product-modal .video-modal-card {
      border-radius: 34px;
      background: linear-gradient(180deg, #ffffff 0%, #fbfbf8 100%);
      border: 1px solid rgba(8,25,47,0.08);
      box-shadow: 0 32px 80px rgba(8,25,47,0.22);
      max-height: min(90vh, 920px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #retail-cart-modal .video-modal-card,
    #retail-checkout-modal .video-modal-card,
    #retail-receipt-modal .video-modal-card {
      border-radius: 32px;
      background: linear-gradient(180deg, #ffffff 0%, #fbfbf8 100%);
      border: 1px solid rgba(8,25,47,0.08);
      box-shadow: 0 32px 80px rgba(8,25,47,0.20);
      max-height: min(90vh, 880px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #retail-checkout-modal .payment-action-card,
    #retail-checkout-modal .payment-modal-summary,
    #retail-cart-modal .state-card {
      border-radius: 24px;
    }
    #retail-product-modal .video-modal-head {
      padding-bottom: 0;
      margin-bottom: 4px;
    }
    #retail-product-modal .video-modal-frame {
      min-height: 0;
    }
    #retail-checkout-modal .video-modal-frame,
    #retail-receipt-modal .video-modal-frame {
      min-height: 0;
    }
    #retail-checkout-modal .payment-modal-head {
      margin-bottom: 2px;
    }
  `;
  document.head.appendChild(style);
}

function setRetailModalImage(product = {}, imageIndex = 0) {
  const modal = document.getElementById("retail-product-modal");
  const frame = document.getElementById("retail-product-modal-frame");
  if (!modal || !frame) {
    return;
  }

  const productKey = getRetailProductKey(product);
  const gallery = getRetailProductGallery(product);
  if (!productKey || gallery.length === 0) {
    return;
  }

  const normalizedIndex = ((Number(imageIndex) || 0) % gallery.length + gallery.length) % gallery.length;
  retailUiState.imageIndexByProductId[productKey] = normalizedIndex;

  const mainImage = frame.querySelector("[data-retail-main-image]");
  const counter = frame.querySelector("[data-retail-image-counter]");
  const thumbButtons = Array.from(frame.querySelectorAll("[data-image-index]"));
  const nextSrc = gallery[normalizedIndex] || gallery[0] || ASSETS.raffle;

  if (mainImage) {
    mainImage.classList.add("is-fading");
    window.setTimeout(() => {
      mainImage.src = nextSrc;
      mainImage.alt = String(product.name || product.title || "Producto");
      mainImage.classList.remove("is-fading");
    }, 140);
  }

  if (counter) {
    counter.textContent = `${normalizedIndex + 1}/${gallery.length}`;
  }

  thumbButtons.forEach((button) => {
    const thumbIndex = Number(button.getAttribute("data-image-index"));
    const isActive = thumbIndex === normalizedIndex;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.style.borderColor = isActive ? "rgba(214,161,62,0.98)" : "rgba(8,25,47,0.10)";
    button.style.transform = isActive ? "translateY(-2px)" : "translateY(0)";
  });

  window.__PUBLIC_RETAIL_MODAL__ = product;
}

function rerenderRetailProductModal(product = {}) {
  const site = window.__PUBLIC_SITE_STATE__?.site || null;
  const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
  if (!site || !product) {
    return;
  }

  renderRetailShell(site, slug);
  openRetailProductModal(product);
}

function stepOpenRetailProductModal(direction = 1) {
  const product = window.__PUBLIC_RETAIL_MODAL__ || null;
  if (!product) {
    return;
  }

  const productKey = getRetailProductKey(product);
  const gallery = getRetailProductGallery(product);
  if (!productKey || gallery.length < 2) {
    return;
  }

  const currentIndex = retailUiState.imageIndexByProductId[productKey] || 0;
  const nextIndex = ((Number(currentIndex) || 0) + Number(direction || 1)) % gallery.length;
  setRetailModalImage(product, nextIndex < 0 ? nextIndex + gallery.length : nextIndex);
}

function getRetailProductDescription(product = {}) {
  return String(product?.description || product?.descriptionText || "").trim();
}

function getRetailProductPrice(product = {}) {
  return formatCOP(getRetailProductValue(product));
}

function getRetailProductValue(product = {}) {
  const raw = product?.price ?? product?.unitPrice ?? product?.valor ?? 0;
  return Number(String(raw || "").replace(/[^\d.-]/g, "")) || 0;
}

function getRetailProductCompareValue(product = {}) {
  const raw = product?.compareAtPrice ?? product?.compare_at_price ?? product?.comparePrice ?? 0;
  return Number(String(raw || "").replace(/[^\d.-]/g, "")) || 0;
}

function getRetailProductOfferBadge(product = {}) {
  const price = getRetailProductValue(product);
  const comparePrice = getRetailProductCompareValue(product);
  if (comparePrice > price && price > 0) {
    return "Oferta";
  }
  return "";
}

function getRetailProductDiscountPercent(product = {}) {
  const price = getRetailProductValue(product);
  const comparePrice = getRetailProductCompareValue(product);
  if (!(comparePrice > price && price > 0)) {
    return 0;
  }
  return Math.round(((comparePrice - price) / comparePrice) * 100);
}

function getRetailOfferProducts(products = [], count = 3) {
  const list = asArray(products);
  if (!list.length) {
    return [];
  }

  const ranked = list
    .map((product, index) => {
      const price = getRetailProductValue(product);
      const comparePrice = getRetailProductCompareValue(product);
      const hasRealDiscount = comparePrice > price && price > 0;
      const score = (hasRealDiscount ? (comparePrice - price) * 100 : 0) - index;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);

  const offers = ranked.filter((product) => getRetailProductCompareValue(product) > getRetailProductValue(product));
  const source = offers;
  return source.slice(0, Math.max(1, Math.min(Number(count) || 3, source.length)));
}

function buildRetailWhatsAppLink(storefront = {}, product = null) {
  const number = String(storefront?.whatsappNumber || storefront?.whatsapp_number || "").replace(/\D/g, "");
  if (!number) {
    return "";
  }

  const title = product?.name || product?.title || storefront?.title || "el producto";
  const message = product
    ? `Hola, quiero comprar ${title}.`
    : `Hola, quiero revisar el catalogo de ${storefront?.title || "la tienda"}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function normalizeRetailSearchText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getRetailSearchableText(product = {}) {
  const pieces = [
    product?.name,
    product?.title,
    product?.sku,
    product?.description,
    product?.descriptionText,
    product?.category_name,
    product?.categoryName,
  ].filter(Boolean);

  return normalizeRetailSearchText(pieces.join(" "));
}

function getRetailFilteredProducts(products = [], categories = []) {
  const query = normalizeRetailSearchText(retailUiState.searchQuery);
  const categorySlug = normalizeRetailSearchText(retailUiState.selectedCategorySlug);
  const categoryMap = new Map(
    asArray(categories)
      .map((category) => [normalizeRetailSearchText(category?.slug || category?.name || category?.title || ""), category])
      .filter(([key]) => Boolean(key)),
  );

  return asArray(products).filter((product) => {
    const productCategorySlug = normalizeRetailSearchText(product?.category_slug || product?.categorySlug || product?.category?.slug || product?.category_name || product?.categoryName || "");
    const matchesCategory = !categorySlug || productCategorySlug === categorySlug || (categoryMap.get(categorySlug) && normalizeRetailSearchText(product?.category_name || product?.categoryName || product?.category?.name || "") === categorySlug);
    const matchesQuery = !query || getRetailSearchableText(product).includes(query);
    return matchesCategory && matchesQuery;
  });
}

function getRetailHeaderSpotlightProducts(products = [], count = 3) {
  return getRetailOfferProducts(products, count);
}

function scheduleRetailShellRender(site, slug, delay = 120) {
  if (!site || !slug) {
    return;
  }

  if (retailUiState.shellRenderTimer) {
    window.clearTimeout(retailUiState.shellRenderTimer);
  }

  retailUiState.shellRenderTimer = window.setTimeout(() => {
    retailUiState.shellRenderTimer = null;
    renderRetailShell(site, slug);
  }, Math.max(0, Number(delay) || 0));
}

function renderRetailShell(payload = {}, slug = "") {
  if (retailUiState.shellRenderTimer) {
    window.clearTimeout(retailUiState.shellRenderTimer);
    retailUiState.shellRenderTimer = null;
  }
  if (retailUiState.slug && retailUiState.slug !== slug) {
    retailUiState.imageIndexByProductId = {};
    retailUiState.searchQuery = "";
    retailUiState.selectedCategorySlug = "";
  }
  retailUiState.slug = slug;
  if (retailCartState.slug && retailCartState.slug !== slug) {
    retailCartState.itemsByKey = {};
  }
  retailCartState.slug = slug;
  retailCartState.itemsByKey = loadRetailCart(slug);
  window.__PUBLIC_RETAIL_CART__ = getRetailCartItems();

  const storefront = payload?.storefront || {};
  const categories = asArray(payload?.categories);
  const products = asArray(payload?.products);
  const filteredProducts = getRetailFilteredProducts(products, categories);
  const headerSpotlightProducts = getRetailHeaderSpotlightProducts(products, 3);
  const companyName = storefront.title || storefront.name || "Tienda";
  const heroText = storefront.subtitle || storefront.description || "Vitrina virtual para comprar fácil, rápido y por WhatsApp.";
  const contactLink = buildRetailWhatsAppLink(storefront);
  const featuredProducts = filteredProducts.slice(0, 8);
  const sections = categories.length
    ? categories
    : [{ name: "Productos destacados", slug: "destacados" }];
  const heroImage = storefront.bannerUrl || storefront.banner_url || storefront.coverImageUrl || storefront.cover_image_url || ASSETS.hero;
  const heroLogo = storefront.logoUrl || storefront.logo_url || storefront.webPageLogoUrl || storefront.web_page_logo_url || storefront.companyLogoUrl || storefront.company_logo_url || ASSETS.brand;
  const currency = storefront.currency || "COP";
  const trustPoints = [
    storefront.whatsappNumber || storefront.whatsapp_number ? "Atencion por WhatsApp" : "Contacto inmediato",
    storefront.deliveryMessage ? "Entrega coordinada" : "Compra asistida",
    currency,
  ];

  document.title = `${companyName} | Vitrina virtual`;
  window.__PUBLIC_SITE_STATE__ = {
    site: payload,
    slug,
    mode: "retail",
    storefront,
    categories,
    products,
  };

  app.innerHTML = `
    <div class="page retail-page">
      <style>
        @media (max-width: 1180px) {
          .retail-page .topbar .topbar-main {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 760px) {
          .retail-page .topbar .topbar-main {
            gap: 12px !important;
          }
          .retail-page .topbar .brand {
            width: 100%;
          }
        }
        .retail-offers-track {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .retail-offers-track::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
      </style>
      <header class="topbar">
        <div class="shell topbar-inner">
          <div class="topbar-main" style="display:grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(210px, 250px); gap: 14px; align-items: center;">
            <div class="brand" style="min-width: 0; display:grid; gap: 10px;">
              <div class="brand-mark" style="width: clamp(104px, 10vw, 136px); height: clamp(104px, 10vw, 136px); border-radius: 24px; padding: 6px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 10px 22px rgba(8,25,47,0.18); overflow: hidden; box-sizing: border-box; flex: 0 0 auto;">
                <img src="${escapeHtml(heroLogo)}" alt="${escapeHtml(companyName)}" loading="eager" decoding="async" style="width:100%;height:100%;object-fit:contain;object-position:center center;display:block;transform: scale(1.16);transform-origin:center center;" />
              </div>
              <div style="min-width: 0;">
                <div class="brand-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(companyName)}</div>
                <span class="brand-subtitle">Vitrina virtual de ventas</span>
              </div>
            </div>

            <div style="display:grid; gap: 12px; min-width: 0;">
              <label style="display:block; min-width: 0;">
                <span style="display:block; margin-bottom: 8px; color: rgba(255,255,255,0.76); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;">Buscar productos</span>
                <div style="display:flex; align-items:center; gap: 10px; padding: 10px 14px; border-radius: 18px; background: rgba(255,255,255,0.96); border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 16px 28px rgba(8,25,47,0.14);">
                  <input
                    type="search"
                    data-retail-search
                    value="${escapeAttr(retailUiState.searchQuery || "")}"
                    placeholder="Buscar productos, marcas y más..."
                    aria-label="Buscar productos"
                    style="flex:1 1 auto; min-width: 0; border:0; outline: none; background: transparent; color:#0f172a; font-size: 15px; font-weight: 600;"
                  />
                  <button type="button" class="button secondary" data-action="clear-retail-search" style="padding: 10px 12px; border-radius: 14px; white-space: nowrap;">Limpiar</button>
                </div>
              </label>

              <div style="display:flex; flex-wrap: wrap; gap: 8px; align-items:center;">
                <button type="button" class="chip" data-action="set-retail-category-filter" data-category-slug="" style="padding: 8px 12px; border-radius: 999px; border-color:${retailUiState.selectedCategorySlug ? "rgba(255,255,255,0.24)" : "rgba(255,214,102,0.75)"}; background:${retailUiState.selectedCategorySlug ? "rgba(255,255,255,0.08)" : "rgba(255,214,102,0.18)"}; color:#fff;">Todas</button>
                ${categories.map((category) => {
                  const categorySlug = String(category?.slug || category?.name || category?.title || "").trim();
                  const isActive = normalizeRetailSearchText(retailUiState.selectedCategorySlug) === normalizeRetailSearchText(categorySlug);
                  return `<button type="button" class="chip" data-action="set-retail-category-filter" data-category-slug="${escapeAttr(categorySlug)}" style="padding: 8px 12px; border-radius: 999px; border-color:${isActive ? "rgba(255,214,102,0.80)" : "rgba(255,255,255,0.16)"}; background:${isActive ? "rgba(255,214,102,0.16)" : "rgba(255,255,255,0.08)"}; color:#fff;">${escapeHtml(category.name || category.title || "Categoria")}</button>`;
                }).join("")}
              </div>
            </div>

            <div style="display:grid; gap: 10px; min-width: 0;">
              <div class="top-actions" style="display:flex; justify-content:flex-end; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="button secondary topbar-cta" data-action="open-retail-cart" style="display:inline-flex; align-items:center; gap: 8px;">
                  <span class="topbar-cart-icon" aria-hidden="true" style="display:inline-flex; width: 18px; height: 18px;"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:100%;height:100%;display:block;"><path d="M3 4h2l2.1 9.3a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.5L21 8H7.1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.6" fill="currentColor"/><circle cx="18" cy="20" r="1.6" fill="currentColor"/></svg></span>
                  <span>Carrito</span>
                  <strong data-retail-cart-count style="display:inline-flex; min-width: 26px; height: 26px; align-items:center; justify-content:center; border-radius: 999px; background:#d6a13e; color:#08192f; font-size: 12px; font-weight: 900;">${getRetailCartCount()}</strong>
                </button>
                ${contactLink ? `<a class="button topbar-cta" href="${escapeHtml(contactLink)}" target="_blank" rel="noreferrer">Comprar por WhatsApp</a>` : ""}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section class="section shell section-anchor" id="ofertas" style="margin-top: 18px;">
        <div class="section-head" style="display:flex; align-items:flex-end; justify-content:space-between; gap: 16px; margin-bottom: 12px;">
          <div>
            <div style="display:inline-flex; align-items:center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: rgba(8,25,47,0.06); color: #0f172a; font-size: 11px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase;">Ofertas</div>
            <h2 style="margin-top: 14px;">Productos en promoción</h2>
            <p style="max-width: 58ch;">Selección destacada con formato horizontal para abrir el espacio que dej· el hero.</p>
          </div>
        <div style="display:flex; align-items:center; gap: 10px;">
            ${contactLink ? `<a class="button secondary" href="${escapeHtml(contactLink)}" target="_blank" rel="noreferrer" style="white-space: nowrap;">Pedir por WhatsApp</a>` : ""}
          </div>
        </div>
        <div style="position: relative;">
          <button type="button" class="button secondary" data-action="retail-offers-scroll-prev" aria-label="Mover ofertas a la izquierda" style="position:absolute; left:-8px; top:50%; transform: translateY(-50%); z-index:2; width: 34px; min-width: 34px; height: 34px; padding: 0; justify-content:center; border-radius: 999px; background: rgba(255,255,255,0.96); border: 1px solid rgba(8,25,47,0.10); box-shadow: 0 8px 18px rgba(8,25,47,0.10); color: #0f172a; font-size: 18px; line-height: 1;">·</button>
          <button type="button" class="button secondary" data-action="retail-offers-scroll-next" aria-label="Mover ofertas a la derecha" style="position:absolute; right:-8px; top:50%; transform: translateY(-50%); z-index:2; width: 34px; min-width: 34px; height: 34px; padding: 0; justify-content:center; border-radius: 999px; background: rgba(255,255,255,0.96); border: 1px solid rgba(8,25,47,0.10); box-shadow: 0 8px 18px rgba(8,25,47,0.10); color: #0f172a; font-size: 18px; line-height: 1;">·</button>
          <div id="retail-offers-track" class="retail-offers-track" style="display:grid; grid-auto-flow: column; grid-auto-columns: minmax(220px, 250px); gap: 12px; overflow-x: auto; padding: 2px 28px 10px; overscroll-behavior-x: contain;">
          ${headerSpotlightProducts.length ? headerSpotlightProducts.map((product) => {
            const image = getRetailProductActiveImage(product);
            const categoryLabel = product?.category_name || product?.categoryName || "Oferta";
            const name = product?.name || product?.title || "Producto";
            const price = getRetailProductPrice(product);
            const comparePrice = getRetailProductCompareValue(product);
            const discountPercent = getRetailProductDiscountPercent(product);
            const badge = getRetailProductOfferBadge(product);
            return `
              <button type="button" data-action="open-retail-product-modal" data-product-key="${escapeAttr(getRetailProductKey(product))}" style="display:grid; gap: 10px; text-align:left; padding: 10px; border-radius: 20px; background: linear-gradient(180deg, #ffffff, #f7f9fc); border: 1px solid rgba(8,25,47,0.08); box-shadow: 0 14px 28px rgba(8,25,47,0.07); cursor:pointer; min-width: 220px;">
                <div style="position: relative; width: 100%; aspect-ratio: 1.18; border-radius: 16px; overflow:hidden; background: rgba(8,25,47,0.06);">
                  <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" />
                  ${badge ? `<span style="position:absolute; top: 10px; left: 10px; display:inline-flex; align-items:center; gap: 4px; padding: 6px 10px; border-radius: 999px; background: rgba(8,25,47,0.92); color: #ffd766; font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;">Oferta <span aria-hidden="true">·</span></span>` : ""}
                  ${discountPercent ? `<span style="position:absolute; top: 10px; right: 10px; display:inline-flex; align-items:center; gap: 4px; padding: 6px 10px; border-radius: 999px; background: rgba(29,95,70,0.96); color: #fff; font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;">-${discountPercent}%</span>` : ""}
                </div>
                <div style="display:grid; gap: 6px;">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap: 8px;">
                    <div style="font-size: 11px; font-weight: 800; color: rgba(15,23,42,0.58); text-transform: uppercase; letter-spacing: .06em;">${escapeHtml(categoryLabel)}</div>
                    <span aria-hidden="true" style="display:inline-flex; width: 26px; height: 26px; align-items:center; justify-content:center; border-radius: 999px; background: rgba(8,25,47,0.06); color: #0f172a; font-size: 16px;">·</span>
                  </div>
                  <strong style="display:block; color: #0f172a; font-size: 0.98rem; line-height: 1.1;">${escapeHtml(name)}</strong>
                  <div style="display:flex; align-items:flex-end; justify-content:space-between; gap: 8px; color: #0f172a;">
                    <div style="display:grid; gap: 3px;">
                      ${comparePrice > getRetailProductValue(product) ? `<span style="font-size: 12px; color: rgba(15,23,42,0.52); text-decoration: line-through;">${escapeHtml(formatCOP(comparePrice))}</span>` : ""}
                      <span style="font-size: 0.98rem; font-weight: 900;">${escapeHtml(price)}</span>
                    </div>
                    <span style="font-size: 12px; font-weight: 700; color: rgba(15,23,42,0.62);">Ver detalle</span>
                  </div>
                </div>
              </button>
            `;
          }).join("") : `<div style="padding: 16px; border-radius: 18px; background: #fff; border: 1px solid rgba(8,25,47,0.08); color: rgba(15,23,42,0.72); font-size: 13px;">No hay ofertas cargadas aún.</div>`}
          </div>
        </div>
      </section>

      <main>
        <section class="section shell section-anchor" id="catalogo" style="margin-top: 32px;">
          <div class="section-head" style="display:flex; align-items:flex-end; justify-content:space-between; gap: 16px;">
            <div>
              <div style="display:inline-flex; align-items:center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: rgba(8,25,47,0.06); color: #0f172a; font-size: 11px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase;">Catálogo</div>
              <h2 style="margin-top: 14px;">Explora la vitrina</h2>
              <p style="max-width: 58ch;">Productos publicados por la tienda, organizados para compra rápida y atenci·n directa.</p>
            </div>
          </div>
          ${sections.length ? `<div class="chip-row" style="margin-bottom:18px; flex-wrap: wrap; gap: 8px;">${sections.map((category) => `<span class="chip" style="padding: 10px 14px; background: #fff; border-color: rgba(8,25,47,0.08); box-shadow: 0 10px 18px rgba(8,25,47,0.05);">${escapeHtml(category.name || category.title || "Categoria")}</span>`).join("")}</div>` : ""}
          <div class="raffles-grid retail-grid">
            ${featuredProducts.length ? featuredProducts.map((product) => `
              <article class="raffle-card retail-product-card" style="overflow:hidden; border-radius: 24px; border-color: rgba(8,25,47,0.08); box-shadow: 0 16px 40px rgba(8,25,47,0.09); background: linear-gradient(180deg, #fff, #fbfcfe);">
                ${renderRetailProductGallery(product)}
                <div class="raffle-card-body" style="padding: 18px 18px 20px; display: grid; gap: 12px;">
                  <div class="chip-row" style="gap: 8px; flex-wrap: wrap;">
                    ${product.category_name ? `<span class="chip" style="background:#f8fafc; border-color: rgba(8,25,47,0.08);">${escapeHtml(product.category_name)}</span>` : ""}
                    ${product.sku ? `<span class="chip" style="background:#f8fafc; border-color: rgba(8,25,47,0.08);">${escapeHtml(product.sku)}</span>` : ""}
                  </div>
                  <h3 class="raffle-card-title" style="font-size: 1.15rem; line-height: 1.08;">${escapeHtml(product.name || product.title || "Producto")}</h3>
                  <p class="raffle-card-copy" style="min-height: 54px; color: #526074;">${escapeHtml(getRetailProductDescription(product) || "Producto disponible en la vitrina virtual.")}</p>
                  <div style="display:flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-radius: 18px; background: linear-gradient(135deg, rgba(8,25,47,0.96), rgba(29,95,70,0.92)); color: #fff;">
                    <div>
                      <div style="font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.72); font-weight: 800;">Precio</div>
                      <div style="font-size: 1.15rem; font-weight: 900; margin-top: 4px;">${escapeHtml(getRetailProductPrice(product))}</div>
                    </div>
                    <div style="font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.86); text-align: right;">Pago y entrega<br/>asistidos por WhatsApp</div>
                  </div>
                  <div class="raffle-card-actions" style="margin-top: 2px;">
                    <div style="display:grid; gap: 10px;">
                      <button type="button" class="button gold" data-action="retail-add-to-cart" data-product-key="${escapeAttr(getRetailProductKey(product))}" style="width:100%; justify-content:center;">Agregar al carrito</button>
                      <button type="button" class="button secondary" data-action="open-retail-product-modal" data-product-key="${escapeAttr(getRetailProductKey(product))}" style="width:100%; justify-content:center;">Ver detalle</button>
                    </div>
                  </div>
                </div>
              </article>
            `).join("") : `
              <div class="state-card" style="padding: 28px; background: linear-gradient(135deg, rgba(8,25,47,0.98), rgba(17,32,56,0.96)); color: #fff; border: 1px solid rgba(8,25,47,0.06); box-shadow: 0 18px 40px rgba(8,25,47,0.12);">
                <div style="display:grid; gap: 10px; max-width: 56ch;">
                  <div style="display:inline-flex; width: fit-content; padding: 8px 12px; border-radius: 999px; background: rgba(255,214,102,0.12); color: #ffd766; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;">Catálogo en construcci·n</div>
                  <h3 style="margin: 0; font-size: 1.6rem; line-height: 1.08;">Todavía no hay productos visibles</h3>
                  <p style="margin: 0; color: rgba(255,255,255,0.82); line-height: 1.6;">La vitrina ya está lista para recibir productos. Cuando publiques inventario, aparecerá aqué con tarjetas destacadas, precio y compra por WhatsApp.</p>
                  ${contactLink ? `<a class="button gold" href="${escapeHtml(contactLink)}" target="_blank" rel="noreferrer" style="width: fit-content; margin-top: 8px;">Escribir a la tienda</a>` : ""}
                </div>
              </div>`}
          </div>
        </section>

        <section class="section shell section-anchor" style="margin-top: 30px; padding-bottom: 24px;">
          <div class="section-head">
            <div>
              <div style="display:inline-flex; align-items:center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: rgba(8,25,47,0.06); color: #0f172a; font-size: 11px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase;">Cómo comprar</div>
              <h2 style="margin-top: 14px;">Ruta de compra simple</h2>
              <p>Flujo corto para cerrar la venta rápido, sin fricci·n.</p>
            </div>
          </div>
          <div class="raffles-grid" style="gap: 14px;">
            <div class="state-card" style="padding: 20px; border-radius: 20px; border: 1px solid rgba(8,25,47,0.08); box-shadow: 0 14px 30px rgba(8,25,47,0.06); background:#fff;"><strong style="display:block; font-size: 1rem; color:#0f172a;">1. Revisa</strong><p style="margin:10px 0 0; color:#526074;">Explora la vitrina y abre la ficha del producto que te interesa.</p></div>
            <div class="state-card" style="padding: 20px; border-radius: 20px; border: 1px solid rgba(8,25,47,0.08); box-shadow: 0 14px 30px rgba(8,25,47,0.06); background:#fff;"><strong style="display:block; font-size: 1rem; color:#0f172a;">2. Escríbenos</strong><p style="margin:10px 0 0; color:#526074;">Usa WhatsApp para pedir asesoría, disponibilidad o compra directa.</p></div>
            <div class="state-card" style="padding: 20px; border-radius: 20px; border: 1px solid rgba(8,25,47,0.08); box-shadow: 0 14px 30px rgba(8,25,47,0.06); background:#fff;"><strong style="display:block; font-size: 1rem; color:#0f172a;">3. Recibe</strong><p style="margin:10px 0 0; color:#526074;">La tienda confirma tu pedido y coordina la entrega contigo.</p></div>
          </div>
        </section>
      </main>
      <div id="retail-cart-modal" class="video-modal" role="dialog" aria-modal="true" aria-hidden="true" onclick="if (event.target.id === 'retail-cart-modal') { closeRetailCartModal(); }">
        <div class="video-modal-card" role="document" style="max-width: min(920px, calc(100vw - 24px)); max-height: min(90vh, 880px); display: flex; flex-direction: column; overflow: hidden;">
          <button type="button" class="video-modal-close" aria-label="Cerrar carrito" onclick="closeRetailCartModal()">·</button>
          <div id="retail-cart-modal-content" class="video-modal-frame" style="display:grid; gap: 14px; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px;"></div>
        </div>
      </div>
      <div id="retail-checkout-modal" class="video-modal" role="dialog" aria-modal="true" aria-hidden="true" onclick="if (event.target.id === 'retail-checkout-modal') { closeRetailCheckout(); }">
        <div class="video-modal-card" role="document" style="max-width: min(1040px, calc(100vw - 24px)); max-height: min(90vh, 880px); display: flex; flex-direction: column; overflow: hidden;">
          <button type="button" class="video-modal-close" aria-label="Cerrar checkout" onclick="closeRetailCheckout()">·</button>
          <div id="retail-checkout-modal-content" class="video-modal-frame" style="display:grid; gap: 14px; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px;"></div>
        </div>
      </div>
      <div id="retail-receipt-modal" class="video-modal" role="dialog" aria-modal="true" aria-hidden="true" onclick="if (event.target.id === 'retail-receipt-modal') { closeRetailReceiptModal(); }">
        <div class="video-modal-card" role="document" style="max-width: min(760px, calc(100vw - 24px)); max-height: min(86vh, 760px); display: flex; flex-direction: column; overflow: hidden;">
          <button type="button" class="video-modal-close" aria-label="Cerrar comprobante" onclick="closeRetailReceiptModal()">·</button>
          <div id="retail-receipt-modal-content" class="video-modal-frame" style="display:grid; gap: 14px; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px;"></div>
        </div>
      </div>
      <div id="retail-product-modal" class="video-modal" role="dialog" aria-modal="true" aria-hidden="true" onclick="if (event.target.id === 'retail-product-modal') { closeRetailProductModal(); }">
        <div class="video-modal-card" role="document" style="max-width: min(940px, calc(100vw - 24px)); max-height: min(90vh, 920px); display: flex; flex-direction: column; overflow: hidden;">
          <button type="button" class="video-modal-close" aria-label="Cerrar producto" onclick="closeRetailProductModal()">·</button>
          <div class="video-modal-head">
            <div class="section-tag">Detalle del producto</div>
            <h3 id="retail-product-modal-title">Producto</h3>
            <p id="retail-product-modal-subtitle"></p>
          </div>
          <div style="display:grid; gap: 14px; min-height: 0; flex: 1 1 auto; overflow-y: auto; padding-right: 4px;">
            <div id="retail-product-modal-frame" class="video-modal-frame" style="margin-top: 2px;"></div>
            <div id="retail-product-modal-badges" class="chip-row" style="flex-wrap: wrap; gap: 8px;"></div>
            <p id="retail-product-modal-summary" style="margin: 0; color: #526074; line-height: 1.65;"></p>
            <div id="retail-product-modal-action"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  writeCachedPublicSite(slug, payload);
  paintRetailCartModal();
  paintRetailCheckoutModal();
  paintRetailReceiptModal();
  updateRetailCartBadge();
}

function renderShell(site, slug) {
  const settings = site.settings || {};
  const company = site.company || {};
  const pageTitle = [
    company.nombre || settings.title || "Rifas",
    "Inversiones",
  ].filter(Boolean).join(" | ");
  document.title = pageTitle;
  const themePrimary = settings.primaryColor || "#0f172a";
  const themeSecondary = settings.secondaryColor || "#d6a13e";
  document.documentElement.style.setProperty("--primary", themePrimary);
  document.documentElement.style.setProperty("--secondary", themeSecondary);

  const heroImage = pickHeroImage(site);
  const heroVideo = pickHeroVideo(site);
  const heroTitle = settings.heroTitle || settings.title || company.nombre || "Rifas";
  const heroSubtitle = settings.heroSubtitle || settings.subtitle || "Una experiencia de rifas administrada desde el backend.";
  const heroButton = settings.heroButtonUrl || "#sorteos";
  const heroLabel = settings.heroButtonLabel || (settings.heroButtonUrl ? "Escríbenos" : "Ver sorteos");
  const slogan = settings.slogan || "";
  const activeRaffles = asArray(site.activeRaffles);
  const featuredRaffle = activeRaffles[0] || null;
  const heroSpotlightTitle = featuredRaffle ? getRaffleDisplayTitle(featuredRaffle) : heroTitle;
  const heroSpotlightDescription = featuredRaffle
    ? (getRaffleDisplayDescription(featuredRaffle) || "Compra segura y numeros visibles en tiempo real.")
    : (settings.heroOverlayText || "Compra segura y numeros visibles en tiempo real.");
  const heroSpotlightImage = featuredRaffle ? getRaffleDisplayImage(featuredRaffle, site) : heroImage;
  const heroSpotlightLabel = featuredRaffle ? "Sorteo destacado" : "Compra segura";
  const heroSpotlightLabelClass = featuredRaffle ? "overlay-label overlay-label-featured" : "overlay-label";
  const heroGreeting = "";
  const visitCount = Number(site?.settings?.visitCount || site?.stats?.visitCount || 0);
  const heroSpotlightChips = [
    featuredRaffle ? getRaffleDisplayDate(featuredRaffle) : "",
    featuredRaffle ? getRaffleDisplayPrice(featuredRaffle) : "",
  ].filter(Boolean);
  const raffleCount = asArray(site.activeRaffles).length;
  const faqCount = asArray(site.faq).length;
  const videosCount = asArray(site.winnerVideos).length;
  const heroSignals = [
    raffleCount > 0 ? `${raffleCount} sorteos visibles` : "",
    videosCount > 0 ? `${videosCount} videos publicados` : "",
  ].filter(Boolean);
  const footerQuickLinks = [
    ["Inicio", "#inicio"],
    ["Sorteos", "#sorteos"],
    ["Cómo participar", "#como-participar"],
    ["Ganadores", "#videos"],
    ["Ayuda", "#faq"],
  ];
  const topNavLinks = footerQuickLinks;
  const footerSocialLinks = getFooterSocialLinks(site);
  const paymentSections = asArray(site.paymentMethods);
  const legalSections = asArray(site.legal);
  const otherSections = asArray(site.otherSections);
  raffleSelectorState.site = site;
  raffleSelectorState.slug = slug;
  publicUiState.mobileMenuOpen = false;
  window.__PUBLIC_SITE_STATE__ = {
    site,
    slug,
    raffles: asArray(site.activeRaffles),
  };

  app.innerHTML = `
    <div class="page">
      <header class="topbar">
        <div class="shell topbar-inner">
          <div class="topbar-main">
            <div class="brand">
              <div class="brand-mark" style="width: clamp(104px, 10vw, 136px); height: clamp(104px, 10vw, 136px); border-radius: 24px; padding: 6px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 10px 22px rgba(8,25,47,0.18); overflow: hidden; box-sizing: border-box; flex: 0 0 auto;">
              <img src="${escapeHtml(settings.logoUrl || company.logo || ASSETS.brand)}" alt="${escapeHtml(company.nombre || settings.title || "Logo")}" loading="eager" decoding="async" style="width:100%;height:100%;object-fit:contain;object-position:center center;display:block;transform: scale(1.16);transform-origin:center center;" />
              </div>
              <div>
                <div class="brand-name">${escapeHtml(company.nombre || settings.title || "Rifas publicas")}</div>
                <span class="brand-subtitle">Tu portal de rifas y ganadores</span>
              </div>
            </div>
            <div class="top-actions">
              <button
                type="button"
                class="button topbar-menu-toggle"
                data-action="toggle-mobile-menu"
                aria-expanded="${publicUiState.mobileMenuOpen ? "true" : "false"}"
                aria-controls="topbar-mobile-menu"
                aria-label="${publicUiState.mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}"
              >
                <span class="topbar-menu-icon" data-mobile-menu-icon aria-hidden="true">${publicUiState.mobileMenuOpen ? "·" : "<svg viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" style=\"width:100%;height:100%;display:block;\"><path d=\"M4 7h16M4 12h16M4 17h16\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></svg>"}</span>
                <span class="topbar-menu-label" data-mobile-menu-label>Menú</span>
              </button>
              ${settings.whatsappNumber ? `<a class="button topbar-cta" href="${escapeHtml(whatsappLink(settings.whatsappNumber))}" target="_blank" rel="noreferrer"><span class="whatsapp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.2 3.8A10.6 10.6 0 0 0 2.3 15.7L1 22l6.4-1.7a10.6 10.6 0 0 0 5.1 1.3h0A10.6 10.6 0 0 0 20.2 3.8Zm-8 16.5h0a8.8 8.8 0 0 1-4.5-1.2l-.3-.2-3.8 1 1-3.7-.2-.4a8.8 8.8 0 1 1 7.8 4.5Zm5-6.5c-.3-.2-1.7-.9-1.9-1s-.3-.2-.4.2-.7 1-1 1.2-.4.2-.7 0a7.2 7.2 0 0 1-2.1-1.3 8 8 0 0 1-1.5-1.9c-.2-.4 0-.6.2-.8l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.5-1.4-.7-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.6 1.2 3 1.4 3.2c.2.2 2.1 3.2 5.1 4.4.7.3 1.2.5 1.7.7.7.2 1.3.2 1.7.1.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.4Z" fill="currentColor"/></svg></span><span>Contáctanos</span></a>` : ""}
            </div>
          </div>
          <nav class="top-nav top-nav-desktop" aria-label="Navegación principal">
            ${topNavLinks.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join("")}
            <button type="button" class="top-nav-button" data-action="open-raffle-results">Resultados</button>
          </nav>
          <div class="topbar-mobile-panel" id="topbar-mobile-menu" data-mobile-nav-panel ${publicUiState.mobileMenuOpen ? "" : "hidden"}>
            ${topNavLinks.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join("")}
            <button type="button" class="topbar-mobile-results" data-action="open-raffle-results">Resultados de sorteos</button>
          </div>
        </div>
        </header>

      <main>
        <section class="hero" id="inicio">
          <div class="shell hero-card">
            <div class="hero-grid">
              <div class="hero-copy">
                <div class="hero-company-line">${escapeHtml(settings.title || company.nombre || heroTitle || "Rifas publicas")}</div>
                <div class="hero-brand">
                  <div class="hero-brand-mark">
                    <img src="${escapeHtml(settings.logoUrl || company.logo || ASSETS.brand)}" alt="${escapeHtml(company.nombre || settings.title || "Logo")}" loading="lazy" decoding="async" />
                  </div>
                </div>
                ${slogan ? `<p class="hero-slogan">${escapeHtml(slogan)}</p>` : ""}
                ${heroGreeting ? `<div class="hero-raffle-greeting">${escapeHtml(heroGreeting)}</div>` : ""}
                <div class="hero-actions">
                  ${heroButton ? `<a class="button gold" href="${escapeHtml(heroButton)}"${String(heroButton).startsWith("#") ? "" : ' target="_blank" rel="noreferrer"'}>${escapeHtml(heroLabel)}</a>` : ""}
                  <button type="button" class="button secondary hero-secondary" data-action="open-raffle-results">Resultados</button>
                  <a class="button secondary hero-secondary" href="#videos">Ver Ganadores</a>
                </div>
              </div>

                <div class="hero-media hero-media-with-footer">
                ${heroVideo ? renderInlineVideo(heroVideo, heroTitle) : `<img src="${escapeHtml(heroSpotlightImage)}" alt="${escapeHtml(heroSpotlightTitle)}" loading="eager" fetchpriority="high" decoding="async" />`}
                ${featuredRaffle ? `
                  <div class="overlay hero-media-footer">
                    <div class="overlay-top">
                      <div class="overlay-copy">
                        <span class="${escapeHtml(heroSpotlightLabelClass)}">${escapeHtml(heroSpotlightLabel)}</span>
                        <strong>${escapeHtml(heroSpotlightTitle)}</strong>
                        <div class="overlay-description">${escapeHtml(heroSpotlightDescription)}</div>
                        ${heroSpotlightChips.length ? `
                          <div class="overlay-meta">
                            ${heroSpotlightChips.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
                          </div>
                        ` : ""}
                      </div>
                      <div class="overlay-actions">
                        <button
                          type="button"
                          class="button gold js-open-raffle-selector hero-buy-button"
                          data-raffle-id="${escapeHtml(String(featuredRaffle?.campaign?.id || ""))}"
                        >
                          Comprar
                        </button>
                      </div>
                    </div>
                    ${renderRaffleAdvanceBlock(featuredRaffle)}
                  </div>
                ` : ""}
              </div>
            </div>
          </div>
        </section>

        ${renderTrustStrip(site)}

          <section class="section shell section-anchor" id="sorteos">
            <div class="section-head">
              <div>
                <h2>Sorteos disponibles</h2>
                <p>Selecciona el sorteo que quieras comprar y mira sus numeros disponibles en tiempo real.</p>
              </div>
          </div>
          ${renderRaffles(site)}
        </section>

        ${renderHowItWorks()}

        ${paymentSections.length ? `
            <section class="section shell section-anchor" id="pagos">
            <div class="section-head">
              <div>
                <h2>Opciones de pago visibles</h2>
                <p>La pagina publica toma estos bloques desde la configuracion del backend.</p>
              </div>
          </div>
          <div class="state-card" style="margin-bottom:18px">
            <img src="${escapeHtml(ASSETS.payments)}" alt="Metodos de pago" loading="lazy" decoding="async" style="width:100%;height:auto;border-radius:22px;display:block;margin-bottom:16px" />
          </div>
          ${renderSections(site, paymentSections, "Metodos de pago", "Bloques administrables desde el panel.") }
          </section>
        ` : ""}

          <section class="section shell section-anchor" id="videos">
            <div class="section-head">
              <div>
                <h2>Videos y testimonios</h2>
                <p>Mira entregas, testimonios y apoyos sociales que el administrador decida publicar.</p>
              </div>
          </div>
          ${renderWinnerVideos(site)}
        </section>

          <section class="section shell section-anchor" id="faq">
            <div class="section-head">
              <div>
                <h2>Dudas resueltas antes de comprar</h2>
                <p>La landing muestra las respuestas que configuras en el panel administrativo.</p>
              </div>
          </div>
          ${renderFaq(site)}
        </section>

        ${legalSections.length ? `
            <section class="section shell section-anchor" id="legal">
              <div class="section-head">
                <div>
                  <h2>Terminos y condiciones</h2>
                  <p>Bloques legales que se muestran publicamente sin tocar el codigo de la web.</p>
                </div>
            </div>
            ${renderSections(site, legalSections, "Legal", "T&C, autorizaciones, privacidad y otras politicas.") }
          </section>
        ` : ""}

        ${otherSections.length ? `
            <section class="section shell section-anchor" id="contenidos">
              <div class="section-head">
                <div>
                  <h2>Contenido adicional</h2>
                  <p>Secciones extra cargadas desde el CMS interno.</p>
                </div>
            </div>
            ${renderSections(site, otherSections, "Contenido adicional", "Bloques generales publicados por el administrador.") }
          </section>
        ` : ""}

        <section class="section shell footer-shell">
          <div class="footer-card footer-card-premium">
            <div class="footer-brand">
              <div class="footer-brand-mark">
                <img src="${escapeHtml(settings.logoUrl || company.logo || ASSETS.brand)}" alt="${escapeHtml(company.nombre || settings.title || "Logo")}" loading="lazy" decoding="async" />
              </div>
              <div class="footer-brand-copy">
                <strong>${escapeHtml(company.nombre || settings.title || "Rifas publicas")}</strong>
                <p>${escapeHtml(settings.slogan || settings.subtitle || "Tu portal de rifas y ganadores")}</p>
              </div>
            </div>
            <div class="footer-links">
              <span class="footer-label">Navegación</span>
              <div class="footer-link-list">
                ${footerQuickLinks.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join("")}
              </div>
            </div>
            <div class="footer-contact">
              <span class="footer-label">Redes sociales</span>
              ${footerSocialLinks.length ? `
                <div class="footer-social-grid">
                  ${footerSocialLinks.map((item) => `
                    <a class="social-link social-${escapeHtml(item.key)}" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(item.label)}">
                      <span class="social-link-icon">${socialIconMarkup(item.key)}</span>
                      <span>${escapeHtml(item.label)}</span>
                    </a>
                  `).join("")}
                </div>
              ` : ""}
              ${settings.whatsappNumber ? `<a class="footer-contact-pill" href="${escapeHtml(whatsappLink(settings.whatsappNumber))}" target="_blank" rel="noreferrer">WhatsApp ${escapeHtml(settings.whatsappNumber)}</a>` : ""}
              ${visitCount > 0 ? `<div class="footer-visit-counter"><span class="footer-label">Visitas de la pagina</span><div class="footer-visit-pill">${numberFormatter.format(visitCount)} visitas</div></div>` : `<div class="footer-visit-counter"><span class="footer-label">Visitas de la pagina</span><div class="footer-visit-pill">0 visitas</div></div>`}
              </div>
            </div>
          </div>
          <div class="footer-bar">
            <span>Compra segura · Seguimiento en tiempo real · Ganadores visibles</span>
            <span>${escapeHtml(slug || "sin-slug")}</span>
          </div>
        </section>
      </main>
        ${renderRaffleSelectorModal()}
        ${renderPaymentModal()}
        ${renderReceiptUploadModal()}
        ${renderDeliveryModal()}
        ${renderRaffleResultsModal()}
        ${renderPublicChatWidget(site, slug)}
      <div id="video-modal" class="video-modal" role="dialog" aria-modal="true" aria-hidden="true" onclick="if (event.target.id === 'video-modal') { closeVideoModal(); }">
        <div class="video-modal-card" role="document">
          <button type="button" class="video-modal-close" aria-label="Cerrar video" onclick="closeVideoModal()">·</button>
          <div class="video-modal-head">
            <div class="section-tag">Video de ganador</div>
            <h3 id="video-modal-title">Video</h3>
            <p id="video-modal-subtitle"></p>
          </div>
          <div id="video-modal-frame" class="video-modal-frame"></div>
        </div>
      </div>
    </div>
  `;

  writeCachedPublicSite(slug, site);
  initRaffleCarousel();
  syncRaffleResultsModal();
  initializePublicChat(site, slug);

  document.querySelectorAll("[data-video-url]").forEach((button) => {
    button.addEventListener("click", () => {
      openVideoModal({
        url: button.getAttribute("data-video-url") || "",
        title: button.getAttribute("data-video-title") || "",
        subtitle: button.getAttribute("data-video-subtitle") || "",
      });
    });
  });
}

async function refreshFeaturedRaffleAdvance(site, slug) {
  const campaignIds = [...new Set(asArray(site?.activeRaffles)
    .map((raffle) => String(raffle?.campaign?.id || ""))
    .filter(Boolean))];

  await Promise.all(campaignIds.map(async (campaignId) => {
    const progressRoots = [...app.querySelectorAll(
      `[data-raffle-progress][data-raffle-id="${CSS.escape(campaignId)}"]`,
    )];
    if (progressRoots.length === 0) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/public-site/${encodeURIComponent(slug)}/raffles/${encodeURIComponent(campaignId)}/availability?limit=1`,
      );
      if (!response.ok) {
        return;
      }

      const advance = getRaffleAdvanceStats(await response.json());
      progressRoots.forEach((progressRoot) => {
        const fill = progressRoot.querySelector("[data-raffle-progress-fill]");
        const meta = progressRoot.querySelector("[data-raffle-progress-meta]");

        if (meta) {
          meta.textContent = advance.total > 0
            ? `${advance.percent}% de avance`
            : "Avance del sorteo";
        }

        if (fill) {
          fill.style.width = "0%";
          fill.style.minWidth = advance.percent > 0 ? "4px" : "0";
          window.requestAnimationFrame(() => {
            fill.style.width = `${advance.percent}%`;
          });
        }
      });
    } catch {
      // Se deja silencioso para no romper la landing si el avance no responde.
    }
  }));
}

app.addEventListener("click", (event) => {
  const startPurchaseButton = event.target.closest('[data-action="start-public-chat-purchase"]');
  if (startPurchaseButton && app.contains(startPurchaseButton)) {
    event.preventDefault();
    openPublicChatPurchase();
    return;
  }

  const closePurchaseButton = event.target.closest('[data-action="close-public-chat-purchase"]');
  if (closePurchaseButton && app.contains(closePurchaseButton)) {
    publicChatState.purchase.open = false;
    paintPublicChatPurchase();
    return;
  }

  const numberButton = event.target.closest('[data-action="toggle-public-chat-number"]');
  if (numberButton && app.contains(numberButton)) {
    const value = String(numberButton.dataset.number || "").trim();
    const raffle = getPublicChatPurchaseRaffle();
    const state = publicChatState.purchase;
    const exists = state.selected.includes(value);
    const summary = getRaffleSelectorSelectionSummary(raffle || {}, state.selected);
    const supportUploadMode = Boolean(getRaffleSelectorAutoConfig(raffle || {}).public_support_upload);
    if (supportUploadMode && !exists && summary.totalNumbers >= summary.groupSize) {
      state.notice = "En fidelizacion solo se permite una boleta por cliente.";
      state.noticeTone = "error";
    } else {
      state.selected = exists ? state.selected.filter((item) => item !== value) : [...state.selected, value];
      state.notice = "";
    }
    paintPublicChatPurchase();
    return;
  }

  const clipButton = event.target.closest('[data-action="pick-public-chat-receipt"]');
  if (clipButton && app.contains(clipButton)) {
    app.querySelector("[data-public-chat-receipt-input]")?.click();
    return;
  }

  const removeReceiptButton = event.target.closest('[data-action="remove-public-chat-receipt"]');
  if (removeReceiptButton && app.contains(removeReceiptButton)) {
    releasePublicChatPurchasePreview();
    publicChatState.purchase.file = null;
    paintPublicChatPurchase();
    return;
  }

  const whatsappDeliveryButton = event.target.closest('[data-action="receive-public-chat-delivery-whatsapp"]');
  if (whatsappDeliveryButton && app.contains(whatsappDeliveryButton)) {
    event.preventDefault();
    void receivePublicChatDeliveryWhatsApp(whatsappDeliveryButton.dataset.reference || "", whatsappDeliveryButton);
    return;
  }

  const deliveryButton = event.target.closest('[data-action="download-public-chat-delivery"]');
  if (deliveryButton && app.contains(deliveryButton)) {
    event.preventDefault();
    void downloadPublicChatDelivery(deliveryButton.dataset.reference || "", deliveryButton);
    return;
  }

  const publicChatToggle = event.target.closest('[data-action="toggle-public-chat"]');
  if (publicChatToggle && app.contains(publicChatToggle)) {
    const panel = app.querySelector("[data-public-chat-panel]");
    publicChatState.open = !publicChatState.open;
    if (panel) panel.hidden = !publicChatState.open;
    publicChatToggle.setAttribute("aria-expanded", String(publicChatState.open));
    if (publicChatState.open && publicChatState.token) void loadPublicChatMessages();
    startPublicChatPolling();
    return;
  }

  const publicChatClose = event.target.closest('[data-action="close-public-chat"]');
  if (publicChatClose && app.contains(publicChatClose)) {
    const panel = app.querySelector("[data-public-chat-panel]");
    const launcher = app.querySelector('[data-action="toggle-public-chat"]');
    publicChatState.open = false;
    if (panel) panel.hidden = true;
    if (launcher) launcher.setAttribute("aria-expanded", "false");
    startPublicChatPolling();
    return;
  }

  const mobileMenuToggle = event.target.closest('[data-action="toggle-mobile-menu"]');
  if (mobileMenuToggle && app.contains(mobileMenuToggle)) {
    event.preventDefault();
    event.stopPropagation();
    publicUiState.mobileMenuOpen = !publicUiState.mobileMenuOpen;
    const topbar = app.querySelector(".topbar");
    const panel = app.querySelector("[data-mobile-nav-panel]");
    const label = app.querySelector("[data-mobile-menu-label]");
    const icon = app.querySelector("[data-mobile-menu-icon]");
    if (topbar) {
      topbar.classList.toggle("is-menu-open", publicUiState.mobileMenuOpen);
    }
    if (panel) {
      panel.hidden = !publicUiState.mobileMenuOpen;
    }
    if (label) {
      label.textContent = publicUiState.mobileMenuOpen ? "Cerrar" : "Menú";
    }
    if (icon) {
      icon.innerHTML = publicUiState.mobileMenuOpen ? "·" : "<svg viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" style=\"width:100%;height:100%;display:block;\"><path d=\"M4 7h16M4 12h16M4 17h16\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></svg>";
    }
    mobileMenuToggle.setAttribute("aria-expanded", publicUiState.mobileMenuOpen ? "true" : "false");
    mobileMenuToggle.setAttribute("aria-label", publicUiState.mobileMenuOpen ? "Cerrar menú" : "Abrir menú");
    return;
  }

  const mobileNavLink = event.target.closest("[data-mobile-nav-panel] a");
  if (mobileNavLink && app.contains(mobileNavLink)) {
    publicUiState.mobileMenuOpen = false;
    const topbar = app.querySelector(".topbar");
    const panel = app.querySelector("[data-mobile-nav-panel]");
    const toggle = app.querySelector('[data-action="toggle-mobile-menu"]');
    const label = app.querySelector("[data-mobile-menu-label]");
    const icon = app.querySelector("[data-mobile-menu-icon]");
    if (topbar) {
      topbar.classList.remove("is-menu-open");
    }
    if (panel) {
      panel.hidden = true;
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir menú");
    }
    if (label) {
      label.textContent = "Menú";
    }
    if (icon) {
      icon.innerHTML = "<svg viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" style=\"width:100%;height:100%;display:block;\"><path d=\"M4 7h16M4 12h16M4 17h16\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></svg>";
    }
  }

  const openButton = event.target.closest("[data-raffle-id].js-open-raffle-selector");
  if (openButton && app.contains(openButton)) {
    event.preventDefault();
    openRaffleSelector(openButton.getAttribute("data-raffle-id") || "");
    return;
  }

  const modal = event.target.closest("#raffle-selector-modal");
  if (modal && event.target.id === "raffle-selector-modal") {
    closeRaffleSelector();
    return;
  }

  const paymentOverlay = event.target.closest("#payment-modal");
  if (paymentOverlay && event.target.id === "payment-modal") {
    closePaymentModal();
    return;
  }

  const deliveryOverlay = event.target.closest("#delivery-modal");
  if (deliveryOverlay && event.target.id === "delivery-modal") {
    closeDeliveryModal();
    return;
  }

  const raffleResultsOverlay = event.target.closest("#raffle-results-modal");
  if (raffleResultsOverlay && event.target.id === "raffle-results-modal") {
    closeRaffleResultsModal();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) {
    return;
  }

  const actionName = action.getAttribute("data-action");
  if (actionName === "open-raffle-results") {
    event.preventDefault();
    event.stopPropagation();
    void openRaffleResultsModal();
    return;
  }

  if (actionName === "close-raffle-results") {
    event.preventDefault();
    event.stopPropagation();
    closeRaffleResultsModal();
    return;
  }

  if (actionName === "close-raffle-selector") {
    event.preventDefault();
    event.stopPropagation();
    closeRaffleSelector();
    return;
  }

  if (actionName === "refresh-raffle-selector") {
    event.preventDefault();
    event.stopPropagation();
    fetchRaffleSelectorNumbers();
    return;
  }

  if (actionName === "focus-selector-grid") {
    event.preventDefault();
    event.stopPropagation();
    const grid = document.querySelector(".ticket-grid");
    if (grid) {
      grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  if (actionName === "clear-raffle-selection") {
    event.preventDefault();
    event.stopPropagation();
    raffleSelectorState.selected = [];
    persistSelection(raffleSelectorState.raffle?.campaign?.id, raffleSelectorState.selected);
    raffleSelectorState.notice = "Seleccion limpiada.";
    raffleSelectorState.noticeTone = "info";
    paintRaffleSelector();
    return;
  }

  if (actionName === "raffle-carousel-prev") {
    event.preventDefault();
    event.stopPropagation();
    stepRaffleCarousel(-1);
    return;
  }

  if (actionName === "raffle-carousel-next") {
    event.preventDefault();
    event.stopPropagation();
    stepRaffleCarousel(1);
    return;
  }

  if (actionName === "go-payment-section") {
    event.preventDefault();
    event.stopPropagation();
    const currentRaffle = raffleSelectorState.raffle || null;
    const selected = currentRaffle ? getCurrentRaffleSelection(currentRaffle.campaign.id) : [];
    const site = raffleSelectorState.site || window.__PUBLIC_SITE_STATE__?.site || null;
    const slug = raffleSelectorState.slug || window.__PUBLIC_SITE_STATE__?.slug || "";
    const selectionSummary = getRaffleSelectorSelectionSummary(currentRaffle || {}, selected);
    if (!currentRaffle || !selected.length) {
      return;
    }
    if (!selectionSummary.isComplete) {
      raffleSelectorState.notice = `Te faltan ${selectionSummary.missingForNext} número${selectionSummary.missingForNext === 1 ? "" : "s"} para completar una boleta de ${selectionSummary.groupSize} números.`;
      raffleSelectorState.noticeTone = "warning";
      paintRaffleSelector();
      return;
    }
    closeRaffleSelector();
    openPaymentModal({
      site,
      slug,
      raffle: currentRaffle,
      selected,
    });
    return;
  }

  if (actionName === "close-payment-modal") {
    event.preventDefault();
    event.stopPropagation();
    closePaymentModal();
    return;
  }

  if (actionName === "close-delivery-modal") {
    event.preventDefault();
    event.stopPropagation();
    closeDeliveryModal();
    return;
  }

  if (actionName === "download-delivery-boletas") {
    event.preventDefault();
    event.stopPropagation();
    deliveryModalState.downloadRequested = true;

    if (deliveryModalState.assets.length > 0) {
      downloadDeliveryAssets();
      deliveryModalState.downloadRequested = false;
      deliveryModalState.expanded = true;
      paintDeliveryModal();
      return;
    }

    deliveryModalState.expanded = true;
    paintDeliveryModal();
    if (!deliveryModalState.loading) {
      loadPublicDeliveryAssets();
    }
    return;
  }

  if (actionName === "set-retail-category-filter") {
    event.preventDefault();
    event.stopPropagation();
    const nextCategorySlug = String(action.getAttribute("data-category-slug") || "").trim();
    retailUiState.selectedCategorySlug = normalizeRetailSearchText(retailUiState.selectedCategorySlug) === normalizeRetailSearchText(nextCategorySlug) ? "" : nextCategorySlug;
    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
    if (site && slug) {
      scheduleRetailShellRender(site, slug, 0);
    }
    return;
  }

  if (actionName === "clear-retail-search") {
    event.preventDefault();
    event.stopPropagation();
    retailUiState.searchQuery = "";
    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
    if (site && slug) {
      scheduleRetailShellRender(site, slug, 0);
    }
    return;
  }

  if (actionName === "retail-offers-scroll-prev" || actionName === "retail-offers-scroll-next") {
    event.preventDefault();
    event.stopPropagation();
    const track = document.getElementById("retail-offers-track");
    if (!track) {
      return;
    }
    const direction = actionName === "retail-offers-scroll-prev" ? -1 : 1;
    const step = Math.max(240, Math.floor(track.clientWidth * 0.8));
    track.scrollBy({ left: direction * step, behavior: "smooth" });
    return;
  }

  if (actionName === "retail-product-image-prev" || actionName === "retail-product-image-next" || actionName === "retail-product-image-set") {
    event.preventDefault();
    event.stopPropagation();

    const productKey = String(action.getAttribute("data-product-key") || "").trim();
    if (!productKey) {
      return;
    }

    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
    const product = asArray(site?.products).find((item) => getRetailProductKey(item) === productKey);
    if (!product) {
      return;
    }

    const gallery = getRetailProductGallery(product);
    if (gallery.length <= 1) {
      return;
    }

    if (actionName === "retail-product-image-set") {
      const imageIndex = Number(action.getAttribute("data-image-index"));
      if (Number.isFinite(imageIndex)) {
        if (window.__PUBLIC_RETAIL_MODAL__ && getRetailProductKey(window.__PUBLIC_RETAIL_MODAL__) === productKey) {
          setRetailModalImage(product, imageIndex);
        } else {
          setRetailProductImageIndex(productKey, imageIndex);
        }
      }
    } else if (actionName === "retail-product-image-prev") {
      if (window.__PUBLIC_RETAIL_MODAL__ && getRetailProductKey(window.__PUBLIC_RETAIL_MODAL__) === productKey) {
        stepOpenRetailProductModal(-1);
      } else {
        stepRetailProductImage(productKey, -1, gallery.length);
      }
    } else {
      if (window.__PUBLIC_RETAIL_MODAL__ && getRetailProductKey(window.__PUBLIC_RETAIL_MODAL__) === productKey) {
        stepOpenRetailProductModal(1);
      } else {
        stepRetailProductImage(productKey, 1, gallery.length);
      }
    }

    const modalOpenProductKey = getRetailProductKey(window.__PUBLIC_RETAIL_MODAL__ || {});
    if (!modalOpenProductKey || modalOpenProductKey !== productKey) {
      renderRetailShell(site, slug);
    }
    return;
  }

  if (actionName === "open-retail-product-modal") {
    event.preventDefault();
    event.stopPropagation();

    const productKey = String(action.getAttribute("data-product-key") || "").trim();
    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const product = asArray(site?.products).find((item) => getRetailProductKey(item) === productKey);
    if (product) {
      openRetailProductModal(product);
    }
    return;
  }

  if (actionName === "open-retail-cart") {
    event.preventDefault();
    event.stopPropagation();
    openRetailCartModal();
    return;
  }

  if (actionName === "close-retail-cart") {
    event.preventDefault();
    event.stopPropagation();
    closeRetailCartModal();
    return;
  }

  if (actionName === "retail-add-to-cart") {
    event.preventDefault();
    event.stopPropagation();
    const productKey = String(action.getAttribute("data-product-key") || "").trim();
    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const product = asArray(site?.products).find((item) => getRetailProductKey(item) === productKey);
    if (product) {
      addRetailProductToCart(product, 1);
    }
    return;
  }

  if (actionName === "retail-cart-increase" || actionName === "retail-cart-decrease" || actionName === "retail-cart-remove") {
    event.preventDefault();
    event.stopPropagation();
    const productId = String(action.getAttribute("data-product-id") || "").trim();
    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const product = asArray(site?.products).find((item) => String(item?.id) === productId);
    if (!product) {
      return;
    }
    const current = Number(retailCartState.itemsByKey[getRetailProductKey(product)]?.quantity || 0);
    if (actionName === "retail-cart-increase") {
      setRetailCartQuantity(product.id, current + 1);
    } else if (actionName === "retail-cart-decrease") {
      setRetailCartQuantity(product.id, current - 1);
    } else {
      removeRetailCartItem(product.id);
    }
    paintRetailCartModal();
    const countBadge = app.querySelector("[data-retail-cart-count]");
    if (countBadge) {
      countBadge.textContent = String(getRetailCartCount());
    }
    return;
  }

  if (actionName === "open-retail-checkout") {
    event.preventDefault();
    event.stopPropagation();
    openRetailCheckoutFromCart(String(action.getAttribute("data-payment-method") || "PSE"));
    return;
  }

  if (actionName === "set-retail-delivery-mode") {
    event.preventDefault();
    event.stopPropagation();
    const deliveryMode = String(action.getAttribute("data-delivery-mode") || "pickup").trim().toLowerCase();
    retailCheckoutState.deliveryMode = deliveryMode;
    paintRetailCheckoutModal();
    return;
  }

  if (actionName === "close-retail-checkout") {
    event.preventDefault();
    event.stopPropagation();
    closeRetailCheckout();
    return;
  }

  if (actionName === "submit-retail-checkout") {
    event.preventDefault();
    event.stopPropagation();
    submitRetailCheckout(String(action.getAttribute("data-payment-method") || "PSE"));
    return;
  }

  if (actionName === "submit-retail-receipt") {
    event.preventDefault();
    event.stopPropagation();
    submitRetailReceiptUpload();
    return;
  }

  if (actionName === "start-public-pse") {
    event.preventDefault();
    event.stopPropagation();
    submitPublicPseCheckout();
    return;
  }

  if (actionName === "trigger-public-receipt-upload") {
    event.preventDefault();
    event.stopPropagation();
    if (!ensurePaymentModalContactReady()) {
      return;
    }
    const receiptInput = app.querySelector("[data-public-receipt-input]");
    if (receiptInput) {
      receiptInput.click();
    }
    return;
  }
});

app.addEventListener("submit", async (event) => {
  const purchaseForm = event.target.closest("[data-public-chat-purchase-form]");
  if (purchaseForm && app.contains(purchaseForm)) {
    event.preventDefault();
    await submitPublicChatPurchase();
    return;
  }

  const onboarding = event.target.closest("[data-public-chat-onboarding]");
  if (onboarding && app.contains(onboarding)) {
    event.preventDefault();
    if (publicChatState.loading) return;
    publicChatState.loading = true;
    setPublicChatNotice("Iniciando conversacion...", "info");
    const submit = onboarding.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const form = new FormData(onboarding);
      const response = await fetch(`${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/chat/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), phone: form.get("phone") }),
      });
      const payload = await parsePublicChatResponse(response);
      publicChatState.token = payload.token || "";
      publicChatState.customerName = payload?.customer?.name || String(form.get("name") || "").trim();
      publicChatState.customerPhone = payload?.customer?.phone || String(form.get("phone") || "").replace(/\D/g, "");
      syncPublicChatForms();
      renderPublicChatMessages(payload.messages || [], { forceBottom: true });
      renderPublicChatPurchases(payload.purchases || []);
      renderPublicChatDeliveries(payload.deliveries || []);
      setPublicChatNotice("");
      startPublicChatPolling();
      app.querySelector("[data-public-chat-composer] textarea")?.focus();
    } catch (error) {
      setPublicChatNotice(error?.message || "No fue posible iniciar el chat.", "error");
    } finally {
      publicChatState.loading = false;
      if (submit) submit.disabled = false;
    }
    return;
  }

  const composer = event.target.closest("[data-public-chat-composer]");
  if (composer && app.contains(composer)) {
    event.preventDefault();
    if (publicChatState.loading || !publicChatState.token) return;
    const textarea = composer.querySelector('textarea[name="message"]');
    const message = String(textarea?.value || "").trim();
    if (!message) return;
    publicChatState.loading = true;
    setPublicChatNotice("El asistente esta respondiendo...", "info");
    const submit = composer.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/public-site/${encodeURIComponent(publicChatState.slug)}/chat/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicChatState.token}`,
        },
        body: JSON.stringify({ message }),
      });
      const payload = await parsePublicChatResponse(response);
      publicChatState.customerName = payload?.customer?.name || publicChatState.customerName;
      publicChatState.customerPhone = payload?.customer?.phone || publicChatState.customerPhone;
      if (textarea) textarea.value = "";
      renderPublicChatMessages(payload.messages || [], { forceBottom: true });
      renderPublicChatPurchases(payload.purchases || []);
      renderPublicChatDeliveries(payload.deliveries || []);
      renderPublicChatAction(payload.action || null);
      setPublicChatNotice("");
    } catch (error) {
      setPublicChatNotice(error?.message || "No fue posible enviar el mensaje.", "error");
    } finally {
      publicChatState.loading = false;
      if (submit) submit.disabled = false;
      textarea?.focus();
    }
  }
});

app.addEventListener("input", (event) => {
  const purchaseCityInput = event.target.closest('[data-public-chat-purchase-form] input[name="customer_city"]');
  if (purchaseCityInput && app.contains(purchaseCityInput)) {
    publicChatState.purchase.city = String(purchaseCityInput.value || "");
    const raffle = getPublicChatPurchaseRaffle();
    const summary = getRaffleSelectorSelectionSummary(raffle || {}, publicChatState.purchase.selected);
    const supportUploadMode = Boolean(getRaffleSelectorAutoConfig(raffle || {}).public_support_upload);
    const ready = Boolean(
      summary.isComplete
      && publicChatState.purchase.city.trim()
      && publicChatState.customerName
      && publicChatState.customerPhone
      && (!supportUploadMode || summary.completeTickets === 1),
    );
    const clip = app.querySelector('[data-action="pick-public-chat-receipt"]');
    if (clip) clip.disabled = !ready;
    return;
  }

  const input = event.target.closest("[data-selector-search]");
  if (!input || !app.contains(input)) {
    return;
  }

  raffleSelectorState.query = String(input.value || "").trim();
  raffleSelectorState.page = 1;
  if (raffleSelectorState.queryTimer) {
    clearTimeout(raffleSelectorState.queryTimer);
  }

  raffleSelectorState.queryTimer = setTimeout(() => {
    fetchRaffleSelectorNumbers();
  }, RAFFLE_SELECTOR_SEARCH_DELAY_MS);
});

app.addEventListener("change", (event) => {
  const resultSeriesSelect = event.target.closest("[data-raffle-results-series]");
  if (resultSeriesSelect && app.contains(resultSeriesSelect)) {
    raffleResultsModalState.selectedSeriesId = String(resultSeriesSelect.value || "");
    const { series } = getSelectedRaffleResult();
    raffleResultsModalState.selectedDrawId = String(asArray(series?.draws)[0]?.id || "");
    syncRaffleResultsModal();
    return;
  }

  const resultDrawSelect = event.target.closest("[data-raffle-results-draw]");
  if (resultDrawSelect && app.contains(resultDrawSelect)) {
    raffleResultsModalState.selectedDrawId = String(resultDrawSelect.value || "");
    syncRaffleResultsModal();
    return;
  }

  const raffleSelect = event.target.closest('[data-public-chat-purchase-form] select[name="raffle_id"]');
  if (raffleSelect && app.contains(raffleSelect)) {
    releasePublicChatPurchasePreview();
    publicChatState.purchase.raffleId = String(raffleSelect.value || "");
    publicChatState.purchase.selected = [];
    publicChatState.purchase.numbers = [];
    publicChatState.purchase.file = null;
    void loadPublicChatPurchaseNumbers();
    return;
  }

  const receiptInput = event.target.closest("[data-public-chat-receipt-input]");
  if (receiptInput && app.contains(receiptInput)) {
    const file = receiptInput.files?.[0] || null;
    receiptInput.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type || "")) {
      publicChatState.purchase.notice = "Seleccione una imagen JPG, PNG o WEBP.";
      publicChatState.purchase.noticeTone = "error";
      paintPublicChatPurchase();
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      publicChatState.purchase.notice = "La imagen no puede superar 12 MB.";
      publicChatState.purchase.noticeTone = "error";
      paintPublicChatPurchase();
      return;
    }
    releasePublicChatPurchasePreview();
    publicChatState.purchase.file = file;
    publicChatState.purchase.previewUrl = URL.createObjectURL(file);
    publicChatState.purchase.notice = "Imagen lista para enviar.";
    publicChatState.purchase.noticeTone = "success";
    paintPublicChatPurchase();
  }
});

app.addEventListener("change", (event) => {
  const receiptInput = event.target.closest("[data-public-receipt-input]");
  if (!receiptInput || !app.contains(receiptInput)) {
    const retailReceiptInput = event.target.closest("[data-retail-receipt-input]");
    if (!retailReceiptInput || !app.contains(retailReceiptInput)) {
      return;
    }

    const retailFile = retailReceiptInput.files?.[0] || null;
    if (retailFile) {
      retailCheckoutState.receiptFile = retailFile;
      retailCheckoutState.receiptFileName = retailFile.name || "comprobante";
      paintRetailReceiptModal();
    }
    return;
  }

  const file = receiptInput.files?.[0] || null;
  receiptInput.value = "";
  if (!file) {
    return;
  }

  submitPublicReceiptUpload(file);
});

if (!window.__PUBLIC_RAFFLE_RESULTS_KEYBOARD_BOUND__) {
  window.__PUBLIC_RAFFLE_RESULTS_KEYBOARD_BOUND__ = true;
  window.addEventListener("keydown", (event) => {
    if (raffleResultsModalState.open && event.key === "Escape") {
      event.preventDefault();
      closeRaffleResultsModal();
    }
  });
}

if (!window.__PUBLIC_RETAIL_KEYBOARD_BOUND__) {
  window.__PUBLIC_RETAIL_KEYBOARD_BOUND__ = true;
  window.addEventListener("keydown", (event) => {
    if (retailCheckoutState.openReceipt) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRetailReceiptModal();
      }
      return;
    }

    if (retailCheckoutState.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRetailCheckout();
      }
      return;
    }

    if (window.__PUBLIC_RETAIL_CART_MODAL_OPEN__) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRetailCartModal();
      }
      return;
    }

    if (!window.__PUBLIC_RETAIL_MODAL__) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeRetailProductModal();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepOpenRetailProductModal(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepOpenRetailProductModal(1);
    }
  });
}

app.addEventListener("input", (event) => {
  const retailSearch = event.target.closest("[data-retail-search]");
  if (retailSearch && app.contains(retailSearch)) {
    retailUiState.searchQuery = String(retailSearch.value || "");
    const site = window.__PUBLIC_SITE_STATE__?.site || null;
    const slug = window.__PUBLIC_SITE_STATE__?.slug || "";
    if (site && slug) {
      scheduleRetailShellRender(site, slug, 140);
    }
    return;
  }

  const field = event.target.closest("[data-payment-field]");
  if (!field || !app.contains(field)) {
    const retailField = event.target.closest("[data-retail-field]");
    if (!retailField || !app.contains(retailField)) {
      return;
    }

    setRetailCheckoutField(retailField.getAttribute("data-retail-field"), retailField.value);
    paintRetailCheckoutModal();
    return;
  }

  updatePaymentModalField(field.getAttribute("data-payment-field"), field.value);
});

async function loadRetailSite() {
  const slug = getSlugFromLocation();

  if (!slug) {
    app.innerHTML = `
      <div class="page">
        <div class="loading-shell loading-shell-minimal" aria-label="Cargando vitrina">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
    return;
  }

  const cached = readCachedPublicSite(slug);
  if (cached?.site) {
    try {
      renderRetailShell(cached.site, slug);
      const cachedBanner = document.createElement("div");
      cachedBanner.className = "site-cache-banner";
      cachedBanner.textContent = "Mostrando catalogo cargado previamente...";
      document.body.appendChild(cachedBanner);
      window.setTimeout(() => {
        cachedBanner.classList.add("is-hidden");
        window.setTimeout(() => cachedBanner.remove(), 220);
      }, 1800);
    } catch {
      // If cached render fails, fall back to loading shell below.
    }
  }

  if (!cached?.site) {
    app.innerHTML = `
      <div class="loading-shell loading-shell-minimal" aria-label="Cargando vitrina">
        <div class="loading-spinner"></div>
      </div>
    `;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/public-retail/${encodeURIComponent(slug)}`);
    if (!response.ok) {
      throw new Error(`No se encontro la vitrina para /${slug}`);
    }

    const payload = await response.json();
    renderRetailShell(payload, slug);
  } catch (error) {
    if (!cached?.site) {
      renderRetailShell({
        storefront: {
          title: slug ? slug.replace(/[-_]+/g, " ") : "Vitrina retail",
          subtitle: "Vitrina virtual para comprar fácil, rápido y por WhatsApp.",
          description: "Estamos preparando el catalogo para esta tienda.",
          currency: "COP",
          deliveryMessage: "Aun no hay productos publicados, pero la vitrina ya esta activa.",
        },
        categories: [],
        products: [],
      }, slug);
    }
  }
}

async function loadSite() {
  if (PUBLIC_SITE_MODE === "retail") {
    await loadRetailSite();
    return;
  }

  const slug = getSlugFromLocation();

  if (!slug) {
    app.innerHTML = `
      <div class="page">
        <div class="loading-shell loading-shell-minimal" aria-label="Cargando sitio">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
    return;
  }

  const cached = readCachedPublicSite(slug);
  if (cached?.site) {
    try {
      renderShell(cached.site, slug);
      void refreshFeaturedRaffleAdvance(cached.site, slug);
      const cachedBanner = document.createElement("div");
      cachedBanner.className = "site-cache-banner";
      cachedBanner.textContent = "Mostrando contenido cargado previamente...";
      document.body.appendChild(cachedBanner);
      window.setTimeout(() => {
        cachedBanner.classList.add("is-hidden");
        window.setTimeout(() => cachedBanner.remove(), 220);
      }, 1800);
    } catch {
      // If cached render fails, fall back to loading shell below.
    }
  }

  if (!cached?.site) {
    app.innerHTML = `
      <div class="loading-shell loading-shell-minimal" aria-label="Cargando sitio">
        <div class="loading-spinner"></div>
      </div>
    `;
  }

  try {
    const site = await fetchPublicSitePayload(slug);
    renderShell(site, slug);
    void refreshFeaturedRaffleAdvance(site, slug);
  } catch (error) {
    if (!cached?.site) {
      app.innerHTML = `
        <div class="page">
          <div class="loading-shell">
            <div class="loading-card">
              <div class="loading-badge">Error</div>
              <h1>No fue posible cargar la pagina publica</h1>
              <p>Estamos teniendo un problema temporal al abrir el sitio.</p>
              <div style="margin-top:18px">
                <a class="button primary" href="/" onclick="window.location.reload(); return false;">Intentar de nuevo</a>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }
}

loadSite();






