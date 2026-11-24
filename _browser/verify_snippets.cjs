// Smoke-test the exact seven C# examples shown in the Jekyll lesson.
// The browser loads the same JS transformer; each example must compile and run.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

function readSnippets(filename) {
  const markdown = fs.readFileSync(filename, "utf8").replace(/\r\n/g, "\n");
  const snippets = new Map();
  for (const [, , code, attributes] of markdown.matchAll(/^(```|~~~)csharp\n([\s\S]*?)\n\1(?:\n\{:(.*)\})?$/gm)) {
    const id = attributes?.match(/\bdata-snippet="([a-z0-9-]+)"/)?.[1];
    assert.ok(id, `${filename}: C# example without a data-snippet ID`);
    assert.ok(!snippets.has(id), `${filename}: duplicate C# example ID ${id}`);
    snippets.set(id, code);
  }
  return snippets;
}

function verifySnippets(projectDirectory, filename, adapter, expected) {
  const project = path.resolve(projectDirectory);
  const snippets = readSnippets(filename);
  assert.deepEqual([...snippets.keys()].sort(), [...adapter.snippetIds].sort(), `${filename}: adapter IDs`);
  assert.deepEqual([...snippets.keys()].sort(), Object.keys(expected).sort(), `${filename}: expected outputs`);
  for (const [id, code] of snippets) {
    const source = adapter.makeRunnable(code, id);
    fs.writeFileSync(path.join(project, "Program.cs"), source, "utf8");
    const run = cp.spawnSync("dotnet", ["run", "--no-restore", "--project", project], {
      cwd: project,
      encoding: "utf8",
      timeout: 120000
    });
    if (run.status !== 0) {
      throw Error(`${filename} (${id}) failed to compile or run:\n${run.stdout}\n${run.stderr}\n${source}`);
    }
    assert.equal(run.stdout.replace(/\r\n/g, "\n"), expected[id], `${filename} (${id}): unexpected output`);
    console.log(`${filename} (${id}): verified output`);
  }
}

if (require.main === module) {
  const project = process.argv[2];
  if (!project) throw Error("Usage: node _browser/verify_snippets.cjs <path-to-net9-console-project>");
  verifySnippets(project, "_lessons/001-params-countby.md", require("../assets/js/browser-snippets.js"), {
    "params-array": "60\n",
    "params-span": "60\n",
    "params-enumerable": "HTTP: 3\n",
    "groupby-count": "GET: 2\nPOST: 1\nget: 1\n",
    countby: "GET: 2\nPOST: 1\nget: 1\n",
    "countby-comparer": "GET: 3\nPOST: 1\n",
    "full-program": "HTTP methods\nGET: 3\nPOST: 2\nPUT: 1\nSum = 60\n"
  });
}

module.exports = { readSnippets, verifySnippets };
