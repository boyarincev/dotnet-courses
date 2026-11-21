// Smoke-test the exact seven C# examples shown in the Jekyll lesson.
// The browser loads the same JS transformer; each example must compile and run.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const {makeRunnable, exampleCount} = require("../assets/js/browser-snippets.js");

const project = process.argv[2];
if (!project) throw Error("Usage: node _browser/verify_snippets.cjs <path-to-net9-console-project>");
const markdown = fs.readFileSync("_lessons/001-params-countby.md", "utf8");
const fence = new RegExp("^\\x60\\x60\\x60csharp\\n([\\s\\S]*?)\\n\\x60\\x60\\x60", "gm");
const snippets = [...markdown.matchAll(fence)].map(m => m[1]);
if (snippets.length !== exampleCount) {
  throw Error("Expected " + exampleCount + " C# code fences; found " + snippets.length);
}
const expected = [
  "60\n",
  "60\n",
  "Analyze: переданы 3 HTTP-метода\n",
  "GET: 2\nPOST: 1\nget: 1\n",
  "GET: 2\nPOST: 1\nget: 1\n",
  "GET: 3\nPOST: 1\n",
  "HTTP methods\nGET: 3\nPOST: 2\nPUT: 1\nSum = 60\n"
];
for (let i = 0; i < snippets.length; i++) {
  const source = makeRunnable(snippets[i], i);
  fs.writeFileSync(path.join(project, "Program.cs"), source, "utf8");
  const run = cp.spawnSync("dotnet", ["run", "--no-restore", "--project", project], {
    encoding: "utf8",
    timeout: 120000
  });
  if (run.status !== 0) {
    throw Error("Example " + (i + 1) + " failed to compile/run:\n" + run.stdout + "\n" + run.stderr + "\nSOURCE:\n" + source);
  }
  const output = run.stdout.replace(/\r\n/g, "\n");
  if (output !== expected[i]) {
    throw Error("Example " + (i + 1) + ": incorrect output.\nExpected: " + JSON.stringify(expected[i]) + "\nActual: " + JSON.stringify(output) + "\nSOURCE:\n" + source);
  }
  console.log("C# example " + (i + 1) + "/" + exampleCount + ": compiled and executed with expected output.");
}
