"use strict";

const assert = require("node:assert/strict");
const { inflateRawSync } = require("node:zlib");
const { chromium } = require("playwright");

const site = process.argv[2];
if (!site) throw new Error("Usage: node verify_compiler_output.cjs <site-url> [revision]");
const revision = process.argv[3];
const timeout = 90_000;

const assertProgram = [
    "using System;",
    "public static class Program",
    "{",
    "    public static void Main()",
    "    {",
    "        Console.WriteLine();",
    '        Assert(true, "✓ Первый Assert <mark>");',
    '        Assert(true, "✓ Второй Assert");',
    '        Assert(false, "❌ Assert <mark>");',
    "    }",
    "    private static void Assert(bool condition, string message)",
    "    {",
    "        if (!condition) throw new InvalidOperationException(message);",
    "        Console.WriteLine(message);",
    "    }",
    "}",
].join("\n");

const inputProgram = [
    "using System;",
    "public static class Program",
    "{",
    "    public static void Main()",
    "    {",
    '        Console.WriteLine("Введите значение");',
    "        var input = Console.ReadLine();",
    '        Console.WriteLine($"Получено {input}");',
    '        throw new ArgumentException("INPUT_REQUIRED", new Exception("внутренняя причина"));',
    "    }",
    "}",
].join("\n");

async function start(page, source) {
    assert.ok(await page.evaluate(code => {
        const editor = window.DotnetBrowserEditor;
        return editor.setCode(code) && editor.run();
    }, source), "The browser editor did not start compilation");
}

async function waitForOutput(page, marker) {
    const output = page.locator("#output");
    try {
        await page.waitForFunction(text => !window.DotnetBrowserEditor.busy()
            && document.getElementById("output").textContent.includes(text), marker, { timeout });
    } catch (cause) {
        throw new Error("Missing expected output " + marker + "\n" + await output.textContent(), { cause });
    }
    return output;
}

async function checkFailure(page, expectedStdout, error) {
    const output = await waitForOutput(page, error);
    assert.deepEqual(await output.locator("pre").allTextContents(), [expectedStdout]);
    const text = await output.textContent();
    assert.ok(text.indexOf(error) >= text.indexOf(expectedStdout) + expectedStdout.length);
    assert.ok(!text.includes(".NET WebAssembly execution completed successfully!"));
    assert.equal(await output.locator("mark").count(), 0);
    assert.equal(await output.locator("input").count(), 0);
}

function readLengthDelimitedFields(bytes) {
    const fields = new Map();
    let offset = 0;

    function readVarint() {
        let value = 0;
        for (let shift = 0; shift < 28 && offset < bytes.length; shift += 7) {
            const byte = bytes[offset++];
            value += (byte & 0x7f) * 2 ** shift;
            if (byte < 0x80) return value;
        }
        throw new Error("Invalid Protobuf varint in .NET Lab link");
    }

    while (offset < bytes.length) {
        const tag = readVarint();
        assert.equal(tag % 8, 2, "Expected a length-delimited Protobuf field");
        const length = readVarint();
        assert.ok(length <= bytes.length - offset, "Truncated Protobuf field");
        fields.set(Math.floor(tag / 8), bytes.subarray(offset, offset + length));
        offset += length;
    }
    return fields;
}

async function verifyDotnetLabLink(browser) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
        await context.route("https://lab.razor.fyi/**", route => route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><title>.NET Lab test</title>"
        }));
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        const url = new URL("courses/memory/lessons/001-allocations-copies-retention/", site);
        await page.goto(url.href, { waitUntil: "domcontentloaded" });
        const compiler = page.frameLocator("#course-compiler");
        await compiler.locator("#editor-run-current").waitFor({ state: "attached" });
        const source = [
            "",
            "using System;",
            "",
            "// Изменено в редакторе. Код содержит кириллицу и символы UTF-8. 🧪",
            'Console.WriteLine("Текущий текст #<>&");',
            "",
            ""
        ].join("\n");
        assert.ok(await page.locator("#course-compiler").evaluate(
            (iframe, code) => iframe.contentWindow.DotnetBrowserEditor.setCode(code),
            source
        ));

        const [popup] = await Promise.all([
            context.waitForEvent("page", { timeout: 10_000 }),
            page.locator("#page-editor-dotnet-lab").click()
        ]);
        await popup.waitForURL(target => target.origin === "https://lab.razor.fyi" && Boolean(target.hash), {
            timeout: 10_000
        });
        const slug = new URL(popup.url()).hash.slice(1);
        assert.match(slug, /^[a-zA-Z0-9_-]+$/);

        // SavedState stores the input file as field 1 and the selected output as field 9.
        const state = readLengthDelimitedFields(inflateRawSync(Buffer.from(slug, "base64url")));
        const input = state.get(1);
        assert.ok(input, ".NET Lab link must contain the input file");
        const file = readLengthDelimitedFields(input);
        assert.equal(file.get(1)?.toString("utf8"), "Program.cs");
        assert.equal(file.get(2)?.toString("utf8"), source, ".NET Lab must receive the edited source");
        assert.equal(state.get(9)?.toString("utf8"), "run");
        console.log(".NET Lab: checked the current editor text and output selection in the popup link");
    } finally {
        await context.close();
    }
}


