---
layout: null
permalink: /sw.js
---
// Revision: {{ site.data.build.revision | default: 'dev' }}
// The site is hosted by GitHub Pages, which does not expose HTTP cache headers.
// Don't cache learner pages, lesson contents or user code in Cache Storage.
const revision = "{{ site.data.build.revision | default: 'dev' }}";
const root = new URL(self.registration.scope);
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  if (request.mode === "navigate") {
    // The WASM compiler itself is immutable per deployment and versioned in
    // the iframe src. Leave its own navigation and its heavy runtime cached.
    if (/\/browser-compiler-net\d+\//.test(url.pathname)) return;
    const fresh = new URL(url);
    fresh.searchParams.set("__fresh", String(Date.now()));
    event.respondWith(fetch(fresh.href, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "follow"
    }));
    return;
  }
  // The shared editor's script is referenced by a cached compiler shell;
  // supply a version only when the document didn't specify one.
  if (url.pathname.startsWith(root.pathname + "assets/js/") ||
      url.pathname.startsWith(root.pathname + "assets/css/")) {
    if (url.searchParams.has("v")) return;
    url.searchParams.set("v", revision);
    event.respondWith(fetch(url.href, {credentials: "same-origin"}));
  }
});
