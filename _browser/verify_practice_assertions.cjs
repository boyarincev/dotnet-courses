#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {buildTaskProgram,extractTaskSource,isSuccessfulPracticeRun}=require("../assets/js/course-runner.js");

const taskId="TASK-TEST";
const header="public static class Program\n{\n";
const solution="// BEGIN TASK-TEST\n// INSERT_SOLUTION_HERE\n// END TASK-TEST\n";
const checks=[
  "public static void Main()",
  "{",
  "    Assert(Solve() == 1);",
  "}",
  "private static void Assert(bool condition)",
  "{",
  "    if (!condition) throw new System.InvalidOperationException();",
  "}",
  ""
].join("\n");
const currentTemplate=header+solution+checks+"}";
const success="Все проверки пройдены";
const implementation="    // Заметка ученика.\r\n    static Number Solve() => 1;";
const imports="using Number = System.Int32;";
const currentProgram=buildTaskProgram(currentTemplate,imports+"\r\n"+implementation,taskId);
assert.ok(isSuccessfulPracticeRun(currentTemplate,currentProgram,success,taskId),"exact checks and success output");
assert.ok(!isSuccessfulPracticeRun(currentTemplate,currentProgram.replace("Solve() == 1","true"),success,taskId),"changed C# check");
assert.ok(!isSuccessfulPracticeRun(currentTemplate,currentProgram,success+"\nОшибка",taskId),"failed C# run");
assert.match(extractTaskSource(currentProgram,taskId),/using Number = System\.Int32;[\s\S]*\/\/ Заметка ученика\.[\s\S]*static Number Solve\(\) => 1;/,
  "the active draft preserves imports, learner notes and implementation");
assert.ok(!extractTaskSource(currentProgram,"TASK-OTHER"),"drafts are bound to the expected Task-ID");

const [root,...taskFilter]=process.argv.slice(2);
if(root==="--shared-only" && taskFilter.length===0) process.exit(0);
if(!root || root.startsWith("--")) {
  throw Error("Usage: node verify_practice_assertions.cjs <output-dir> [task...] or --shared-only");
}
const cases=[
  {source:"_lessons/001-params-countby.md", dir:"task001", id:"TASK-001",
    method:"static IEnumerable<(string Method, int Count)> GetTopMethods(IEnumerable<string> methods) => Array.Empty<(string, int)>();"},
  {source:"_lessons/002-aggregateby-null-conditional-assignment.md", dir:"task002", id:"TASK-002",
    method:'static IReadOnlyList<(string Client, int Count, long TotalBytes)> GetNoisiestClients(IEnumerable<Failure> calls, AuditReport? audit) { if (audit != null) audit.Text = ""; return Array.Empty<(string, int, long)>(); }'},
  {source:"_memory_lessons/001-allocations-copies-retention.md", dir:"alloc001", id:"ALLOC-TASK-001",
    method:"static (int PaidCount, decimal Total) SummarizePaid(IEnumerable<string> rows) => (0, 0m);"}
];
for(const task of taskFilter) {
  if(!cases.some(c=>c.dir===task)) throw Error("Unknown practice task: "+task);
}
for(const c of cases){
  if(taskFilter.length && !taskFilter.includes(c.dir)) continue;
  const markdown=fs.readFileSync(c.source,"utf8");
  const matches=[...markdown.matchAll(/<script type="text\/plain" id="practice-program-template">([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length,1,"C# test template must be embedded once in "+c.source);
  const template=matches[0][1];
  const program=buildTaskProgram(template,c.method,c.id);
  assert.ok(program.includes("// BEGIN "+c.id),c.id+": BEGIN marker");
  assert.ok(program.includes("// END "+c.id),c.id+": END marker");
  assert.ok(program.includes("private static void Assert("),c.id+": real C# Assert missing");
  const solutionStart=program.indexOf("// BEGIN "+c.id);
  const solutionEnd=program.indexOf("// END "+c.id);
  const methodStart=program.indexOf(c.method);
  assert.ok(solutionStart>=0 && solutionStart<methodStart && methodStart<solutionEnd,c.id+": task method must be between its markers");
  assert.ok(program.indexOf("public static void Main(")>solutionEnd,c.id+": Main must follow the task method");
  assert.ok(program.indexOf("private static void Assert(")>solutionEnd,c.id+": Assert must follow the task method");
  assert.ok(program.includes("Все проверки пройдены"),c.id+": success signal missing");
  assert.ok(!program.includes("// INSERT_SOLUTION_HERE"),c.id+": placeholder still present");
  fs.writeFileSync(path.join(root,c.dir,"Program.cs"),program,"utf8");
  console.log(c.id+": generated runnable C# from the lesson's visible editor template");
}
