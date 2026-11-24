"use strict";

const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { basename, join } = require("node:path");

const courses = [
    { id: "csharp-dotnet-9-11", collection: "_lessons", taskPrefix: "TASK-" },
    { id: "memory", collection: "_memory_lessons", taskPrefix: "ALLOC-TASK-" },
];
const browserRuntimes = ["9", "10", "11"];

function scalar(frontMatter, key) {
    const value = frontMatter.match(new RegExp(`^${key}:[ \\t]*([^\\n]*)$`, "m"))?.[1].trim();
    const quote = value?.[0];
    return (quote === "'" || quote === '"') && value.endsWith(quote) ? value.slice(1, -1) : value;
}

function parseLesson(sourcePath, markdown, course) {
    const slug = basename(sourcePath, ".md");
    assert.match(slug, /^\d{3}-[a-z0-9-]+$/, `${sourcePath}: invalid lesson filename`);
    const number = slug.slice(0, 3);
    const taskId = course.taskPrefix + number;
    const source = markdown.replace(/\r\n/g, "\n");
    const frontMatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
    assert.ok(frontMatter, `${sourcePath}: no front matter`);
    assert.equal(scalar(frontMatter, "lesson_number"), String(Number(number)), `${sourcePath}: lesson_number`);
    const framework = scalar(frontMatter, "code_framework") ?? "";
    assert.match(framework, /^net[1-9]\d*\.0$/, `${sourcePath}: code_framework must name a .NET target, e.g. net10.0`);
    const browserRuntime = scalar(frontMatter, "browser_runtime");
    const startSnippet = scalar(frontMatter, "browser_start_snippet");
    const adapter = scalar(frontMatter, "browser_snippets");
    if (adapter) assert.match(adapter, /^browser-snippets(?:-[a-z0-9-]+)?\.js$/, `${sourcePath}: invalid adapter filename`);
    assert.ok(!browserRuntime || browserRuntimes.includes(browserRuntime), `${sourcePath}: unsupported browser_runtime ${browserRuntime}`);
    assert.ok(browserRuntime || !startSnippet, `${sourcePath}: browser_start_snippet requires browser_runtime`);

    const blocks = new Map();
    const fences = /^(`{3,}|~{3,})([a-z0-9]*)[ \t]*\n([\s\S]*?)^\1[ \t]*(?:\n\{:[ \t]+#([a-z0-9-]+)[^\n}]*\})?$/gm;
    for (const [, , language, text, id] of source.matchAll(fences)) {
        if (!id) continue;
        assert.ok(!blocks.has(id), `${sourcePath}: duplicate block ID ${id}`);
        blocks.set(id, { language, text });
    }

    const examples = [...blocks.keys()].filter(id => id.startsWith("snippet-")).map(id => {
        const snippet = id.slice("snippet-".length);
        const code = blocks.get(id);
        const output = blocks.get(`output-${snippet}`);
        assert.equal(code.language, "csharp", `${sourcePath}: #${id} must use csharp`);
        assert.equal(output?.language, "text", `${sourcePath}: #${id} needs a matching text block #output-${snippet}`);
        return { id: snippet, code: code.text, output: output.text };
    });
    assert.ok(examples.length, `${sourcePath}: no runnable examples`);
    assert.equal([...blocks.keys()].filter(id => id.startsWith("output-")).length, examples.length,
        `${sourcePath}: expected output without a matching snippet`);
    if (browserRuntime) {
        assert.ok(examples.some(example => example.id === startSnippet), `${sourcePath}: invalid browser_start_snippet`);
    }

    const practice = blocks.get("practice-program");
    assert.equal(practice?.language, "csharp", `${sourcePath}: missing C# block #practice-program`);
    const task = [...practice.text.matchAll(/^[ \t]*\/\/ BEGIN ((?:ALLOC-)?TASK-\d+)[ \t]*\n([\s\S]*?)^[ \t]*\/\/ END \1[ \t]*$/gm)];
    assert.equal(task.length, 1, `${sourcePath}: expected one complete practice task`);
    assert.equal(task[0][1], taskId, `${sourcePath}: task markers must use ${taskId}`);
    const stub = [...task[0][2].matchAll(/^([ \t]+)throw new NotImplementedException\(\);[ \t]*$/gm)];
    assert.equal(stub.length, 1, `${sourcePath}: expected one NotImplementedException stub in the task`);
    const stubOffset = task[0].index + task[0][0].indexOf("\n") + 1 + stub[0].index;
    assert.ok(practice.text.includes(`❌ ${taskId}:`), `${sourcePath}: missing Assert prefix for ${taskId}`);
    const wrongBodies = [...source.matchAll(/^<script type="text\/plain" id="practice-wrong-body">([\s\S]*?)^<\/script>[ \t]*$/gm)];
    assert.equal(wrongBodies.length, 1, `${sourcePath}: expected one script #practice-wrong-body for the negative test`);
    const wrongBody = wrongBodies[0][1].trim();
    assert.ok(wrongBody && !wrongBody.includes(`❌ ${taskId}:`), `${sourcePath}: invalid practice fixture`);
    return {
        path: sourcePath, slug, number: Number(number), route: `courses/${course.id}/lessons/${slug}/`, course, framework,
        browserRuntime, startSnippet, adapter, examples, taskId, practice: practice.text, wrongBody,
        stub: { offset: stubOffset, length: stub[0][0].length, indent: stub[0][1] },
    };
}

function discoverLessons() {
    return courses.flatMap(course => {
        const files = readdirSync(course.collection, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
            .map(entry => entry.name).sort();
        return files.map(filename => {
            const source = `${course.collection}/${filename}`;
            return parseLesson(source, readFileSync(join(course.collection, filename), "utf8"), course);
        });
    });
}

module.exports = { browserRuntimes, courses, discoverLessons, parseLesson };
