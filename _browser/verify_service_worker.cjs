"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const workerSource = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replaceAll("{{ site.data.build.revision | default: 'dev' }}", "worker-release");
const scope = "https://example.test/dotnet-courses/";
const listeners = new Map();

vm.runInNewContext(workerSource, {
    URL,
    self: {
        registration: { scope },
        addEventListener(name, listener) { listeners.set(name, listener); },
    },
    fetch(url, options) { return { url: new URL(url), cache: options.cache }; },
});

function dispatch(url, { mode = "same-origin", method = "GET" } = {}) {
    let eventResponse;
    listeners.get("fetch")({
        request: { url: new URL(url, scope).href, mode, method },
        respondWith(response) { eventResponse = response; },
    });
    return eventResponse;
}

for (const asset of ["assets/css/style.css", "assets/js/course-runner.js"]) {
    assert.equal(dispatch(asset + "?v=page-release"), undefined, "Keep the version requested by the page");
}

const editor = dispatch("assets/js/compiler-editor.js?mode=compact");
assert.equal(editor.url.searchParams.get("v"), "worker-release", "Version the unversioned shared editor");
assert.equal(editor.url.searchParams.get("mode"), "compact");
assert.equal(editor.cache, undefined, "Let the browser cache revisioned assets");

const navigation = dispatch("courses/memory/quiz/?through=1", { mode: "navigate" });
assert.equal(navigation.cache, "no-store");
assert.equal(navigation.url.searchParams.get("through"), "1");
assert.ok(navigation.url.searchParams.get("__fresh"));
assert.equal(dispatch("browser-compiler-net10/?v=page-release", { mode: "navigate" }), undefined);
assert.equal(dispatch("/assets/js/site.js"), undefined);
assert.equal(dispatch("https://other.example.test/dotnet-courses/assets/js/site.js"), undefined);
assert.equal(dispatch("assets/js/site.js", { method: "POST" }), undefined);
