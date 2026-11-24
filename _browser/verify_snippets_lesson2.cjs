"use strict";

const { verifySnippets } = require("./verify_snippets.cjs");
const project = process.argv[2];
if (!project) throw Error("Usage: node _browser/verify_snippets_lesson2.cjs <net10-project-path>");
verifySnippets(project, "_lessons/002-aggregateby-null-conditional-assignment.md", require("../assets/js/browser-snippets-lesson002.js"), {
  aggregateby: "/orders: 3/190\n",
  "explicit-null-check": "Audit: ready\n",
  "conditional-assignment": "Builds when null: 0\nBuilds when present: 1\nAudit: ready\n",
  "full-program": "/health: Count=1, TotalMs=5\n/orders: Count=4, TotalMs=220\nBuilds when null: 0\nBuilds when present: 1\nAudit: /health=1/5; /orders=4/220\n",
  "task-types": "api-A: 500, bytes=150\n",
  "task-signature": "Сигнатура проверена; реализацию напиши самостоятельно.\n",
  "task-input": "Input: 7 calls\n"
});
