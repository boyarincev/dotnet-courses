#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {buildTaskProgram}=require("../assets/js/course-runner.js");

const root=process.argv[2];
if(!root) throw Error("Usage: node verify_practice_assertions.cjs <output-dir>");
const cases=[
  {source:"_lessons/001-params-countby.md", dir:"task001", id:"TASK-001",
    method:"static IEnumerable<(string Method, int Count)> GetTopMethods(IEnumerable<string> methods) => Array.Empty<(string, int)>();"},
  {source:"_lessons/002-aggregateby-null-conditional-assignment.md", dir:"task002", id:"TASK-002",
    method:'static IReadOnlyList<(string Client, int Count, long TotalBytes)> GetNoisiestClients(IEnumerable<Failure> calls, AuditReport? audit) { if (audit != null) audit.Text = ""; return Array.Empty<(string, int, long)>(); }'},
  {source:"_memory_lessons/001-allocations-copies-retention.md", dir:"alloc001", id:"ALLOC-TASK-001",
    method:"static (int PaidCount, decimal Total) SummarizePaid(IEnumerable<string> rows) => (0, 0m);"}
];
for(const c of cases){
  const markdown=fs.readFileSync(c.source,"utf8");
  const matches=[...markdown.matchAll(/<script type="text\/plain" id="practice-program-template">([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length,1,"C# test template must be embedded once in "+c.source);
  const template=matches[0][1];
  const program=buildTaskProgram(template,c.method,c.id);
  assert.ok(program.includes("// BEGIN "+c.id),c.id+": BEGIN marker");
  assert.ok(program.includes("// END "+c.id),c.id+": END marker");
  assert.ok(program.includes("private static void Assert("),c.id+": real C# Assert missing");
  assert.ok(program.includes("Все проверки пройдены"),c.id+": success signal missing");
  assert.ok(!program.includes("// INSERT_SOLUTION_HERE"),c.id+": placeholder still present");
  fs.writeFileSync(path.join(root,c.dir,"Program.cs"),program,"utf8");
  console.log(c.id+": generated runnable C# from the lesson's visible editor template");
}
