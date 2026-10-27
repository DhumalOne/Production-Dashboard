// Checks the files a phone needs for "Add to Home Screen", fetched WITHOUT signing in.
//   node scripts/pwa-check.mjs [baseUrl]     (run against a production build: next build && next start)
const BASE = process.argv[2] ?? "http://127.0.0.1:3101";
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

const m = await fetch(`${BASE}/manifest.webmanifest`, { redirect: "manual" });
const manifest = m.ok ? await m.json() : {};
check("manifest served without sign-in", m.status === 200, `HTTP ${m.status}`);
check("manifest: standalone, start_url /", manifest.display === "standalone" && manifest.start_url === "/");
check("manifest: 192 + 512 + maskable icons",
      ["192x192", "512x512"].every((s) => manifest.icons?.some((i) => i.sizes === s)) && manifest.icons?.some((i) => i.purpose === "maskable"));

for (const path of [...(manifest.icons ?? []).map((i) => i.src), "/apple-icon.png", "/icon.png"]) {
  const r = await fetch(BASE + path, { redirect: "manual" });
  check(`icon ${path}`, r.status === 200 && r.headers.get("content-type")?.includes("image/png"), `HTTP ${r.status} ${r.headers.get("content-type")}`);
}

const sw = await fetch(`${BASE}/sw.js`, { redirect: "manual" });
check("service worker served without sign-in", sw.status === 200, `HTTP ${sw.status}`);
check("service worker: no-cache", /no-cache/.test(sw.headers.get("cache-control") ?? ""), sw.headers.get("cache-control"));
check("service worker: javascript", /javascript/.test(sw.headers.get("content-type") ?? ""), sw.headers.get("content-type"));

const login = await fetch(`${BASE}/login`);
const html = await login.text();
check("pages link the manifest", html.includes('rel="manifest"') && html.includes("/manifest.webmanifest"));
check("pages link the Apple touch icon", html.includes('rel="apple-touch-icon"'));
check("pages set apple-mobile-web-app-capable", /apple-mobile-web-app-capable|mobile-web-app-capable/.test(html));
check("security headers", login.headers.get("x-content-type-options") === "nosniff" && login.headers.get("x-frame-options") === "DENY");

const home = await fetch(`${BASE}/`, { redirect: "manual" });
check("business pages still require sign-in", home.status === 307, `HTTP ${home.status}`);

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
