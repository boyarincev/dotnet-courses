"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { discoverLessons } = require("./lesson-sources.cjs");

function prepareLesson(lesson) {
    const adapter = lesson.adapter ? require(resolve("assets/js", lesson.adapter)) : undefined;
    const adaptedIds = adapter?.snippetIds ?? [];
    if (adapter) {
        assert.ok(Array.isArray(adaptedIds) && adaptedIds.length && typeof adapter.makeRunnable === "function",
            `${lesson.path}: invalid snippet adapter`);
        assert.equal(new Set(adaptedIds).size, adaptedIds.length, `${lesson.path}: duplicate adapter IDs`);
        for (const id of adaptedIds) {
            assert.ok(lesson.examples.some(example => example.id === id), `${lesson.path}: adapter refers to unknown snippet ${id}`);
        }
    }
    const examples = lesson.examples.map(example => ({ ...example,
        code: adaptedIds.includes(example.id) ? adapter.makeRunnable(example.code, example.id) : example.code,
    }));
    const { offset, length, indent } = lesson.stub;
    const substitute = lesson.wrongBody.split("\n").map(line => line ? indent + line : "").join("\n");
    const wrongPractice = lesson.practice.slice(0, offset) + substitute + lesson.practice.slice(offset + length);
    return { examples, wrongPractice };
}

function dotnet(args, cwd, context, allowFailure = false) {
    const run = spawnSync("dotnet", args, {
        cwd,
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env, DOTNET_CLI_FORCE_UTF8_ENCODING: "1" },
    });
    assert.ifError(run.error);
    if (!allowFailure) assert.equal(run.status, 0, `${context}: dotnet ${args.join(" ")}\n${run.stdout}${run.stderr}`);
    return run;
}

function createProject(root, framework, installedSdkVersions) {
    const folder = join(root, framework);
    mkdirSync(folder);
    const versionPrefix = framework.slice(3) + ".";
    const version = installedSdkVersions.filter(sdk => sdk.startsWith(versionPrefix)).at(-1);
    assert.ok(version, `Missing stable SDK for ${framework}`);
    writeFileSync(join(folder, "global.json"), JSON.stringify({ sdk: { version, rollForward: "disable" } }));
    dotnet(["new", "console", "-f", framework, "--no-restore"], folder, framework);
    dotnet(["restore", "--verbosity", "quiet"], folder, framework);
    return folder;
}

function verify(lessons) {
    if (!lessons.length) {
        console.log("No lesson C# checks selected");
        return;
    }
    const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "course-checks-"));
    console.log("C# console projects: " + root);
    const sdkList = dotnet(["--list-sdks"], process.cwd(), "List SDKs").stdout;
    const versions = [...sdkList.matchAll(/^(\d+\.\d+\.\d+) \[/gm)].map(match => match[1]);
    const projects = new Map();
    const build = ["build", "--no-restore", "--no-incremental", "--nologo", "--verbosity", "quiet"];
    const runProgram = ["run", "--no-build", "--no-restore"];
    for (const lesson of lessons) {
        const { examples, wrongPractice } = prepareLesson(lesson);
        if (!projects.has(lesson.framework)) {
            projects.set(lesson.framework, createProject(root, lesson.framework, versions));
        }
        const folder = projects.get(lesson.framework);
        const programFile = join(folder, "Program.cs");
        for (const example of examples) {
            const context = `${lesson.path} (#snippet-${example.id}, ${lesson.framework})`;
            writeFileSync(programFile, example.code);
            dotnet(build, folder, context);
            const run = dotnet(runProgram, folder, context);
            assert.equal(run.stdout.replace(/\r\n/g, "\n"), example.output, `${context}: console output differs`);
            console.log(context + ": verified console output");
        }

        const context = `${lesson.path} (${lesson.taskId}, ${lesson.framework})`;
        writeFileSync(programFile, lesson.practice);
        dotnet(build, folder, context + " starter");
        writeFileSync(programFile, wrongPractice);
        dotnet(build, folder, context + " negative fixture");
        const negative = dotnet(runProgram, folder, context, true);
        const output = negative.stdout + negative.stderr;
        assert.notEqual(negative.status, 0, `${context}: negative fixture unexpectedly succeeded\n${output}`);
        assert.ok(output.includes(`❌ ${lesson.taskId}:`), `${context}: failure did not come from the authored Assert\n${output}`);
        console.log(context + ": compiled original starter and rejected negative fixture");
    }
}

if (require.main === module) {
    const lessons = discoverLessons();
    const args = process.argv.slice(2);
    const selected = args.length ? args : process.env.SELECTED_LESSONS ? JSON.parse(process.env.SELECTED_LESSONS) : lessons.map(lesson => lesson.path);
    assert.ok(Array.isArray(selected), "Expected lesson paths as a JSON array");
    for (const path of selected) assert.ok(lessons.some(lesson => lesson.path === path), `Unknown lesson: ${path}`);
    verify(lessons.filter(lesson => selected.includes(lesson.path)));
}

module.exports = { prepareLesson };
