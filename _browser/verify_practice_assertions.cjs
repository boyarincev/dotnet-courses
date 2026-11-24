#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {buildTaskProgram,extractTaskSource,isSuccessfulPracticeRun}=require("../assets/js/course-runner.js");
const {discoverLessons}=require("./lesson-sources.cjs");

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

const preamble = [
  "// Заметка перед директивами.",
  "using Scores = System.Int32[]; // Псевдоним массива.",
  "/* Комментарий между директивами. */",
  "using Pair = (int First,",
  "              int Second);",
  "using System.Linq;"
].join("\n");
const withPreamble = preamble + "\n" + currentProgram;
assert.ok(isSuccessfulPracticeRun(currentTemplate, withPreamble, success, taskId),
  "comments and modern using aliases do not invalidate the original checks");
assert.ok(!isSuccessfulPracticeRun(currentTemplate, withPreamble.replace("Solve() == 1", "true"), success, taskId),
  "comment and alias handling must still check the canonical Assert");
const saved = extractTaskSource(withPreamble, taskId);
assert.ok(saved.startsWith(preamble), "the saved draft preserves the full import preamble");
const newerTemplate = "using System.Linq;\nusing Number=System.Int32;\n" + currentTemplate;
const reopened = buildTaskProgram(newerTemplate, saved, taskId);
assert.equal(reopened.match(/using System\.Linq;/g).length, 1);
assert.equal(reopened.match(/using Number\s*=/g).length, 1);
assert.match(reopened, /using Pair = \(int First,\n +int Second\);/);
assert.ok(isSuccessfulPracticeRun(newerTemplate, reopened, success, taskId));

for (const lesson of discoverLessons().filter(item => item.browserRuntime)) {
  const starter=extractTaskSource(lesson.practice,lesson.taskId);
  assert.ok(starter?.includes("throw new NotImplementedException();"),`${lesson.path}: browser starter not found`);
  assert.equal(buildTaskProgram(lesson.practice,starter,lesson.taskId),lesson.practice,`${lesson.path}: browser starter changed the checks`);
}