async function verifyLessonCompletion(browser, coursePath, lessonPath, taskId) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        await page.goto(new URL(coursePath + lessonPath, site).href, { waitUntil: "domcontentloaded" });
        const getCompiler = async () => {
            const iframe = await page.locator("#course-compiler").elementHandle();
            const frame = await iframe.contentFrame();
            assert.ok(frame, "Lesson compiler frame is missing");
            return frame;
        };
        let compiler = await getCompiler();
        await compiler.locator("#editor-run-current").waitFor({ state: "attached" });

        const taskField = page.locator("#solution-" + taskId);
        const verifiedField = page.locator("#verified-" + taskId);
        const starter = await taskField.evaluate(field => field.defaultValue);
        assert.ok(!(await taskField.isEditable()), "The task field must be read-only");
        assert.equal(await taskField.inputValue(), starter, "The starter displays the author-provided method");
        assert.ok(await verifiedField.isHidden(), "A fresh task does not have a verified solution");
        const runCurrent = page.locator("#page-editor-run");
        const openStarter = page.getByRole("button", {name: "Открыть заготовку", exact: true});
        assert.ok(await openStarter.isVisible(), "A fresh task must offer the starter");
        const starterActions = page.locator('[data-practice-actions="' + taskId + '"]');
        assert.equal(await starterActions.getByRole("button").count(), 1, "The starter has only one action");
        const openDraft = page.getByRole("button", {name: "Открыть черновик", exact: true});
        assert.equal(await openDraft.count(), 0, "A fresh task does not have a saved practice draft");

        // Use the real editor, lesson runner and storage, with a synthetic task.
        const template = [
            "using System;",
            "using Number = System.Int32;",
            "public static class Program",
            "{",
            "    public static void Main()",
            "    {",
            "        if (Solve() != 42) throw new Exception(\"synthetic Assert failed\");",
            '        Console.WriteLine("Все проверки пройдены");',
            "        AfterChecks();",
            "    }",
            "    // BEGIN " + taskId,
            "    // INSERT_SOLUTION_HERE",
            "    // END " + taskId,
            "}"
        ].join("\n");
        const installTemplate = () => page.locator("#practice-program-template").evaluate((element, code) => {
            element.textContent = code;
            document.documentElement.dataset.practiceRunSignals = "0";
            window.addEventListener("message", event => {
                if (event.data?.type === "dotnet-courses:practice-run-success") {
                    document.documentElement.dataset.practiceRunSignals =
                        String(Number(document.documentElement.dataset.practiceRunSignals) + 1);
                }
            });
        }, template);
        await installTemplate();
        const status = page.locator("#lesson-completion-status");
        const solution = "static Number Solve() => 42;\n    static void AfterChecks() {}";
        const program = template.replace("// INSERT_SOLUTION_HERE", solution);
        const wrongProgram = program.replace("=> 42", "=> 41");
        const unrelatedProgram = 'Console.WriteLine("Modified example");';

        await openStarter.click();
        const openedStarter = await compiler.evaluate(() => window.DotnetBrowserEditor.getCode());
        assert.match(openedStarter, /throw new NotImplementedException\(\)/, "Opening the starter installs the unfinished method");
        assert.ok(!(await compiler.evaluate(() => window.DotnetBrowserEditor.busy())), "Opening the starter must not start the compiler");
        assert.ok(await verifiedField.isHidden(), "Opening the starter must not count as practice completion");

        assert.ok(await compiler.evaluate(code => window.DotnetBrowserEditor.setCode(code), unrelatedProgram));
        page.once("dialog", dialog => dialog.dismiss());
        await openStarter.click();
        assert.equal(await compiler.evaluate(() => window.DotnetBrowserEditor.getCode()), unrelatedProgram);

        assert.ok(await compiler.evaluate(code => window.DotnetBrowserEditor.setCode(code), wrongProgram));
        await openStarter.click();
        assert.equal(await compiler.evaluate(() => window.DotnetBrowserEditor.getCode()), wrongProgram,
            "Opening a task must preserve the existing lower editor code");
        await runCurrent.click();
        await waitForOutput(compiler, "synthetic Assert failed");
        assert.equal(await taskField.inputValue(), starter, "The starter must remain unchanged on failure");
        assert.ok(await verifiedField.isHidden(), "A failed run must not show a solution");

        const example = page.getByRole("button", {name: "Открыть C#-пример №1 в браузерном компиляторе", exact: true});
        page.once("dialog", dialog => dialog.accept());
        await example.click();
        const demoSource = await compiler.evaluate(() => window.DotnetBrowserEditor.getCode());
        assert.notEqual(demoSource, wrongProgram, "The lesson example must load into the editor");
        await openDraft.waitFor({state: "visible"});
        assert.equal(await openStarter.count(), 0, "The task must have one contextual opening button");
        await compiler.waitForFunction(() => {
            const output = document.getElementById("output").textContent;
            return !window.DotnetBrowserEditor.busy() && output.trim() && !output.includes("synthetic Assert failed");
        });
        await page.reload({waitUntil: "domcontentloaded"});
        compiler = await getCompiler();
        await compiler.locator("#editor-run-current").waitFor({state: "attached"});
        assert.equal(await compiler.evaluate(() => window.DotnetBrowserEditor.getCode()), demoSource);
        await installTemplate();
        await compiler.evaluate(() => {
            const editor = window.DotnetBrowserEditor;
            const run = editor.run;
            document.documentElement.dataset.fixtureRunCount = "0";
            editor.run = () => {
                document.documentElement.dataset.fixtureRunCount =
                    String(Number(document.documentElement.dataset.fixtureRunCount) + 1);
                return run();
            };
        });
        page.once("dialog", dialog => dialog.accept());
        await openDraft.click();
        const recovered = await compiler.evaluate(() => window.DotnetBrowserEditor.getCode());
        assert.match(recovered, /using Number = System\.Int32;/);
        assert.match(recovered, /static Number Solve\(\) => 41;/, "Pending practice must survive a demo and reload");
        assert.ok(await verifiedField.isHidden(), "A restored draft must not appear as a verified solution");

        const latest = recovered.replace("=> 41;", "=> 40;");
        assert.ok(await compiler.evaluate(code => window.DotnetBrowserEditor.setCode(code), latest));
        await openDraft.click();
        assert.equal(await compiler.evaluate(() => window.DotnetBrowserEditor.getCode()), latest,
            "Reopening must retain newer edits already in the editor");
        assert.equal(await compiler.evaluate(() => document.documentElement.dataset.fixtureRunCount), "0",
            "Opening a draft must not run the compiler");
        await runCurrent.click();
        await waitForOutput(compiler, "synthetic Assert failed");

        await start(compiler, program.replace("Solve() != 42", "Solve() != 41").replace("=> 42", "=> 41"));
        await page.waitForFunction(() => document.documentElement.dataset.practiceRunSignals === "1");
        assert.match(await status.textContent(), /исходными проверками/);
        await compiler.waitForFunction(() => !window.DotnetBrowserEditor.busy());

        await start(compiler, program.replace("AfterChecks() {}", 'AfterChecks() { throw new Exception("after checks"); }'));
        await checkFailure(compiler, "Все проверки пройдены\n", "Execution error: Exception: after checks");
        assert.notEqual(await status.textContent(), "Урок пройден.");

        assert.ok(await compiler.evaluate(code => window.DotnetBrowserEditor.setCode(code), program));
        await runCurrent.click();
        await page.waitForFunction(() => document.getElementById("lesson-completion-status").textContent === "Урок пройден.");
        const verified = "using System;\nusing Number = System.Int32;\n\n    " + solution + "\n";
        assert.equal(await taskField.inputValue(), starter, "A passing run must preserve the starter");
        assert.ok(await verifiedField.isVisible() && !(await verifiedField.isEditable()), "The passing solution must be visible and read-only");
        assert.equal(await verifiedField.inputValue(), verified, "A passing run must display the compiled method and imports");
        await start(compiler, wrongProgram);
        await waitForOutput(compiler, "synthetic Assert failed");
        assert.equal(await verifiedField.inputValue(), verified, "A later failing run must preserve the verified method");

        await page.reload({waitUntil: "domcontentloaded"});
        await verifiedField.waitFor({state: "visible"});
        assert.equal(await taskField.inputValue(), starter, "The canonical starter must survive reload");
        assert.equal(await verifiedField.inputValue(), verified, "The last verified method must survive reload");
        await page.goto(new URL(coursePath, site).href, { waitUntil: "domcontentloaded" });
        const badge = page.locator('[data-lesson-completion-badge][data-lesson="1"]');
        await badge.waitFor({ state: "visible" });
        assert.equal(await badge.textContent(), "Пройден");
        console.log(taskId + ": checked practice completion through WebAssembly and the course badge");
    } finally {
        await context.close();
    }
}

