"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lesson = "_lessons/003-ordered-dictionary-extension-indexers.md";
const directory = process.argv[2];
assert.ok(directory, "Expected a temporary directory for lesson 003 checks");

const markdown = fs.readFileSync(lesson, "utf8").replace(/\r\n/g, "\n");

function readBlock(id, language) {
  const marker = `<!-- lesson-${id} -->\n`;
  const fence = "```";
  const opening = marker + fence + language + "\n";
  const closing = "\n" + fence + "\n";
  const start = markdown.indexOf(opening) + opening.length;
  const end = markdown.indexOf(closing, start);
  assert.ok(start >= opening.length && end > start, `${lesson}: missing ${id} block`);
  return markdown.slice(start, end) + "\n";
}

const practice = readBlock("practice", "csharp");
const stub = /(^[ \t]*\/\/ BEGIN TASK-003\n[\s\S]*?)throw new NotImplementedException\(\);([\s\S]*?^[ \t]*\/\/ END TASK-003$)/m;
assert.match(practice, stub, `${lesson}: missing TASK-003 stub`);
// The fixture misreads indices from the end as positions from the start.
const wrong = practice.replace(stub, "$1return entries.GetAt(index: position.Value);$2");
fs.writeFileSync(path.join(directory, "demo.cs.txt"), readBlock("demo", "csharp"));
fs.writeFileSync(path.join(directory, "expected.txt"), readBlock("output", "text"));
fs.writeFileSync(path.join(directory, "wrong.cs.txt"), wrong);
