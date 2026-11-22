// Compile and run all seven canonical lesson 002 code fragments as net10 console programs.
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const cp=require("node:child_process");
const {makeRunnable,exampleCount}=require("../assets/js/browser-snippets-lesson002.js");
const project=process.argv[2];
if(!project)throw Error("Usage: node _browser/verify_snippets_lesson2.cjs <net10-project-path>");
const markdown=fs.readFileSync("_lessons/002-aggregateby-null-conditional-assignment.md","utf8");
const fence=new RegExp("^\\x60\\x60\\x60csharp\\n([\\s\\S]*?)\\n\\x60\\x60\\x60","gm");
const snippets=[...markdown.matchAll(fence)].map(m=>m[1]);
if(snippets.length!==exampleCount)
  throw Error("Expected "+exampleCount+" snippets, found "+snippets.length);
const expected=[
  "/orders: 3/190\n",
  "Audit: ready\n",
  "Builds when null: 0\nBuilds when present: 1\nAudit: ready\n",
  "/health: Count=1, TotalMs=5\n/orders: Count=4, TotalMs=220\nBuilds when null: 0\nBuilds when present: 1\nAudit: /health=1/5; /orders=4/220\n",
  "api-A: 500, bytes=150\n",
  "Сигнатура проверена; реализацию напиши самостоятельно.\n",
  "Input: 7 calls\n"
];
for(let i=0;i<exampleCount;i++){
  const source=makeRunnable(snippets[i],i);
  fs.writeFileSync(path.join(project,"Program.cs"),source,"utf8");
  const build=cp.spawnSync("dotnet",["build",project,"--no-restore"],
    {encoding:"utf8",timeout:120000});
  if(build.status!==0)
    throw Error("Lesson 002 snippet "+(i+1)+" did not compile:\n"+build.stdout+"\n"+build.stderr+"\n"+source);
  const out=cp.spawnSync("dotnet",["run","--no-build","--project",project],
    {encoding:"utf8",timeout:120000});
  if(out.status!==0)
    throw Error("Lesson 002 snippet "+(i+1)+" failed at runtime:\n"+out.stdout+"\n"+out.stderr+"\n"+source);
  const stdout=out.stdout.replace(/\r\n/g,"\n");
  if(stdout!==expected[i])
    throw Error("Lesson 002 snippet "+(i+1)+": expected "+JSON.stringify(expected[i])+", got "+JSON.stringify(stdout)+"\n"+source);
  console.log("Lesson 002 snippet "+(i+1)+"/"+exampleCount+": OK");
}