async function verify() {
    const browser = await chromium.launch();
    try {
        for (const runtime of [9, 10]) {
            const page = await browser.newPage();
            page.setDefaultTimeout(timeout);
            const url = new URL("browser-compiler-net" + runtime + "/", site);
            url.searchParams.set("course", runtime === 9 ? "csharp-dotnet-9-11" : "memory");
            url.searchParams.set("lesson", "1");
            if (revision) url.searchParams.set("v", revision);
            await page.goto(url.href, { waitUntil: "domcontentloaded" });
            await page.locator("#editor-run-current").waitFor({ state: "attached" });
            const codeViewToggle = page.locator(".toggle-container").filter({ has: page.locator("#code-view-desc") });
            assert.equal(await codeViewToggle.count(), 1);
            assert.ok(await codeViewToggle.isHidden(), "The lesson editor must hide simplified mode");
            assert.ok(await codeViewToggle.locator("input").isChecked(), "The lesson editor must show the full program");
            if (revision) {
                assert.equal(await page.locator('script[src$="compiler-editor.js?v=' + revision + '"]').count(), 1);
            }

            await start(page, assertProgram);
            await checkFailure(page, "\n✓ Первый Assert <mark>\n✓ Второй Assert\n",
                "Execution error: InvalidOperationException: ❌ Assert <mark>");

            await start(page, "public class Program { public static void Main() { MissingMethod(); } }");
            const diagnostic = await waitForOutput(page, "MissingMethod");
            assert.match(await diagnostic.textContent(), /Compilation failed with Roslyn/);
            assert.doesNotMatch(await diagnostic.textContent(), /Первый Assert|Execution error/);

            await start(page, 'public class Program { public static void Main() { Console.WriteLine("success marker"); } }');
            assert.equal(await (await waitForOutput(page, "success marker")).textContent(), "success marker\n");

            await page.reload({ waitUntil: "domcontentloaded" });
            await page.locator("#editor-run-current").waitFor({ state: "attached" });
            await page.locator('input[aria-describedby="system-output-desc"]').evaluate(input => input.click());
            await start(page, inputProgram);
            const input = page.locator("#output input");
            await input.fill("42");
            await input.press("Enter");
            await checkFailure(page, "Введите значение\n42\nПолучено 42\n", "Execution error: ArgumentException: INPUT_REQUIRED");

            console.log(".NET " + runtime + ": checked Assert output, compiler diagnostics, rerun, and interactive exception output");
            await page.close();
        }
        await verifyDotnetLabLink(browser);
        await verifyLessonCompletion(browser, "courses/csharp-dotnet-9-11/", "lessons/001-params-countby/", "TASK-001");
        await verifyLessonCompletion(browser, "courses/memory/", "lessons/001-allocations-copies-retention/", "ALLOC-TASK-001");
    } finally {
        await browser.close();
    }
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
