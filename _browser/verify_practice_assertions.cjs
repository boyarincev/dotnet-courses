#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {makeProgram,keys}=require("../assets/js/practice-tests.js");
const root=process.argv[2];
if(!root) throw Error("Usage: node verify_practice_assertions.cjs <output-dir>");
const cases=[
  {course:"whats-new",lesson:1,dir:"task001",id:"TASK-001",
   method:"static IEnumerable<(string Method, int Count)> GetTopMethods(IEnumerable<string> methods) => Array.Empty<(string, int)>();"},
  {course:"whats-new",lesson:2,dir:"task002",id:"TASK-002",
   method:'static IReadOnlyList<(string Client, int Count, long TotalBytes)> GetNoisiestClients(IEnumerable<Failure> calls, AuditReport? audit) { if (audit != null) audit.Text = ""; return Array.Empty<(string, int, long)>(); }'},
  {course:"memory",lesson:1,dir:"alloc001",id:"ALLOC-TASK-001",
   method:"static (int PaidCount, decimal Total) SummarizePaid(IEnumerable<string> rows) => (0, 0m);"}
];
assert.equal(keys.length,cases.length,"Check every published exercise");
for(const c of cases){
  const program=makeProgram(c.course,c.lesson,c.method);
  assert.ok(program.includes("// BEGIN "+c.id),"Missing BEGIN marker "+c.id);
  assert.ok(program.includes("// END "+c.id),"Missing END marker "+c.id);
  assert.ok(program.includes("private static void Assert("),"Missing Assert helper "+c.id);
  assert.ok(program.includes("ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ:"),"Missing success signal "+c.id);
  const filename=path.join(root,c.dir,"Program.cs");
  fs.writeFileSync(filename,program,{encoding:"utf8"});
  console.log("Generated "+c.id+" deliberately wrong fixture: "+filename);
}
