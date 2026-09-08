(function () {
  if (window.__HIDRA_NEGOCIO_BOOTSTRAPPED__) return;
  var pathname = window.location.pathname || "/";
  if (pathname.toLowerCase().indexOf("/negocio") !== 0) return;
  window.__HIDRA_NEGOCIO_BOOTSTRAPPED__ = true;

  var params = new URLSearchParams(window.location.search || "");
  var slug = (params.get("slug") || pathname.split("/").filter(Boolean)[1] || "").trim();
  var apiBase = String(window.HIDRA_API_BASE_URL || params.get("api") || "").trim().replace(/\/+$/, "");
  var money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  var storageKey = "hidra_retail_cart_" + (slug || "sin-slug");
  var customerKey = storageKey + "_customer";
  var state = {
    loading: true,
    error: "",
    catalog: null,
    search: "",
    category: "all",
    cart: load(storageKey),
    quote: null,
    quoteError: "",
    quoteLoading: false,
    submitting: false,
    success: null,
    customer: loadCustomer(customerKey),
    paymentMethod: "PSE",
  };
  var quoteTimer = null;

  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadCustomer(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : {};
      return {
        name: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        note: "",
        ...parsed,
      };
    } catch {
      return { name: "", phone: "", email: "", address: "", city: "", note: "" };
    }
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(state.cart));
    localStorage.setItem(customerKey, JSON.stringify(state.customer));
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ascii(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  }

  function wrapReceiptLine(value, maxLen) {
    var words = ascii(value).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    var lines = [];
    var current = "";
    words.forEach(function (word) {
      if (!current) {
        current = word;
        return;
      }
      if ((current + " " + word).length <= maxLen) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function buildReceiptPdfLines(snapshot) {
    var storefrontName = ascii(snapshot && snapshot.storefrontTitle || "Vitrina retail");
    var orderReference = ascii(snapshot && snapshot.orderReference || "Pedido");
    var customer = (snapshot && snapshot.customer) || {};
    var quote = (snapshot && snapshot.quote) || {};
    var items = Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
    var lines = [];
    var dateText = snapshot && snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString("es-CO") : new Date().toLocaleString("es-CO");

    lines.push(storefrontName);
    lines.push("Comprobante de compra");
    lines.push("Pedido: " + orderReference);
    lines.push("Fecha: " + ascii(dateText));
    lines.push("");
    lines.push("Cliente: " + ascii(customer.name || "Sin nombre"));
    lines.push("Telefono: " + ascii(customer.phone || "Sin telefono"));
    if (customer.email) lines.push("Correo: " + ascii(customer.email));
    if (customer.city) lines.push("Ciudad: " + ascii(customer.city));
    if (customer.address) lines.push("Direccion: " + ascii(customer.address));
    if (customer.note) lines.push("Nota: " + ascii(customer.note));
    lines.push("");
    lines.push("Detalle:");

    if (items.length) {
      items.forEach(function (item, index) {
        var itemName = ascii(item.productName || item.name || "Producto");
        var quantity = Number(item.quantity || 0);
        var lineTotal = Number(item.lineTotal != null ? item.lineTotal : (item.unitPrice || 0) * quantity);
        var baseLine = (index + 1) + ". " + itemName + " x" + quantity + " - " + money.format(lineTotal);
        wrapReceiptLine(baseLine, 72).forEach(function (line) { lines.push(line); });
      });
    } else {
      lines.push("Sin items registrados.");
    }

    lines.push("");
    lines.push("Subtotal: " + money.format(Number(quote.subtotal || 0)));
    lines.push("Domicilio: " + money.format(Number(quote.deliveryFee || 0)));
    lines.push("Descuento: - " + money.format(Number(quote.discountTotal || 0)));
    lines.push("Total: " + money.format(Number(quote.total || 0)));
    lines.push("Metodo de pago: " + ascii(snapshot && snapshot.paymentMethod || "PSE"));
    lines.push("Estado: " + ascii(snapshot && snapshot.paymentMethod === "PSE" ? "Pendiente de pago" : "Pendiente de revision"));
    lines.push("");
    lines.push("Gracias por comprar con nosotros.");
    return lines;
  }

  function buildReceiptPdfBlob(snapshot) {
    var lines = buildReceiptPdfLines(snapshot);
    var pageHeight = 842;
    var margin = 40;
    var fontSize = 11;
    var lineHeight = 15;
    var linesPerPage = Math.max(1, Math.floor((pageHeight - (margin * 2)) / lineHeight) - 1);
    var pagesLines = [];
    for (var i = 0; i < lines.length; i += linesPerPage) {
      pagesLines.push(lines.slice(i, i + linesPerPage));
    }
    if (!pagesLines.length) pagesLines.push(["Sin informacion"]);

    var objects = [];
    function addObject(content) {
      objects.push(content);
      return objects.length;
    }

    var fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    var pagesId = addObject("");

    var contentIds = pagesLines.map(function (pageLines) {
      var commands = [];
      commands.push("BT");
      commands.push("/F1 " + fontSize + " Tf");
      commands.push("1 0 0 1 " + margin + " " + (pageHeight - margin) + " Tm");
      commands.push("14 TL");
      pageLines.forEach(function (line, index) {
        var escaped = ascii(line).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        commands.push("(" + escaped + ") Tj");
        if (index !== pageLines.length - 1) commands.push("T*");
      });
      commands.push("ET");
      var stream = commands.join("\n");
      return addObject("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    });

    var pageIds = pagesLines.map(function (_, index) {
      return addObject("<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 " + fontId + " 0 R >> >> /Contents " + contentIds[index] + " 0 R >>");
    });

    objects[pagesId - 1] = "<< /Type /Pages /Kids [" + pageIds.map(function (id) { return id + " 0 R"; }).join(" ") + "] /Count " + pageIds.length + " >>";
    var catalogId = addObject("<< /Type /Catalog /Pages " + pagesId + " 0 R >>");
    var infoId = addObject("<< /Title (" + ascii((snapshot && snapshot.orderReference ? snapshot.orderReference : "Comprobante")) + ") /Producer (Hidra Retail) >>");

    var pdf = "%PDF-1.4\n";
    var offsets = [0];
    objects.forEach(function (object, index) {
      offsets.push(pdf.length);
      pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
    });
    var xrefStart = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (var j = 1; j < offsets.length; j += 1) {
      pdf += String(offsets[j]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += "trailer << /Size " + (objects.length + 1) + " /Root " + catalogId + " 0 R /Info " + infoId + " 0 R >>\n";
    pdf += "startxref\n" + xrefStart + "\n%%EOF";
    return new Blob([pdf], { type: "application/pdf" });
  }

  function downloadReceiptPdf(snapshot) {
    if (!snapshot) return;
    var blob = buildReceiptPdfBlob(snapshot);
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "comprobante-" + ascii(snapshot.orderReference || "pedido").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase() + ".pdf";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
  }

  function api(path, options) {
    var clean = String(path || "").charAt(0) === "/" ? path : "/" + path;
    var headers = { "Content-Type": "application/json", ...(options && options.headers ? options.headers : {}) };
    return fetch(apiBase + clean, { ...(options || {}), headers: headers }).then(async function (res) {
      var text = await res.text();
      var data = text ? (function () { try { return JSON.parse(text); } catch { return text; } })() : null;
      if (!res.ok) throw new Error(typeof data === "string" ? data : (data && (data.error || data.message)) || "Error");
      return data;
    });
  }

  function products() { return Array.isArray(state.catalog && state.catalog.products) ? state.catalog.products : []; }
  function categories() { return Array.isArray(state.catalog && state.catalog.categories) ? state.catalog.categories : []; }
  function storefront() { return (state.catalog && state.catalog.storefront) || {}; }
  function findProduct(id) { return products().find(function (p) { return String(p.id) === String(id); }) || null; }
  function cartCount() { return state.cart.reduce(function (sum, item) { return sum + Number(item.quantity || 0); }, 0); }
  function cartSubtotal() { return state.cart.reduce(function (sum, item) { var p = findProduct(item.productId); return sum + (Number((Number((p && p.price) || item.unitPrice || 0) * Number(item.quantity || 0)).toFixed(2))); }, 0); }
  function quoteItems() { return state.cart.map(function (item) { return { productId: item.productId, quantity: Number(item.quantity || 0) }; }).filter(function (item) { return item.productId && item.quantity > 0; }); }

  function render() {
    var root = document.getElementById("negocio-root");
    if (!root) return;
    if (state.loading) {
      root.innerHTML = "<section class='box center'><div class='spinner'></div><strong>Cargando catalogo...</strong><p>Estamos preparando la vitrina virtual.</p></section>";
      bind(root);
      save();
      return;
    }
    if (state.error) {
      root.innerHTML = "<section class='box center'><span class='pill'>Retail</span><h1>No pudimos cargar la vitrina</h1><p>" + esc(state.error) + "</p><div class='row'><button class='btn solid' data-action='retry'>Reintentar</button><a class='btn ghost' href='/'>Volver al sitio principal</a></div></section>";
      bind(root);
      save();
      return;
    }
    if (!slug) {
      root.innerHTML = "<section class='box center'><span class='pill'>/negocio</span><h1>Falta el slug de la tienda</h1><p>Abre esta pagina como <strong>/negocio/tu-tienda</strong> para cargar el catalogo correspondiente.</p><a class='btn solid' href='/'>Volver al inicio</a></section>";
      bind(root);
      save();
      return;
    }

    var sf = storefront();
    var cats = categories();
    var list = products().filter(function (p) {
      var byCat = state.category === "all" || String(p.categoryId || "") === String(state.category);
      var hay = [p.name, p.description, p.sku, p.category && p.category.name].filter(Boolean).join(" ").toLowerCase();
      return byCat && (!state.search.trim() || hay.indexOf(state.search.trim().toLowerCase()) !== -1);
    });
    var total = money.format((state.quote && state.quote.total) != null ? state.quote.total : cartSubtotal());
    var subtotal = money.format((state.quote && state.quote.subtotal) != null ? state.quote.subtotal : cartSubtotal());
    var delivery = money.format((state.quote && state.quote.deliveryFee) != null ? state.quote.deliveryFee : 0);
    var discount = money.format((state.quote && state.quote.discountTotal) != null ? state.quote.discountTotal : 0);

    root.innerHTML = [
      "<div class='app'>",
      "<header class='topbar'>",
      "<div class='brand'><div class='logo'>" + (sf.logoUrl ? "<img src='" + esc(sf.logoUrl) + "' alt='" + esc(sf.title || "Logo") + "'>" : "RT") + "</div><div><strong>" + esc(sf.title || "Tienda virtual") + "</strong><span>" + esc(sf.subtitle || sf.description || "Vitrina virtual con carrito de compras") + "</span></div></div>",
      "<div class='row'><a class='btn ghost' href='/'>Sitio principal</a>" + (sf.whatsappNumber ? "<a class='btn solid' target='_blank' rel='noreferrer' href='https://wa.me/" + String(sf.whatsappNumber).replace(/\D/g, "") + "?text=" + encodeURIComponent("Hola, quiero informacion de " + (sf.title || "la tienda") + ".") + "'>WhatsApp</a>" : "") + "</div>",
      "</header>",
      "<section class='hero'><div><span class='pill'>/negocio/" + esc(slug) + "</span><h1>" + esc(sf.title || "Vitrina retail") + "</h1><p>" + esc(sf.description || "Compra desde la vitrina, arma tu carrito y confirma el pedido sin mezclar este flujo con rifas.") + "</p><div class='stats'><div><strong>" + products().length + "</strong><span>Productos</span></div><div><strong>" + cats.length + "</strong><span>Categorias</span></div><div><strong>" + cartCount() + "</strong><span>En carrito</span></div></div></div><aside class='hero-box'><span class='pill alt'>Catalogo + carrito</span><h2>Flujo aislado del negocio de rifas.</h2><p>Este espacio usa sus propias rutas publicas, su propia vitrina y su propio checkout.</p></aside></section>",
      "<section class='layout'><main class='main'><div class='toolbar'><input id='search' value='" + esc(state.search) + "' placeholder='Busca productos, SKU o descripcion'><div class='count'>" + products().length + " productos</div></div>",
      "<div class='chips'><button class='chip " + (state.category === "all" ? "active" : "") + "' data-cat='all'>Todo</button>" + cats.map(function (c) { return "<button class='chip " + (String(state.category) === String(c.id) ? "active" : "") + "' data-cat='" + esc(String(c.id)) + "'>" + esc(c.name) + "</button>"; }).join("") + "</div>",
      state.quoteError ? "<div class='notice'>" + esc(state.quoteError) + "</div>" : "",
      state.quoteLoading ? "<div class='quote-loading'>Calculando total del carrito...</div>" : "",
      state.success ? renderSuccessBox() : "",
      list.length ? list.map(renderProduct).join("") : "<div class='box empty'><strong>Sin resultados</strong><p>Prueba con otra categoria o busqueda.</p></div>",
      "</main><aside class='cart'><div class='cart-head'><div><div class='mini'>Carrito</div><h3>" + cartCount() + " items</h3></div><strong>" + total + "</strong></div><div class='cart-list'>" + (state.cart.length ? state.cart.map(renderCartItem).join("") : "<div class='box empty small'><strong>Carrito vacio</strong><p>Agrega productos para continuar.</p></div>") + "</div><div class='totals'><div><span>Subtotal</span><strong>" + subtotal + "</strong></div><div><span>Domicilio</span><strong>" + delivery + "</strong></div><div><span>Descuento</span><strong>- " + discount + "</strong></div><div class='final'><span>Total</span><strong>" + total + "</strong></div></div><form id='checkout' class='checkout'><input name='name' placeholder='Nombre' value='" + esc(state.customer.name) + "' required><input name='phone' placeholder='Telefono' value='" + esc(state.customer.phone) + "' required><input name='email' placeholder='Correo' value='" + esc(state.customer.email) + "' type='email'><select id='payment-method' name='payment_method'><option value='PSE'" + (String(state.paymentMethod || "PSE").toUpperCase() === "PSE" ? " selected" : "") + ">PSE</option><option value='COMPROBANTE'" + (String(state.paymentMethod || "PSE").toUpperCase() === "COMPROBANTE" ? " selected" : "") + ">Comprobante</option></select><input name='city' placeholder='Ciudad' value='" + esc(state.customer.city) + "'><input name='address' placeholder='Direccion' value='" + esc(state.customer.address) + "' required><textarea name='note' rows='3' placeholder='Notas'>" + esc(state.customer.note) + "</textarea><button class='btn solid' type='submit'" + (state.submitting || !state.cart.length ? " disabled" : "") + ">" + (state.submitting ? "Confirmando..." : "Confirmar pedido") + "</button><button class='btn ghost' type='button' data-action='clear-cart'" + (!state.cart.length ? " disabled" : "") + ">Vaciar carrito</button></form></aside></section></div>"
    ].join("");
    bind(root);
    save();
  }

  function renderProduct(p) {
    var inCart = state.cart.find(function (item) { return String(item.productId) === String(p.id); });
    var qty = Number((inCart && inCart.quantity) || 0);
    var stock = Number(p.stock || 0);
    var blocked = p.trackStock !== false && stock <= 0;
    return "<article class='product" + (blocked ? " blocked" : "") + "'><div class='img-wrap'>" + (p.imageUrl ? "<img src='" + esc(p.imageUrl) + "' alt='" + esc(p.name) + "'>" : "<div class='img-placeholder'>Sin imagen</div>") + (p.isFeatured ? "<span class='badge'>Destacado</span>" : "") + "</div><div class='body'><div class='meta'>" + (p.category && p.category.name ? "<span>" + esc(p.category.name) + "</span>" : "") + "<span class='stock " + (stock > 0 || p.trackStock === false ? "ok" : "low") + "'>" + (p.trackStock === false ? "Stock libre" : blocked ? "Agotado" : stock + " disponibles") + "</span></div><h3>" + esc(p.name) + "</h3><p>" + esc(p.description || "Producto disponible en la vitrina.") + "</p><div class='price-row'><strong>" + money.format(Number(p.price || 0)) + "</strong><button data-action='add' data-id='" + esc(String(p.id)) + "'" + (blocked ? " disabled" : "") + ">" + (qty ? "En carrito (" + qty + ")" : "Agregar") + "</button></div></div></article>";
  }

  function renderCartItem(item) {
    var p = findProduct(item.productId);
    var price = Number((p && p.price) || item.unitPrice || 0);
    var line = price * Number(item.quantity || 0);
    return "<div class='cart-item'><div><strong>" + esc((p && p.name) || item.name || "Producto") + "</strong><div class='sub'>" + esc((p && p.sku) || (p && p.category && p.category.name) || "Sin referencia") + "</div></div><div class='qty'><button data-action='dec' data-id='" + esc(String(item.productId)) + "'>-</button><span>" + Number(item.quantity || 0) + "</span><button data-action='inc' data-id='" + esc(String(item.productId)) + "'>+</button></div><div class='line'>" + money.format(line) + "</div><button class='remove' data-action='remove' data-id='" + esc(String(item.productId)) + "'>Quitar</button></div>";
  }

  function renderSuccessBox() {
    var paymentMethod = String(state.success.paymentMethod || state.paymentMethod || "PSE").toUpperCase();
    var paymentLink = String(state.success.paymentLink || "").trim();
    var whatsappLink = String(state.success.whatsappLink || "").trim();
    var receipt = state.success.receipt || null;
    var paymentBlock = "";

    if (paymentMethod === "PSE" && paymentLink) {
      paymentBlock = "<div class='notice'>Pago PSE listo. Usa el enlace para completar la compra.</div><div class='row'><a class='btn solid' target='_blank' rel='noreferrer' href='" + esc(paymentLink) + "'>Pagar con PSE</a></div>";
    } else if (paymentMethod === "COMPROBANTE") {
      paymentBlock = "<div class='notice'>Elegiste comprobante. El pedido quedo en revision y puedes enviar el soporte por WhatsApp.</div>";
    }

    return "<div class='box success'><span class='pill'>Pedido creado</span><h2>" + esc(state.success.orderReference || "Pedido") + "</h2><p>" + esc(state.success.message || "") + "</p>" + paymentBlock + "<div class='row'>" + (receipt ? "<button class='btn ghost' data-action='download-receipt'>Descargar comprobante PDF</button>" : "") + (whatsappLink ? "<a class='btn solid' target='_blank' rel='noreferrer' href='" + esc(whatsappLink) + "'>Abrir WhatsApp</a>" : "") + "<button class='btn ghost' data-action='reset-success'>Seguir comprando</button></div></div>";
  }

  function bind(root) {
    root.querySelectorAll("[data-cat]").forEach(function (btn) { btn.addEventListener("click", function () { state.category = String(btn.getAttribute("data-cat") || "all"); render(); }); });
    root.querySelectorAll("[data-action='add']").forEach(function (btn) { btn.addEventListener("click", function () { add(btn.getAttribute("data-id")); }); });
    root.querySelectorAll("[data-action='inc']").forEach(function (btn) { btn.addEventListener("click", function () { changeQty(btn.getAttribute("data-id"), 1); }); });
    root.querySelectorAll("[data-action='dec']").forEach(function (btn) { btn.addEventListener("click", function () { changeQty(btn.getAttribute("data-id"), -1); }); });
    root.querySelectorAll("[data-action='remove']").forEach(function (btn) { btn.addEventListener("click", function () { remove(btn.getAttribute("data-id")); }); });
    var search = root.querySelector("#search");
    if (search) search.addEventListener("input", function () { state.search = search.value || ""; render(); });
    var form = root.querySelector("#checkout");
    if (form) form.addEventListener("submit", submitOrder);
    var paymentSelect = root.querySelector("#payment-method");
    if (paymentSelect) {
      paymentSelect.addEventListener("change", function () {
        state.paymentMethod = String(paymentSelect.value || "PSE").toUpperCase();
      });
    }
    root.querySelectorAll("[data-action='clear-cart']").forEach(function (btn) { btn.addEventListener("click", clearCart); });
    root.querySelectorAll("[data-action='download-receipt']").forEach(function (btn) { btn.addEventListener("click", function () { downloadReceiptPdf(state.success && state.success.receipt); }); });
    root.querySelectorAll("[data-action='retry']").forEach(function (btn) { btn.addEventListener("click", loadCatalog); });
    root.querySelectorAll("[data-action='reset-success']").forEach(function (btn) { btn.addEventListener("click", function () { state.success = null; render(); }); });
  }

  function add(id) {
    var p = findProduct(id);
    if (!p) return;
    var stock = p.trackStock === false ? Infinity : Number(p.stock || 0);
    var item = state.cart.find(function (row) { return String(row.productId) === String(id); });
    var next = Number((item && item.quantity) || 0) + 1;
    if (next > stock) { state.quoteError = "No hay mas stock para " + p.name + "."; render(); return; }
    if (item) item.quantity = next; else state.cart.push({ productId: p.id, name: p.name, unitPrice: Number(p.price || 0), quantity: 1 });
    state.quoteError = "";
    scheduleQuote();
    render();
  }

  function changeQty(id, delta) {
    var item = state.cart.find(function (row) { return String(row.productId) === String(id); });
    if (!item) return;
    var p = findProduct(id);
    var stock = (p && p.trackStock === false) ? Infinity : Number((p && p.stock) || 0);
    var next = Number(item.quantity || 0) + delta;
    if (next <= 0) state.cart = state.cart.filter(function (row) { return String(row.productId) !== String(id); });
    else item.quantity = Math.min(next, stock);
    scheduleQuote();
    render();
  }

  function remove(id) {
    state.cart = state.cart.filter(function (row) { return String(row.productId) !== String(id); });
    scheduleQuote();
    render();
  }

  function clearCart() {
    state.cart = [];
    state.quote = null;
    state.quoteError = "";
    render();
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!state.cart.length) return;
    var data = new FormData(event.currentTarget);
    state.paymentMethod = String(data.get("payment_method") || state.paymentMethod || "PSE").toUpperCase();
    state.paymentMethod = String(data.get("payment_method") || state.paymentMethod || "PSE").toUpperCase();
    state.customer = { name: String(data.get("name") || ""), phone: String(data.get("phone") || ""), email: String(data.get("email") || ""), city: String(data.get("city") || ""), address: String(data.get("address") || ""), note: String(data.get("note") || "") };
    localStorage.setItem(customerKey, JSON.stringify(state.customer));
    state.submitting = true;
    render();
    try {
      var response = await api("/public-retail/" + encodeURIComponent(slug) + "/orders", {
        method: "POST",
        body: JSON.stringify({
          items: quoteItems(),
          customer_name: state.customer.name,
          customer_phone: state.customer.phone,
          customer_email: state.customer.email,
          customer_address: state.customer.address,
          customer_city: state.customer.city,
          note: state.customer.note,
          payment_method: state.paymentMethod,
        }),
      });
      var payment = response && response.payment ? response.payment : null;
      state.success = {
        orderReference: (response && response.order && response.order.orderReference) || response.order_reference || response.reference || "Pedido creado",
        message: payment && payment.method === "PSE"
          ? "Tu pedido quedo confirmado. Usa el enlace de pago para completar la compra."
          : response && response.whatsapp && response.whatsapp.sent
            ? "Tu pedido quedo confirmado y el resumen salio por WhatsApp."
            : "Tu pedido quedo confirmado. Un asesor te contactara pronto.",
        whatsappLink: response && response.whatsappLink ? response.whatsappLink : "",
        paymentMethod: payment && payment.method ? payment.method : state.paymentMethod,
        paymentLink: payment && payment.paymentLink ? payment.paymentLink : "",
        receipt: {
          storefrontTitle: response && response.storefront && response.storefront.title ? response.storefront.title : storefront().title || "Vitrina retail",
          orderReference: (response && response.order && response.order.orderReference) || response.order_reference || response.reference || "Pedido creado",
          createdAt: response && response.order && response.order.createdAt ? response.order.createdAt : new Date().toISOString(),
          customer: {
            name: state.customer.name,
            phone: state.customer.phone,
            email: state.customer.email,
            city: state.customer.city,
            address: state.customer.address,
            note: state.customer.note,
          },
          quote: response && response.quote ? response.quote : null,
          items: response && response.quote && Array.isArray(response.quote.items) ? response.quote.items : [],
          paymentMethod: payment && payment.method ? payment.method : state.paymentMethod,
        },
      };
      state.cart = [];
      state.quote = null;
      state.quoteError = "";
    } catch (error) {
      state.quoteError = error.message || "No fue posible confirmar el pedido.";
    } finally {
      state.submitting = false;
      render();
    }
  }

  function scheduleQuote() {
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = setTimeout(async function () {
      if (!slug || !state.cart.length) {
        state.quote = null;
        state.quoteLoading = false;
        render();
        return;
      }
      state.quoteLoading = true;
      render();
      try {
        state.quote = await api("/public-retail/" + encodeURIComponent(slug) + "/cart/quote", { method: "POST", body: JSON.stringify({ items: quoteItems() }) });
        state.quoteError = "";
      } catch (error) {
        state.quote = null;
        state.quoteError = error.message || "No fue posible recalcular el carrito.";
      } finally {
        state.quoteLoading = false;
        render();
      }
    }, 250);
  }

  async function loadCatalog() {
    if (!slug) { state.loading = false; render(); return; }
    state.loading = true;
    render();
    try {
      state.catalog = await api("/public-retail/" + encodeURIComponent(slug));
      var allowed = new Set(products().map(function (p) { return String(p.id); }));
      state.cart = state.cart.filter(function (item) { return allowed.has(String(item.productId)); });
      scheduleQuote();
    } catch (error) {
      state.error = error.message || "No fue posible cargar el catalogo retail.";
    } finally {
      state.loading = false;
      render();
    }
  }

  var style = document.createElement("style");
  style.textContent = `
    body.negocio-body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(circle at top left,#163b66 0%,#0d2444 35%,#07111f 100%);color:#f8fafc}
    .app{max-width:1400px;margin:0 auto;padding:22px}
    .topbar,.hero,.layout,.product,.cart,.box{box-sizing:border-box}
    .topbar{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:rgba(10,18,33,.76);backdrop-filter:blur(18px);flex-wrap:wrap}
    .brand{display:flex;gap:14px;align-items:center}.brand .logo{width:62px;height:62px;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#fbbf24,#34d399);display:flex;align-items:center;justify-content:center;color:#0f172a;font-weight:900}.brand .logo img{width:100%;height:100%;object-fit:contain;padding:8px;box-sizing:border-box}.brand strong{display:block;font-size:1.1rem}.brand span{color:#cbd5e1;font-size:.9rem}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .btn{border:none;border-radius:16px;font:inherit;font-weight:700;cursor:pointer;padding:12px 16px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.btn.ghost{background:rgba(255,255,255,.08);color:#f8fafc;border:1px solid rgba(255,255,255,.14)}.btn.solid{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#09111f;box-shadow:0 10px 24px rgba(251,191,36,.22)}
    .hero{margin-top:18px;padding:24px;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:rgba(10,18,33,.72);display:grid;grid-template-columns:1.4fr .9fr;gap:18px}.hero h1{margin:12px 0 0;font-size:clamp(2rem,4vw,4rem);line-height:.95;letter-spacing:-.04em}.hero p{color:#cbd5e1;line-height:1.7}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.stats div,.hero-box,.product,.cart,.box,.notice,.empty{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:22px}.stats div{padding:14px}.stats strong{display:block;font-size:1.3rem;margin-bottom:4px}.stats span{color:#cbd5e1;font-size:.88rem}.pill{display:inline-flex;padding:7px 12px;border-radius:999px;background:rgba(56,189,248,.12);color:#c8f1ff;font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.pill.alt{background:rgba(251,191,36,.12);color:#fff0bf}
    .hero-box{padding:20px;display:grid;gap:12px;align-content:space-between}.hero-box h2{margin:0;font-size:1.35rem;line-height:1.1}.hero-box p{margin:0;color:#cbd5e1}
    .layout{margin-top:18px;display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:18px;align-items:start}.main{display:grid;gap:16px}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end}.toolbar input,.checkout input,.checkout textarea{width:100%;box-sizing:border-box;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#f8fafc;padding:12px 14px;font:inherit;outline:none}.count{color:#cbd5e1;font-size:.9rem;padding-bottom:12px}.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.06);color:#f8fafc;border:1px solid rgba(255,255,255,.12);font-weight:700;cursor:pointer}.chip.active{background:rgba(251,191,36,.18);border-color:rgba(251,191,36,.38)}
    .product{overflow:hidden;display:grid;min-height:100%}.product.blocked{opacity:.72}.img-wrap{position:relative;aspect-ratio:1.25/1;background:linear-gradient(145deg,rgba(251,191,36,.10),rgba(56,189,248,.10))}.img-wrap img,.img-placeholder{width:100%;height:100%;object-fit:cover;display:block}.img-placeholder{display:flex;align-items:center;justify-content:center;color:rgba(226,232,240,.7);font-weight:700}.badge{position:absolute;top:12px;left:12px;padding:6px 10px;border-radius:999px;background:rgba(251,191,36,.18);font-size:.75rem;font-weight:800}.body{padding:16px;display:grid;gap:12px}.body h3{margin:0;font-size:1.08rem}.body p{margin:0;color:#cbd5e1;line-height:1.5;min-height:3.1em}.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.meta span,.stock{padding:6px 10px;border-radius:999px;font-size:.78rem;font-weight:700}.stock.ok{background:rgba(52,211,153,.12);color:#9af5cf}.stock.low{background:rgba(248,113,113,.12);color:#ffb4b4}.price-row{display:flex;justify-content:space-between;gap:12px;align-items:end}.price-row strong{display:block;font-size:1.15rem}.price-row button{padding:11px 14px;border:none;border-radius:16px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#09111f;font-weight:700;cursor:pointer}.price-row button:disabled{opacity:.5;cursor:not-allowed}
    .cart{padding:18px;position:sticky;top:18px;display:grid;gap:14px;background:rgba(12,24,45,.92)}.cart-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.cart-head h3{margin:6px 0 0;font-size:1.4rem}.mini{display:inline-flex;padding:7px 12px;border-radius:999px;background:rgba(56,189,248,.12);color:#c8f1ff;font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.cart-list{display:grid;gap:10px;max-height:320px;overflow:auto;padding-right:4px}.cart-item{display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:center;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}.sub{margin-top:4px;color:#cbd5e1;font-size:.82rem}.qty{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.qty button{width:30px;height:30px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.10);color:#f8fafc}.line{font-weight:800;color:#fff6d6;text-align:right;min-width:84px}.remove{padding:10px 12px;border-radius:16px;background:rgba(248,113,113,.12);color:#ffb4b4;border:1px solid rgba(248,113,113,.18);cursor:pointer}.totals{display:grid;gap:10px;padding:14px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}.totals div{display:flex;justify-content:space-between;gap:10px;color:#cbd5e1}.totals strong{color:#f8fafc}.totals .final{padding-top:10px;margin-top:4px;border-top:1px solid rgba(255,255,255,.10);color:#fff;font-size:1.04rem}.checkout{display:grid;gap:10px}
    .success,.empty,.notice,.quote-loading,.loading,.error{padding:18px}.success{background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.22);display:grid;gap:10px}.notice{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);color:#ffdf8b}.empty{color:#cbd5e1}.empty p{margin:8px 0 0}.quote-loading{border-radius:18px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.22);color:#c8f1ff}.box.center,.loading,.error{max-width:680px;margin:40px auto 0;text-align:center;display:grid;gap:14px;justify-items:center;border-radius:24px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05)}.spinner{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.14);border-top-color:#fbbf24;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    @media (max-width:1100px){.layout{grid-template-columns:1fr}.cart{position:static}}@media (max-width:768px){.app{padding:14px}.hero,.toolbar,.stats,.cart-item{grid-template-columns:1fr}.cart-item{justify-items:start}.line{text-align:left}}
  `;
  document.head.appendChild(style);
  document.body.innerHTML = "<div id=\"negocio-root\"></div>";
  document.body.classList.add("negocio-body");
  render();
  loadCatalog();

  function bind(root) {
    root.querySelectorAll("[data-cat]").forEach(function (btn) { btn.addEventListener("click", function () { state.category = String(btn.getAttribute("data-cat") || "all"); render(); }); });
    root.querySelectorAll("[data-action='add']").forEach(function (btn) { btn.addEventListener("click", function () { add(btn.getAttribute("data-id")); }); });
    root.querySelectorAll("[data-action='inc']").forEach(function (btn) { btn.addEventListener("click", function () { changeQty(btn.getAttribute("data-id"), 1); }); });
    root.querySelectorAll("[data-action='dec']").forEach(function (btn) { btn.addEventListener("click", function () { changeQty(btn.getAttribute("data-id"), -1); }); });
    root.querySelectorAll("[data-action='remove']").forEach(function (btn) { btn.addEventListener("click", function () { remove(btn.getAttribute("data-id")); }); });
    var search = root.querySelector("#search"); if (search) search.addEventListener("input", function () { state.search = search.value || ""; render(); });
    var form = root.querySelector("#checkout"); if (form) form.addEventListener("submit", submitOrder);
    var paymentSelect = root.querySelector("#payment-method"); if (paymentSelect) paymentSelect.addEventListener("change", function () { state.paymentMethod = String(paymentSelect.value || "PSE").toUpperCase(); });
    root.querySelectorAll("[data-action='clear-cart']").forEach(function (btn) { btn.addEventListener("click", clearCart); });
    root.querySelectorAll("[data-action='retry']").forEach(function (btn) { btn.addEventListener("click", loadCatalog); });
    root.querySelectorAll("[data-action='reset-success']").forEach(function (btn) { btn.addEventListener("click", function () { state.success = null; render(); }); });
  }

  function render() {
    var root = document.getElementById("negocio-root");
    if (!root) return;
    root.innerHTML = shell();
    bind(root);
    save();
  }

  function shell() {
    if (state.loading) return "<section class='loading'><div class='spinner'></div><strong>Cargando catalogo...</strong><p>Estamos preparando la vitrina virtual.</p></section>";
    if (state.error) return "<section class='box center'><span class='pill'>Retail</span><h1>No pudimos cargar la vitrina</h1><p>" + esc(state.error) + "</p><div class='row'><button class='btn solid' data-action='retry'>Reintentar</button><a class='btn ghost' href='/'>Volver al sitio principal</a></div></section>";
    if (!slug) return "<section class='box center'><span class='pill'>/negocio</span><h1>Falta el slug de la tienda</h1><p>Abre esta pagina como <strong>/negocio/tu-tienda</strong> para cargar el catalogo correspondiente.</p><a class='btn solid' href='/'>Volver al inicio</a></section>";
    var sf = storefront(), cats = categories(), list = products().filter(function (p) { var byCat = state.category === "all" || String(p.categoryId || "") === String(state.category); var hay = [p.name, p.description, p.sku, p.category && p.category.name].filter(Boolean).join(" ").toLowerCase(); return byCat && (!state.search.trim() || hay.indexOf(state.search.trim().toLowerCase()) !== -1); });
    var total = money.format(state.quote && state.quote.total != null ? state.quote.total : cartSubtotal());
    var subtotal = money.format(state.quote && state.quote.subtotal != null ? state.quote.subtotal : cartSubtotal());
    var delivery = money.format(state.quote && state.quote.deliveryFee != null ? state.quote.deliveryFee : 0);
    var discount = money.format(state.quote && state.quote.discountTotal != null ? state.quote.discountTotal : 0);
    return "<div class='app'><header class='topbar'><div class='brand'><div class='logo'>" + (sf.logoUrl ? "<img src='" + esc(sf.logoUrl) + "' alt='" + esc(sf.title || "Logo") + "'>" : "RT") + "</div><div><strong>" + esc(sf.title || "Tienda virtual") + "</strong><span>" + esc(sf.subtitle || sf.description || "Vitrina virtual con carrito de compras") + "</span></div></div><div class='row'><a class='btn ghost' href='/'>Sitio principal</a>" + (sf.whatsappNumber ? "<a class='btn solid' target='_blank' rel='noreferrer' href='https://wa.me/" + String(sf.whatsappNumber).replace(/\D/g, "") + "?text=" + encodeURIComponent("Hola, quiero informacion de " + (sf.title || "la tienda") + ".") + "'>WhatsApp</a>" : "") + "</div></header><section class='hero'><div><span class='pill'>/negocio/" + esc(slug) + "</span><h1>" + esc(sf.title || "Vitrina retail") + "</h1><p>" + esc(sf.description || "Compra desde la vitrina, arma tu carrito y confirma el pedido sin mezclar este flujo con rifas.") + "</p><div class='stats'><div><strong>" + products().length + "</strong><span>Productos</span></div><div><strong>" + cats.length + "</strong><span>Categorias</span></div><div><strong>" + cartCount() + "</strong><span>En carrito</span></div></div></div><aside class='hero-box'><span class='pill alt'>Catalogo + carrito</span><h2>Flujo aislado del negocio de rifas.</h2><p>Este espacio usa sus propias rutas publicas, su propia vitrina y su propio checkout.</p></aside></section><section class='layout'><main class='main'><div class='toolbar'><input id='search' value='" + esc(state.search) + "' placeholder='Busca productos, SKU o descripcion'><div class='count'>" + products().length + " productos</div></div><div class='chips'><button class='chip " + (state.category === "all" ? "active" : "") + "' data-cat='all'>Todo</button>" + cats.map(function (c) { return "<button class='chip " + (String(state.category) === String(c.id) ? "active" : "") + "' data-cat='" + esc(String(c.id)) + "'>" + esc(c.name) + "</button>"; }).join("") + "</div>" + (state.quoteError ? "<div class='notice'>" + esc(state.quoteError) + "</div>" : "") + (state.quoteLoading ? "<div class='quote-loading'>Calculando total del carrito...</div>" : "") + (state.success ? "<div class='success'><span class='pill'>Pedido creado</span><h2>" + esc(state.success.orderReference || "Pedido") + "</h2><p>" + esc(state.success.message || "") + "</p><div class='row'>" + (state.success.receipt ? "<button class='btn ghost' data-action='download-receipt'>Descargar comprobante PDF</button>" : "") + (state.success.whatsappLink ? "<a class='btn solid' target='_blank' rel='noreferrer' href='" + esc(state.success.whatsappLink) + "'>Abrir WhatsApp</a>" : "") + "<button class='btn ghost' data-action='reset-success'>Seguir comprando</button></div></div>" : "") + (list.length ? list.map(renderProduct).join("") : "<div class='empty'><strong>Sin resultados</strong><p>Prueba con otra categoria o busqueda.</p></div>") + "</main><aside class='cart'><div class='cart-head'><div><div class='mini'>Carrito</div><h3>" + cartCount() + " items</h3></div><strong>" + total + "</strong></div><div class='cart-list'>" + (state.cart.length ? state.cart.map(renderCartItem).join("") : "<div class='box empty small'><strong>Carrito vacio</strong><p>Agrega productos para continuar.</p></div>") + "</div><div class='totals'><div><span>Subtotal</span><strong>" + subtotal + "</strong></div><div><span>Domicilio</span><strong>" + delivery + "</strong></div><div><span>Descuento</span><strong>- " + discount + "</strong></div><div class='final'><span>Total</span><strong>" + total + "</strong></div></div><form id='checkout' class='checkout'><input name='name' placeholder='Nombre' value='" + esc(state.customer.name) + "' required><input name='phone' placeholder='Telefono' value='" + esc(state.customer.phone) + "' required><input name='email' placeholder='Correo' value='" + esc(state.customer.email) + "' type='email'><input name='city' placeholder='Ciudad' value='" + esc(state.customer.city) + "'><input name='address' placeholder='Direccion' value='" + esc(state.customer.address) + "' required><textarea name='note' rows='3' placeholder='Notas'>" + esc(state.customer.note) + "</textarea><button class='btn solid' type='submit'" + (state.submitting || !state.cart.length ? " disabled" : "") + ">" + (state.submitting ? "Confirmando..." : "Confirmar pedido") + "</button><button class='btn ghost' type='button' data-action='clear-cart'" + (!state.cart.length ? " disabled" : "") + ">Vaciar carrito</button></form></aside></section></div>";
  }

  function renderProduct(p) {
    var inCart = state.cart.find(function (item) { return String(item.productId) === String(p.id); });
    var qty = Number(inCart && inCart.quantity || 0);
    var stock = Number(p.stock || 0);
    var blocked = p.trackStock !== false && stock <= 0;
    return "<article class='product" + (blocked ? " blocked" : "") + "'><div class='img-wrap'>" + (p.imageUrl ? "<img src='" + esc(p.imageUrl) + "' alt='" + esc(p.name) + "'>" : "<div class='img-placeholder'>Sin imagen</div>") + (p.isFeatured ? "<span class='badge'>Destacado</span>" : "") + "</div><div class='body'><div class='meta'>" + (p.category && p.category.name ? "<span>" + esc(p.category.name) + "</span>" : "") + "<span class='stock " + (stock > 0 || p.trackStock === false ? "ok" : "low") + "'>" + (p.trackStock === false ? "Stock libre" : blocked ? "Agotado" : stock + " disponibles") + "</span></div><h3>" + esc(p.name) + "</h3><p>" + esc(p.description || "Producto disponible en la vitrina.") + "</p><div class='price-row'><strong>" + money.format(Number(p.price || 0)) + "</strong><button data-action='add' data-id='" + esc(String(p.id)) + "'" + (blocked ? " disabled" : "") + ">" + (qty ? "En carrito (" + qty + ")" : "Agregar") + "</button></div></div></article>";
  }

  function renderCartItem(item) {
    var p = findProduct(item.productId);
    var price = Number((p && p.price) || item.unitPrice || 0);
    var line = price * Number(item.quantity || 0);
    return "<div class='cart-item'><div><strong>" + esc((p && p.name) || item.name || "Producto") + "</strong><div class='sub'>" + esc((p && p.sku) || p && p.category && p.category.name || "Sin referencia") + "</div></div><div class='qty'><button data-action='dec' data-id='" + esc(String(item.productId)) + "'>-</button><span>" + Number(item.quantity || 0) + "</span><button data-action='inc' data-id='" + esc(String(item.productId)) + "'>+</button></div><div class='line'>" + money.format(line) + "</div><button class='remove' data-action='remove' data-id='" + esc(String(item.productId)) + "'>Quitar</button></div>";
  }

  function quote() {
    return state.cart.map(function (item) { return { productId: item.productId, quantity: Number(item.quantity || 0) }; }).filter(function (item) { return item.productId && item.quantity > 0; });
  }

  function quoteSchedule() {
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = setTimeout(function () {
      if (!slug || !state.cart.length) { state.quote = null; state.quoteLoading = false; render(); return; }
      state.quoteLoading = true;
      render();
      api("/public-retail/" + encodeURIComponent(slug) + "/cart/quote", { method: "POST", body: JSON.stringify({ items: quote() }) }).then(function (data) {
        state.quote = data;
        state.quoteError = "";
      }).catch(function (error) {
        state.quote = null;
        state.quoteError = error.message || "No fue posible recalcular el carrito.";
      }).finally(function () {
        state.quoteLoading = false;
        render();
      });
    }, 250);
  }

  function loadCatalog() {
    if (!slug) { state.loading = false; render(); return; }
    state.loading = true;
    render();
    api("/public-retail/" + encodeURIComponent(slug)).then(function (data) {
      state.catalog = data;
      var allowed = new Set(products().map(function (p) { return String(p.id); }));
      state.cart = state.cart.filter(function (item) { return allowed.has(String(item.productId)); });
      quoteSchedule();
    }).catch(function (error) {
      state.error = error.message || "No fue posible cargar el catalogo retail.";
    }).finally(function () {
      state.loading = false;
      render();
    });
  }

  function add(id) {
    var p = findProduct(id);
    if (!p) return;
    var stock = p.trackStock === false ? Infinity : Number(p.stock || 0);
    var item = state.cart.find(function (row) { return String(row.productId) === String(id); });
    var next = Number(item && item.quantity || 0) + 1;
    if (next > stock) { state.quoteError = "No hay mas stock para " + p.name + "."; render(); return; }
    if (item) item.quantity = next; else state.cart.push({ productId: p.id, name: p.name, unitPrice: Number(p.price || 0), quantity: 1 });
    state.quoteError = "";
    quoteSchedule();
    render();
  }

  function changeQty(id, delta) {
    var item = state.cart.find(function (row) { return String(row.productId) === String(id); });
    if (!item) return;
    var p = findProduct(id);
    var stock = p && p.trackStock === false ? Infinity : Number(p && p.stock || 0);
    var next = Number(item.quantity || 0) + delta;
    if (next <= 0) state.cart = state.cart.filter(function (row) { return String(row.productId) !== String(id); });
    else item.quantity = Math.min(next, stock);
    quoteSchedule();
    render();
  }

  function remove(id) {
    state.cart = state.cart.filter(function (row) { return String(row.productId) !== String(id); });
    quoteSchedule();
    render();
  }

  function clearCart() {
    state.cart = [];
    state.quote = null;
    state.quoteError = "";
    render();
  }

  function submitOrder(event) {
    event.preventDefault();
    if (!state.cart.length) return;
    var data = new FormData(event.currentTarget);
    state.customer = { name: String(data.get("name") || ""), phone: String(data.get("phone") || ""), email: String(data.get("email") || ""), city: String(data.get("city") || ""), address: String(data.get("address") || ""), note: String(data.get("note") || "") };
    localStorage.setItem(customerKey, JSON.stringify(state.customer));
    state.submitting = true;
    render();
    api("/public-retail/" + encodeURIComponent(slug) + "/orders", {
      method: "POST",
      body: JSON.stringify({
        items: quote(),
        customer_name: state.customer.name,
        customer_phone: state.customer.phone,
        customer_email: state.customer.email,
        customer_address: state.customer.address,
        customer_city: state.customer.city,
        note: state.customer.note,
        payment_method: state.paymentMethod,
      }),
    }).then(function (response) {
      var payment = response && response.payment ? response.payment : null;
      state.success = {
        orderReference: response && response.order && response.order.orderReference || response.order_reference || response.reference || "Pedido creado",
        message: payment && payment.method === "PSE"
          ? "Tu pedido quedo confirmado. Usa el enlace de pago para completar la compra."
          : response && response.whatsapp && response.whatsapp.sent
            ? "Tu pedido quedo confirmado y el resumen salio por WhatsApp."
            : "Tu pedido quedo confirmado. Un asesor te contactara pronto.",
        whatsappLink: response && response.whatsappLink || "",
        paymentMethod: payment && payment.method ? payment.method : state.paymentMethod,
        paymentLink: payment && payment.paymentLink ? payment.paymentLink : "",
        receipt: {
          storefrontTitle: response && response.storefront && response.storefront.title ? response.storefront.title : storefront().title || "Vitrina retail",
          orderReference: response && response.order && response.order.orderReference || response.order_reference || response.reference || "Pedido creado",
          createdAt: response && response.order && response.order.createdAt ? response.order.createdAt : new Date().toISOString(),
          customer: {
            name: state.customer.name,
            phone: state.customer.phone,
            email: state.customer.email,
            city: state.customer.city,
            address: state.customer.address,
            note: state.customer.note,
          },
          quote: response && response.quote ? response.quote : null,
          items: response && response.quote && Array.isArray(response.quote.items) ? response.quote.items : [],
          paymentMethod: payment && payment.method ? payment.method : state.paymentMethod,
        },
      };
      state.cart = [];
      state.quote = null;
      state.quoteError = "";
    }).catch(function (error) {
      state.quoteError = error.message || "No fue posible confirmar el pedido.";
    }).finally(function () {
      state.submitting = false;
      render();
    });
  }

  function bind(root) {
    root.querySelectorAll("[data-cat]").forEach(function (btn) { btn.addEventListener("click", function () { state.category = String(btn.getAttribute("data-cat") || "all"); render(); }); });
    root.querySelectorAll("[data-action='add']").forEach(function (btn) { btn.addEventListener("click", function () { add(btn.getAttribute("data-id")); }); });
    root.querySelectorAll("[data-action='inc']").forEach(function (btn) { btn.addEventListener("click", function () { changeQty(btn.getAttribute("data-id"), 1); }); });
    root.querySelectorAll("[data-action='dec']").forEach(function (btn) { btn.addEventListener("click", function () { changeQty(btn.getAttribute("data-id"), -1); }); });
    root.querySelectorAll("[data-action='remove']").forEach(function (btn) { btn.addEventListener("click", function () { remove(btn.getAttribute("data-id")); }); });
    var search = root.querySelector("#search"); if (search) search.addEventListener("input", function () { state.search = search.value || ""; render(); });
    var form = root.querySelector("#checkout"); if (form) form.addEventListener("submit", submitOrder);
    root.querySelectorAll("[data-action='download-receipt']").forEach(function (btn) { btn.addEventListener("click", function () { downloadReceiptPdf(state.success && state.success.receipt); }); });
    root.querySelectorAll("[data-action='clear-cart']").forEach(function (btn) { btn.addEventListener("click", clearCart); });
    root.querySelectorAll("[data-action='retry']").forEach(function (btn) { btn.addEventListener("click", loadCatalog); });
    root.querySelectorAll("[data-action='reset-success']").forEach(function (btn) { btn.addEventListener("click", function () { state.success = null; render(); }); });
  }

  function mount() {
    var style = document.createElement("style");
    style.textContent = `
      body.negocio-body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(circle at top left,#163b66 0%,#0d2444 35%,#07111f 100%);color:#f8fafc}
      .app{max-width:1400px;margin:0 auto;padding:22px}
      .topbar,.hero,.layout,.product,.cart,.box{box-sizing:border-box}
      .topbar{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:rgba(10,18,33,.76);backdrop-filter:blur(18px);flex-wrap:wrap}
      .brand{display:flex;gap:14px;align-items:center}.brand .logo{width:62px;height:62px;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#fbbf24,#34d399);display:flex;align-items:center;justify-content:center;color:#0f172a;font-weight:900}.brand .logo img{width:100%;height:100%;object-fit:contain;padding:8px;box-sizing:border-box}.brand strong{display:block;font-size:1.1rem}.brand span{color:#cbd5e1;font-size:.9rem}
      .row{display:flex;gap:10px;flex-wrap:wrap}
      .btn{border:none;border-radius:16px;font:inherit;font-weight:700;cursor:pointer;padding:12px 16px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.btn.ghost{background:rgba(255,255,255,.08);color:#f8fafc;border:1px solid rgba(255,255,255,.14)}.btn.solid{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#09111f;box-shadow:0 10px 24px rgba(251,191,36,.22)}
      .hero{margin-top:18px;padding:24px;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:rgba(10,18,33,.72);display:grid;grid-template-columns:1.4fr .9fr;gap:18px}.hero h1{margin:12px 0 0;font-size:clamp(2rem,4vw,4rem);line-height:.95;letter-spacing:-.04em}.hero p{color:#cbd5e1;line-height:1.7}
      .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.stats div,.hero-box,.product,.cart,.box,.notice,.empty{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:22px}.stats div{padding:14px}.stats strong{display:block;font-size:1.3rem;margin-bottom:4px}.stats span{color:#cbd5e1;font-size:.88rem}.pill{display:inline-flex;padding:7px 12px;border-radius:999px;background:rgba(56,189,248,.12);color:#c8f1ff;font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.pill.alt{background:rgba(251,191,36,.12);color:#fff0bf}
      .hero-box{padding:20px;display:grid;gap:12px;align-content:space-between}.hero-box h2{margin:0;font-size:1.35rem;line-height:1.1}.hero-box p{margin:0;color:#cbd5e1}
      .layout{margin-top:18px;display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:18px;align-items:start}.main{display:grid;gap:16px}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end}.toolbar input,.checkout input,.checkout textarea,.checkout select{width:100%;box-sizing:border-box;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#f8fafc;padding:12px 14px;font:inherit;outline:none}.count{color:#cbd5e1;font-size:.9rem;padding-bottom:12px}.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.06);color:#f8fafc;border:1px solid rgba(255,255,255,.12);font-weight:700;cursor:pointer}.chip.active{background:rgba(251,191,36,.18);border-color:rgba(251,191,36,.38)}
      .product{overflow:hidden;display:grid;min-height:100%}.product.blocked{opacity:.72}.img-wrap{position:relative;aspect-ratio:1.25/1;background:linear-gradient(145deg,rgba(251,191,36,.10),rgba(56,189,248,.10))}.img-wrap img,.img-placeholder{width:100%;height:100%;object-fit:cover;display:block}.img-placeholder{display:flex;align-items:center;justify-content:center;color:rgba(226,232,240,.7);font-weight:700}.badge{position:absolute;top:12px;left:12px;padding:6px 10px;border-radius:999px;background:rgba(251,191,36,.18);font-size:.75rem;font-weight:800}.body{padding:16px;display:grid;gap:12px}.body h3{margin:0;font-size:1.08rem}.body p{margin:0;color:#cbd5e1;line-height:1.5;min-height:3.1em}.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.meta span,.stock{padding:6px 10px;border-radius:999px;font-size:.78rem;font-weight:700}.stock.ok{background:rgba(52,211,153,.12);color:#9af5cf}.stock.low{background:rgba(248,113,113,.12);color:#ffb4b4}.price-row{display:flex;justify-content:space-between;gap:12px;align-items:end}.price-row strong{display:block;font-size:1.15rem}.price-row button{padding:11px 14px;border:none;border-radius:16px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#09111f;font-weight:700;cursor:pointer}.price-row button:disabled{opacity:.5;cursor:not-allowed}
      .cart{padding:18px;position:sticky;top:18px;display:grid;gap:14px;background:rgba(12,24,45,.92)}.cart-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.cart-head h3{margin:6px 0 0;font-size:1.4rem}.mini{display:inline-flex;padding:7px 12px;border-radius:999px;background:rgba(56,189,248,.12);color:#c8f1ff;font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.cart-list{display:grid;gap:10px;max-height:320px;overflow:auto;padding-right:4px}.cart-item{display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:center;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}.sub{margin-top:4px;color:#cbd5e1;font-size:.82rem}.qty{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.qty button{width:30px;height:30px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.10);color:#f8fafc}.line{font-weight:800;color:#fff6d6;text-align:right;min-width:84px}.remove{padding:10px 12px;border-radius:16px;background:rgba(248,113,113,.12);color:#ffb4b4;border:1px solid rgba(248,113,113,.18);cursor:pointer}.totals{display:grid;gap:10px;padding:14px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}.totals div{display:flex;justify-content:space-between;gap:10px;color:#cbd5e1}.totals strong{color:#f8fafc}.totals .final{padding-top:10px;margin-top:4px;border-top:1px solid rgba(255,255,255,.10);color:#fff;font-size:1.04rem}.checkout{display:grid;gap:10px}
      .success,.empty,.notice,.quote-loading,.loading,.error{padding:18px}.success{background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.22);display:grid;gap:10px}.notice{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);color:#ffdf8b}.empty{color:#cbd5e1}.empty p{margin:8px 0 0}.quote-loading{border-radius:18px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.22);color:#c8f1ff}.box.center,.loading,.error{max-width:680px;margin:40px auto 0;text-align:center;display:grid;gap:14px;justify-items:center;border-radius:24px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05)}.spinner{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.14);border-top-color:#fbbf24;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      @media (max-width:1100px){.layout{grid-template-columns:1fr}.cart{position:static}}@media (max-width:768px){.app{padding:14px}.hero,.toolbar,.stats,.cart-item{grid-template-columns:1fr}.cart-item{justify-items:start}.line{text-align:left}}
    `;
    document.head.appendChild(style);
    document.body.innerHTML = "<div id=\"negocio-root\"></div>";
    document.body.classList.add("negocio-body");
    render();
    loadCatalog();
  }

  mount();
})();
