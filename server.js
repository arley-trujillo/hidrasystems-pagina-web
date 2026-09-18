import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const apiBaseUrl = (
  process.env.API_BASE_URL ||
  process.env.VITE_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PUBLIC_API_URL ||
  "https://luis-d038.onrender.com" ||
  ""
).replace(/\/+$/, "");
const hidraSuiteSlug = String(process.env.HIDRA_SUITE_SLUG || "hidra-suite").trim();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".html": "text/html; charset=utf-8",
};

async function getAssetVersion() {
  const targets = [
    path.join(publicDir, "app.js"),
    path.join(publicDir, "styles.css"),
    path.join(publicDir, "index.html"),
  ];
  const timestamps = await Promise.all(
    targets.map(async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        return stat.mtimeMs || stat.ctimeMs || Date.now();
      } catch {
        return 0;
      }
    }),
  );

  // Keep the asset URL stable until a source file changes so browsers can reuse it.
  return String(Math.max(...timestamps)).replace(/\D/g, "");
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function safeJoin(root, requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(root, normalized);
  return fullPath.startsWith(root) ? fullPath : root;
}

async function serveAsset(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";
  const content = await fs.readFile(filePath);
  const immutableAsset = [".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"].includes(ext);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": immutableAsset ? "public, max-age=31536000, immutable" : "no-store",
  });
  res.end(content);
}

async function serveHtml(res, templateName) {
  const template = await fs.readFile(path.join(publicDir, templateName), "utf8");
  const assetVersion = await getAssetVersion();
  const html = template
    .replaceAll("__API_BASE_URL__", apiBaseUrl)
    .replaceAll("__HIDRA_SUITE_SLUG__", hidraSuiteSlug)
    .replaceAll("__ASSET_VERSION__", assetVersion);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const retailPath = pathname === "/negocio" || pathname.startsWith("/negocio/") || pathname.startsWith("/retail/");
    if (retailPath) {
      await serveHtml(res, "retail.html");
      return;
    }

    // El dominio principal siempre es la vitrina comercial de HIDRA SUITE.
    // Conservamos ?slug=... para los enlaces antiguos de rifas.
    if (pathname === "/" && !url.searchParams.get("slug")) {
      await serveHtml(res, "corporate.html");
      return;
    }

    const assetPath = safeJoin(publicDir, pathname === "/" ? "/index.html" : pathname);
    if (await fileExists(assetPath) && path.extname(assetPath)) {
      await serveAsset(res, assetPath);
      return;
    }

    await serveHtml(res, "index.html");
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error?.message || "Internal server error" }));
  }
});

server.listen(port, () => {
  console.log(`Public site running on port ${port}`);
});
