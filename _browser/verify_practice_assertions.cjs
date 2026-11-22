#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {addTaskInstructions,buildTaskProgram,isSuccessfulPracticeRun,refreshOpenTask}=require("../assets/js/course-runner.js");

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
const earlierTemplate=header+checks+solution+"}";
const implementation="static int Solve() => 1;";
const success="Все проверки пройдены";
const currentProgram=buildTaskProgram(currentTemplate,implementation,taskId);
const savedDraft=buildTaskProgram(earlierTemplate,implementation,taskId);
assert.ok(isSuccessfulPracticeRun(currentTemplate,currentProgram,success,taskId),"method-first layout");
assert.ok(isSuccessfulPracticeRun(currentTemplate,savedDraft,success,taskId),"saved method-last layout");
assert.ok(!isSuccessfulPracticeRun(currentTemplate,savedDraft.replace("Solve() == 1","true"),success,taskId),"changed C# check");
assert.ok(!isSuccessfulPracticeRun(currentTemplate,savedDraft,success+"\nОшибка",taskId),"failed C# run");

const firstInstruction="// Верни заданное число.";
const secondInstruction="// Входных параметров нет.";
const starter=[
  "using System;",
  "",
  "static int Solve()",
  "{",
  "    "+firstInstruction,
  "    "+secondInstruction,
  "",
  "    throw new NotImplementedException();",
  "}"
].join("\n");
assert.equal(addTaskInstructions(starter,starter),starter,"fresh starter already has instructions");

const legacySource=[
  "using System;",
  "using System.Linq;",
  "",
  "private static int Solve ()",
  "{",
  "    "+firstInstruction,
  "    // Заметка автора решения.",
  "    return 1;",
  "}"
].join("\r\n");
const restoredSource=addTaskInstructions(legacySource,starter);
const restoredPrefix=[
  "    // Актуальное условие из урока",
  "    "+firstInstruction,
  "    "+secondInstruction,
  ""
].join("\r\n");
assert.equal(restoredSource,legacySource.replace("{\r\n","{\r\n"+restoredPrefix),"preserve existing imports, comments, body and newlines");
assert.equal(addTaskInstructions(restoredSource,starter),restoredSource,"repeat loading does not duplicate comments");
const restoredProgram=buildTaskProgram(currentTemplate,restoredSource,taskId);
assert.ok(isSuccessfulPracticeRun(currentTemplate,restoredProgram,success,taskId),"restored comments leave the checks unchanged");
assert.ok(restoredProgram.indexOf(secondInstruction)<restoredProgram.indexOf("public static void Main()"),"the compiler displays the restored comment before the checks");
const expressionSource="using System;\n\n"+implementation;
assert.equal(addTaskInstructions(expressionSource,starter),
  expressionSource.replace(implementation,["// Актуальное условие из урока",firstInstruction,secondInstruction,implementation].join("\n")),
  "an expression-bodied method retains its implementation and gains comments above it");
assert.equal(addTaskInstructions("",starter),"","empty practice remains empty");

const oldGuide="// Условие из предыдущей версии.";
const notes="    // Личная заметка.\n    return 1;";
const duplicatedGuide=[
  "static int Solve()",
  "{",
  "    // Актуальное условие из урока",
  "    "+firstInstruction,
  "    "+secondInstruction,
  "    "+oldGuide,
  notes,
  "}"
].join("\n");
const cleanedGuide=duplicatedGuide.replace("    "+oldGuide+"\n","");
assert.equal(addTaskInstructions(duplicatedGuide,starter,oldGuide),cleanedGuide,
  "a saved draft with both guide versions keeps only the current one");
assert.equal(addTaskInstructions(cleanedGuide,starter,oldGuide),cleanedGuide,
  "repeated restore keeps the same learner source and instructions");

const openedProgram=buildTaskProgram(currentTemplate,duplicatedGuide,taskId).replace(/\n/g,"\r\n");
const cleanedProgram=openedProgram.replace("    "+oldGuide+"\r\n","");
assert.equal(refreshOpenTask(openedProgram,taskId,starter,oldGuide),cleanedProgram,
  "opening the current task removes only obsolete instructions");
assert.equal(refreshOpenTask(cleanedProgram,taskId,starter,oldGuide),cleanedProgram,
  "opening the current task again preserves the exact program");
assert.equal(refreshOpenTask(openedProgram,"TASK-OTHER",starter,oldGuide),openedProgram,
  "opening a different task does not alter the file");

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
