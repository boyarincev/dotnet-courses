"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { inflateRawSync } = require("node:zlib");
const { chromium } = require("playwright");
const { browserRuntimes, discoverLessons } = require("./lesson-sources.cjs");
const { prepareLesson } = require("./verify_lessons.cjs");

const site = process.argv[2];
if (!site) throw new Error("Usage: node verify_compiler_output.cjs <site-url> [revision]");
const revision = process.argv[3];
const timeout = 90_000;
const readyRunSelector = '#editor-run-current:enabled:not([aria-disabled="true"])';

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

const diagnosticProgram = [
    "using System;",
    "namespace Lesson;",
    "#line 400",
    "public static class Program",
    "{",
    "    public static void Main()",
    "    {",
    "        // Keep an emoji before the diagnostic to exercise UTF-16 columns.",
    '        Console.WriteLine("🧪" + MissingMethod());',
    "    }",
    "}"
].join("\n");

async function verifyDiagnosticClick(editor, diagnostic) {
    const line = diagnosticProgram.split("\n").findIndex(text => text.includes("MissingMethod"));
    const column = diagnosticProgram.split("\n")[line].indexOf("MissingMethod");
    assert.match(await diagnostic.textContent(), new RegExp(`Строка ${line + 1}, столбец ${column + 1}\\. CS0103`));
    await diagnostic.click();
    const pointed = await editor.evaluate(wrapper => {
        const cm = wrapper.CodeMirror;
        return { start: cm.getCursor("from"), text: cm.getSelection(), focused: cm.hasFocus() };
    });
    assert.deepEqual(pointed, { start: { line, ch: column, sticky: null }, text: "MissingMethod", focused: true });
    assert.equal(await editor.locator(".compiler-diagnostic-line").count(), 1);
}

async function openLessonCompiler(page) {
    await page.locator("#course-compiler").scrollIntoViewIfNeeded();
    const frame = page.frameLocator("#course-compiler");
    await frame.locator(readyRunSelector).waitFor();
    return frame;
}

async function verifyLessonExample(browser, lesson) {
    const { route, startSnippet, taskId, browserRuntime, practice } = lesson;
    const page = await browser.newPage({ serviceWorkers: "block" });
    try {
        page.setDefaultTimeout(timeout);
        await page.goto(new URL(route, site).href, { waitUntil: "domcontentloaded" });
        const { examples, wrongPractice } = prepareLesson(lesson);
        const example = examples.find(item => item.id === startSnippet);
        const frame = await openLessonCompiler(page);
        const iframe = page.locator("#course-compiler");
        const feedback = frame.locator("#editor-run-feedback");
        await page.waitForFunction(expected => document.getElementById("course-compiler").contentWindow
            .DotnetBrowserEditor.getCode().trimEnd() === expected, example.code.trimEnd());
        assert.equal(await feedback.textContent(), "", `${route}: a ready editor needs no run message`);
        await page.locator(`button[data-example-id="${startSnippet}"]`).click();
        const output = frame.locator("#output");
        await output.locator("pre").first().waitFor({ state: "attached" });
        assert.equal(await output.textContent(), example.output, `Output of ${route} (${startSnippet})`);
        console.log(`${route}: ran the starting example and checked its output against the lesson`);

        if (browserRuntime === "11") {
            await page.getByRole("button", { name: "Открыть заготовку", exact: true }).click();
            const starter = await iframe.evaluate(element => element.contentWindow.DotnetBrowserEditor.getCode());
            assert.equal(starter.trimEnd(), practice.trimEnd(), `${taskId}: the editor must open the complete practice`);
            assert.ok(await iframe.evaluate((element, source) => element.contentWindow.DotnetBrowserEditor.setCode(source), wrongPractice));
            await frame.locator("#editor-run-current").click();
            await output.filter({ hasText: `❌ ${taskId}:` }).waitFor();
            assert.ok(await page.locator("#verified-" + taskId).isHidden(), `${taskId}: incorrect practice must remain unverified`);
            console.log(`${route}: compiled the authored practice and rejected the incorrect solution`);
        }
    } finally {
        await page.close();
    }
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
        const frame = await openLessonCompiler(page);
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

        const lab = frame.locator("#editor-dotnet-lab");
        const feedback = frame.locator("#editor-run-feedback");
        await page.evaluate(() => {
            const open = window.open;
            window.open = () => {
                window.open = open;
                return null;
            };
        });
        await lab.click();
        await feedback.filter({ hasText: "Браузер заблокировал новую вкладку .NET Lab." }).waitFor();
        const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 10_000 }), lab.click()]);
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
        assert.equal(await feedback.textContent(), "", "Opening .NET Lab must clear the warning from a blocked attempt");
        console.log(".NET Lab: checked the current editor text and output selection in the popup link");
    } finally {
        await context.close();
    }
}


async function verifyLessonCompletion(browser, coursePath, lessonPath, taskId, viewport) {
    const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce", viewport });
    try {
        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(site).origin });
        const page = await context.newPage();
        page.setDefaultTimeout(timeout);
        await page.goto(new URL(coursePath + lessonPath, site).href, { waitUntil: "domcontentloaded" });
        const getCompiler = async () => {
            await openLessonCompiler(page);
            const iframe = await page.locator("#course-compiler").elementHandle();
            const frame = await iframe.contentFrame();
            assert.ok(frame, "Lesson compiler frame is missing");
            return frame;
        };
        let compiler = await getCompiler();

        const taskField = page.locator("#solution-" + taskId);
        const verifiedField = page.locator("#verified-" + taskId);
        const practiceProgram = page.locator("pre#practice-program, #practice-program pre");
        const starter = await taskField.evaluate(field => field.defaultValue);
        assert.ok(!(await taskField.isEditable()), "The task field must be read-only");
        assert.equal(await taskField.inputValue(), starter, "The starter displays the author-provided method");
        assert.ok((await practiceProgram.textContent()).includes(starter), "The displayed starter comes from the practice program");
        assert.ok(await verifiedField.isHidden(), "A fresh task does not have a verified solution");
        const runCurrent = page.frameLocator("#course-compiler").locator("#editor-run-current");
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
        const installTemplate = () => practiceProgram.evaluate((element, code) => {
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
        const headerBadge = page.locator(".eyebrow [data-lesson-completion-badge]");
        const lessonQuiz = page.locator("[data-lesson-quiz-link]");
        const instructions = page.locator("[data-lesson-practice-instructions]");
        const assertBadge = async (badge, completed) => {
            assert.ok(await badge.isVisible(), "The lesson badge must be shown in both states");
            assert.equal(await badge.textContent(), completed ? "Пройден" : "Не пройден");
            assert.equal((await badge.getAttribute("data-completed")) !== null, completed);
        };
        assert.equal(await status.textContent(), "Урок ещё не пройден.");
        await assertBadge(headerBadge, false);
        assert.ok(await instructions.isVisible());
        assert.equal(await lessonQuiz.isVisible(), false);
        const solution = "static Number Solve() => 42;\n    static void AfterChecks() {}";
        const program = template.replace("// INSERT_SOLUTION_HERE", solution);
        const wrongProgram = program.replace("=> 42", "=> 41");
        const unrelatedProgram = 'Console.WriteLine("Modified example");';

        const inViewport = locator => locator.evaluate(element => {
            const { top, bottom } = element.getBoundingClientRect();
            return top >= 0 && bottom <= window.innerHeight;
        });
        const waitForStarterFocus = () => page.waitForFunction(() => {
            const frame = document.getElementById("course-compiler");
            const heading = frame.contentDocument.getElementById("editor-heading");
            if (!heading || document.activeElement !== frame || frame.contentDocument.activeElement !== heading) return false;
            const { top, bottom } = heading.getBoundingClientRect();
            const frameTop = frame.getBoundingClientRect().top;
            return top >= 0 && bottom <= frame.clientHeight && frameTop + top >= 0 && frameTop + bottom <= innerHeight;
        });
        await openStarter.click();
        await waitForStarterFocus();
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

        const example = page.locator(".snippet-actions button[data-example-id]").first();
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
        await waitForStarterFocus();
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

        const updatedTemplate = template.replace("synthetic Assert failed", "updated Assert diagnostic");
        const setTemplate = code => practiceProgram.evaluate((element, text) => { element.textContent = text; }, code);
        await setTemplate(updatedTemplate);
        await openDraft.click();
        assert.equal(await compiler.evaluate(() => window.DotnetBrowserEditor.getCode()), latest,
            "Opening an old draft must wait for an explicit update");
        const updateChecks = page.getByRole("button", { name: "Обновить проверки", exact: true });
        const downloadPrevious = page.getByRole("button", { name: "Скачать прежний Program.cs", exact: true });
        await updateChecks.click();
        assert.equal(await compiler.evaluate(() => window.DotnetBrowserEditor.getCode()),
            latest.replace("synthetic Assert failed", "updated Assert diagnostic"),
            "An explicit update replaces only the checks and keeps the learner's method and imports");
        assert.equal(await compiler.evaluate(() => document.documentElement.dataset.fixtureRunCount), "0",
            "Updating checks must not auto-run");
        const [previousDownload] = await Promise.all([page.waitForEvent("download"), downloadPrevious.click()]);
        assert.equal(previousDownload.suggestedFilename(), "Program.previous.cs");
        assert.equal(readFileSync(await previousDownload.path(), "utf8"), latest,
            "The complete old file can still be exported after the update");
        await setTemplate(template);
        assert.ok(await compiler.evaluate(code => window.DotnetBrowserEditor.setCode(code), latest));

        await runCurrent.click();
        await waitForOutput(compiler, "synthetic Assert failed");

        await start(compiler, program.replace("Solve() != 42", "Solve() != 41").replace("=> 42", "=> 41"));
        await page.waitForFunction(() => document.documentElement.dataset.practiceRunSignals === "1");
        await page.frameLocator("#course-compiler").locator("#editor-run-feedback")
            .filter({ hasText: /исходными проверками/ }).waitFor();
        assert.equal(await status.textContent(), "Урок ещё не пройден.");
        await compiler.waitForFunction(() => !window.DotnetBrowserEditor.busy());

        await start(compiler, program.replace("AfterChecks() {}", 'AfterChecks() { throw new Exception("after checks"); }'));
        await checkFailure(compiler, "Все проверки пройдены\n", "Execution error: Exception: after checks");
        assert.notEqual(await status.textContent(), "Урок пройден.");
        await assertBadge(headerBadge, false);

        assert.ok(await compiler.evaluate(code => window.DotnetBrowserEditor.setCode(code), program));
        const runWithShortcut = viewport?.width <= 600;
        if (runWithShortcut) {
            await page.locator("#course-compiler").evaluate(frame => frame.scrollIntoView({ block: "start" }));
            assert.ok(await status.evaluate(element => element.getBoundingClientRect().bottom <= 0),
                "The lesson status must be off-screen before testing acceptance via Ctrl+Enter");
            await page.keyboard.press("Control+Enter");
        } else {
            await runCurrent.click();
        }
        await page.waitForFunction(() => document.getElementById("lesson-completion-status").textContent === "Урок пройден.");
        await assertBadge(headerBadge, true);
        await lessonQuiz.waitFor();
        assert.ok(await lessonQuiz.evaluate(link => link.parentElement.contains(document.getElementById("lesson-completion-status"))),
            "The lesson quiz link must appear next to the lesson status");
        assert.ok(await inViewport(lessonQuiz), "The quiz link must be in view after practice passes");
        assert.ok(await inViewport(status), "The lesson status must also be in view");
        assert.ok(await instructions.isHidden(), "The acceptance instructions must leave room for the quiz link");
        if (runWithShortcut) {
            assert.ok(await compiler.evaluate(() => document.activeElement.matches(".CodeMirror textarea")),
                "Showing the quiz link must leave keyboard focus in the code field");
        }
        await page.waitForFunction(async () => {
            const status = document.getElementById("lesson-completion-status");
            const engine = await window.DotnetQuizSRSReady;
            const storage = window.DotnetQuizStorage.forCourse(status.dataset.course);
            const bank = JSON.parse(document.getElementById("question-bank").textContent);
            const ids = engine.eligible(bank, new Date()).filter(question =>
                Number(question.lesson_number) === Number(status.dataset.lesson)).map(question => question.id);
            const records = storage.records(ids);
            return ids.every(id => records[id]?.card && records[id].history.length === 0);
        });
        const verified = "using System;\nusing Number = System.Int32;\n\n    " + solution + "\n";
        assert.equal(await taskField.inputValue(), starter, "A passing run must preserve the starter");
        assert.ok(await verifiedField.isVisible() && !(await verifiedField.isEditable()), "The passing solution must be visible and read-only");
        assert.equal(await verifiedField.inputValue(), verified, "A passing run must display the compiled method and imports");
        await start(compiler, wrongProgram);
        await waitForOutput(compiler, "synthetic Assert failed");
        assert.equal(await verifiedField.inputValue(), verified, "A later failing run must preserve the verified method");
        await assertBadge(headerBadge, true);

        await page.locator("#page-editor-copy").click();
        await page.waitForFunction(source => navigator.clipboard.readText().then(text => text === source), wrongProgram);
        const [currentDownload] = await Promise.all([
            page.waitForEvent("download"), page.locator("#page-editor-download").click()
        ]);
        assert.equal(currentDownload.suggestedFilename(), "Program.cs");
        assert.equal(readFileSync(await currentDownload.path(), "utf8"), wrongProgram, "Export must use the current C# source");

        await page.reload({waitUntil: "domcontentloaded"});
        await verifiedField.waitFor({state: "visible"});
        await assertBadge(headerBadge, true);
        assert.equal(await taskField.inputValue(), starter, "The canonical starter must survive reload");
        assert.equal(await verifiedField.inputValue(), verified, "The last verified method must survive reload");
        const lessonNumber = await headerBadge.getAttribute("data-lesson");
        await page.goto(new URL(coursePath, site).href, { waitUntil: "domcontentloaded" });
        const badges = page.locator(".lesson-card [data-lesson-completion-badge]");
        await assertBadge(badges.and(page.locator(`[data-lesson="${lessonNumber}"]`)), true);
        const courseStart = page.locator("[data-course-start]");
        const nextBadge = badges.and(page.locator(":not([data-completed])")).first();
        if (await nextBadge.count()) {
            await assertBadge(nextBadge, false);
            assert.equal(await courseStart.textContent(), "Продолжить с урока " + await nextBadge.getAttribute("data-lesson"));
            assert.equal(await courseStart.getAttribute("href"), await nextBadge.evaluate(node => node.closest("a").getAttribute("href")));
        } else {
            assert.equal(await courseStart.textContent(), "К списку уроков");
            assert.equal(await courseStart.getAttribute("href"), "#course-lessons");
        }
        console.log(taskId + ": checked practice completion through WebAssembly and the course badge");
    } finally {
        await context.close();
    }
}

async function verifyCodeMirrorFallback(browser) {
    const page = await browser.newPage({ serviceWorkers: "block" });
    try {
        page.setDefaultTimeout(timeout);
        await page.route("**/assets/vendor/codemirror/**/*.js", route => route.abort());
        await page.goto(new URL("courses/memory/lessons/001-allocations-copies-retention/", site).href,
            { waitUntil: "domcontentloaded" });
        const frame = await openLessonCompiler(page);
        const editor = frame.locator("#code-editor");
        await editor.waitFor({ state: "visible" });
        const feedback = frame.locator("#editor-run-feedback");
        await page.waitForFunction(() => /List<Order> ParsePaid\(/.test(document.getElementById("course-compiler")
            .contentDocument.getElementById("code-editor").value));
        assert.equal(await feedback.textContent(), "", "A ready plain editor needs no run message");
        await page.getByRole("button", { name: "Открыть заготовку", exact: true }).click();
        assert.match(await editor.inputValue(), /static \(int PaidCount, decimal Total\) SummarizePaid\(/,
            "The lesson button must open the practice in the plain editor");
        const run = frame.locator("#editor-run-current");
        await editor.press("Escape");
        assert.ok(await run.evaluate(button => button === document.activeElement),
            "Escape from the plain editor must focus the lesson Run button");

        const edited = 'using System; public static class Program { public static void Main() { Console.WriteLine("Plain editor draft"); } }';
        await editor.fill(edited);
        await page.reload({ waitUntil: "domcontentloaded" });
        await openLessonCompiler(page);
        assert.equal(await editor.inputValue(), edited, "The plain editor must restore learner changes");
        await run.click();
        const output = frame.locator("#output").filter({ hasText: "Plain editor draft" });
        await output.waitFor();
        assert.equal(await feedback.textContent(), "", await output.textContent());
        assert.deepEqual(await output.locator("pre").allTextContents(), ["Plain editor draft\n"]);

        const offset = "\n".repeat(60);
        await editor.fill(offset + diagnosticProgram);
        await run.click();
        await frame.locator('#editor-run-feedback[data-state="error"]').waitFor();
        const diagnostic = frame.locator("#output .compiler-diagnostic").filter({ hasText: "MissingMethod" });
        await diagnostic.click();
        assert.deepEqual(await editor.evaluate(textarea => ({
            start: textarea.selectionStart,
            selected: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
            scrolled: textarea.scrollTop > 0
        })), { start: offset.length + diagnosticProgram.indexOf("MissingMethod"), selected: "MissingMethod", scrolled: true });
        console.log("CodeMirror unavailable: checked the plain editor, Escape, restored draft and Roslyn error navigation");
    } finally {
        await page.close();
    }
}

async function verifyEmbeddedWorkspace(browser) {
    const page = await browser.newPage({
        serviceWorkers: "block", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce"
    });
    try {
        page.setDefaultTimeout(timeout);
        await page.goto(new URL("courses/memory/lessons/001-allocations-copies-retention/", site).href,
            { waitUntil: "domcontentloaded" });
        const frame = await openLessonCompiler(page);
        const iframe = page.locator("#course-compiler");
        const feedback = frame.locator("#editor-run-feedback");
        const run = frame.locator("#editor-run-current");
        const editorPane = frame.locator(".CodeMirror");
        const runHasFocus = () => run.evaluate(button => button === document.activeElement);
        assert.equal(await frame.locator("html.course-editor-embedded").getAttribute("lang"), "ru");
        assert.ok(await run.isVisible(), "Run must be visible in the embedded editor");
        assert.equal(await feedback.textContent(), "", "An idle editor has no run message");
        assert.ok(await frame.getByRole("heading", { name: "Консоль", exact: true }).isVisible());
        assert.equal(await frame.locator("#output").getAttribute("aria-label"), "Вывод программы");
        assert.equal(await page.getByRole("button", { name: "К выводу", exact: true }).count(), 0);
        assert.equal(await frame.getByRole("button", { name: "К выводу", exact: true }).count(), 0);

        const waitForLayout = stacked => page.waitForFunction(isStacked => {
            const doc = document.getElementById("course-compiler").contentDocument;
            const editor = doc.querySelector(".editor-section").getBoundingClientRect();
            const consolePane = doc.querySelector(".output-section").getBoundingClientRect();
            if (consolePane.right > doc.documentElement.clientWidth + 1 ||
                consolePane.bottom > doc.documentElement.clientHeight + 1) return false;
            if (isStacked) return editor.bottom <= consolePane.top + 1 && Math.abs(editor.left - consolePane.left) <= 1;
            return editor.right <= consolePane.left + 1 && editor.bottom > consolePane.top;
        }, stacked, { timeout: 5000 });
        const verifyControlsLayout = async () => {
            assert.ok(await run.evaluate(button => {
                const code = document.querySelector(".CodeMirror");
                const bar = document.getElementById("editor-run-bar");
                const lab = document.getElementById("editor-dotnet-lab");
                return code.nextElementSibling === bar && bar.contains(button) && bar.contains(lab) &&
                    button.getBoundingClientRect().top >= code.getBoundingClientRect().bottom - 1 &&
                    Boolean(button.compareDocumentPosition(lab) & Node.DOCUMENT_POSITION_FOLLOWING);
            }), "Run must follow the code field and precede the secondary .NET Lab action");
            assert.ok(await frame.locator("#editor-fullscreen").evaluate(button => {
                const heading = document.getElementById("editor-heading").getBoundingClientRect();
                const toggle = button.getBoundingClientRect();
                return toggle.top < heading.bottom && toggle.bottom > heading.top;
            }), "The fullscreen control belongs on the editor heading row");
        };
        await waitForLayout(true);
        await verifyControlsLayout();
        assert.ok((await editorPane.boundingBox()).height > 480,
            "The normal desktop code viewport must be taller than 480 px");

        await editorPane.evaluate(wrapper => {
            const editor = wrapper.CodeMirror;
            editor.setValue([
                "void Project(IEnumerable<Item> source)",
                "{",
                "    var result = source",
                "        .Select(item => (item.Name, item.Value)",
                "}"
            ].join("\n"));
            editor.setCursor(3, editor.getLine(3).length);
            editor.focus();
        });
        await page.keyboard.press("Enter");
        const currentLine = () => editorPane.evaluate(wrapper => {
            const editor = wrapper.CodeMirror;
            return editor.getLine(editor.getCursor().line);
        });
        const indentation = await currentLine();
        assert.match(indentation, /^ {4,}$/);
        await page.keyboard.press("Shift+Tab");
        assert.equal(await currentLine(), indentation.slice(4),
            "Shift+Tab must remove one indent even inside an unfinished call");

        const runWithShortcut = async source => {
            assert.ok(await iframe.evaluate((element, code) => {
                const editor = element.contentWindow.DotnetBrowserEditor;
                if (!editor.setCode(code)) return false;
                editor.focus();
                return true;
            }, source));
            await page.keyboard.press("Control+Enter");
        };
        const output = frame.locator("#output");
        const keyboardProgram = 'using System; public static class Program { public static void Main() { Console.WriteLine("Keyboard workspace"); } }';
        await runWithShortcut(keyboardProgram);
        await output.filter({ hasText: "Keyboard workspace" }).waitFor();
        await frame.locator(readyRunSelector).waitFor();
        assert.equal(await feedback.textContent(), "", "Success is announced in the console");
        const codeField = editorPane.locator("textarea");
        const codeHasFocus = () => codeField.evaluate(editor => editor === document.activeElement);
        assert.ok(await codeHasFocus(),
            "Ctrl+Enter must not move focus away from the editor");
        await editorPane.evaluate(wrapper => {
            const cm = wrapper.CodeMirror;
            cm.setCursor(cm.posFromIndex(cm.getValue().indexOf("Console") + 3));
        });
        await page.keyboard.press("Control+Space");
        const suggestions = frame.locator(".CodeMirror-hints");
        await suggestions.waitFor();
        await page.keyboard.press("Escape");
        await suggestions.waitFor({ state: "detached" });
        assert.ok(await codeHasFocus(), "Escape must close suggestions before moving focus");
        await page.keyboard.press("Escape");
        assert.ok(await runHasFocus(), "Escape from CodeMirror must focus the lesson Run button");

        const workspace = page.locator("#lesson-editor-workspace");
        const expanded = page.locator("#lesson-editor-workspace.is-expanded");
        const fullscreen = frame.locator("#editor-fullscreen");
        const expandedEditor = frame.locator("html.course-editor-fullscreen");
        const editorCode = () => iframe.evaluate(element => element.contentWindow.DotnetBrowserEditor.getCode());
        const compilerDocument = await iframe.evaluateHandle(element => element.contentDocument);
        const initialOutput = await output.textContent();

        const checkExpanded = async () => {
            await expanded.waitFor();
            await expandedEditor.waitFor({ state: "attached" });
            assert.equal(await fullscreen.getAttribute("aria-label"), "Свернуть полноэкранный редактор");
            assert.ok(await run.isVisible(), "Run must remain available in fullscreen");
            assert.ok(await page.locator("#page-editor-copy").evaluate(button => Boolean(button.closest("[inert]"))),
                "Fullscreen must exclude the lesson export controls");
            assert.ok(await workspace.evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return Math.abs(bounds.left) <= 1 && Math.abs(bounds.top) <= 1 &&
                    bounds.right >= window.innerWidth - 1 && bounds.bottom >= window.innerHeight - 1;
            }), "Fullscreen must fill the viewport");
        };
        const checkCollapsed = async () => {
            await expanded.waitFor({ state: "detached" });
            await expandedEditor.waitFor({ state: "detached" });
            assert.equal(await fullscreen.getAttribute("aria-label"), "На весь экран");
            assert.ok(await fullscreen.evaluate(button => button === document.activeElement),
                "Leaving fullscreen must return focus to its button");
        };

        assert.equal(await fullscreen.getAttribute("aria-label"), "На весь экран");
        assert.equal((await fullscreen.textContent()).trim(), "", "Fullscreen uses an icon and an accessible name");
        await fullscreen.click();
        await checkExpanded();
        await waitForLayout(false);
        const nativeFullscreen = await workspace.evaluate(element => document.fullscreenElement === element);
        assert.ok((await editorPane.boundingBox()).height > 480,
            "The editor must retain a tall code viewport with the fullscreen console to its right");
        assert.equal(await editorCode(), keyboardProgram);
        assert.equal(await output.textContent(), initialOutput);
        const nativeProgram = keyboardProgram.replace("Keyboard workspace", "Native fullscreen");
        assert.ok(await iframe.evaluate((element, code) => element.contentWindow.DotnetBrowserEditor.setCode(code), nativeProgram));
        await run.click();
        await output.filter({ hasText: "Native fullscreen" }).waitFor();
        await frame.locator(readyRunSelector).waitFor();
        const nativeOutput = await output.textContent();
        await codeField.focus();
        await page.keyboard.press("Escape");
        assert.ok(await runHasFocus(), "Escape must focus Run while the editor is fullscreen");
        await checkExpanded();
        await page.keyboard.press("Escape");
        await checkCollapsed();
        await waitForLayout(true);
        assert.ok(await iframe.evaluate((element, before) => element.contentDocument === before, compilerDocument),
            "Toggling fullscreen must retain the live compiler document");
        await compilerDocument.dispose();
        assert.equal(await editorCode(), nativeProgram);
        assert.equal(await output.textContent(), nativeOutput);

        await page.setViewportSize({ width: 390, height: 844 });
        await waitForLayout(true);
        await verifyControlsLayout();
        assert.ok((await editorPane.boundingBox()).height > 256,
            "The normal mobile code viewport must be taller than 256 px");
        await workspace.evaluate(element => {
            element.requestFullscreen = () => Promise.reject(new DOMException("Fullscreen denied for test", "NotAllowedError"));
        });
        await fullscreen.click();
        await checkExpanded();
        await waitForLayout(true);
        assert.equal(await workspace.getAttribute("aria-modal"), "true");
        assert.equal(await page.evaluate(() => document.fullscreenElement), null);

        assert.ok(await iframe.evaluate((element, code) => element.contentWindow.DotnetBrowserEditor.setCode(code), diagnosticProgram));
        await run.click();
        await frame.locator('#editor-run-feedback[data-state="error"]').waitFor();
        await verifyDiagnosticClick(editorPane, output.locator(".compiler-diagnostic").filter({ hasText: "MissingMethod" }));

        await runWithShortcut(inputProgram);
        const input = output.locator("input[type=text]");
        await input.waitFor({ state: "visible" });
        await run.focus();
        for (let i = 0; i < 8 && !await input.evaluate(element => element === document.activeElement); i++) {
            await page.keyboard.press("Tab");
        }
        assert.ok(await input.evaluate(element => element === document.activeElement), "The ReadLine input must be reachable by Tab from Run");
        await page.keyboard.insertText("42");
        await page.keyboard.press("Enter");
        await output.filter({ hasText: "Получено 42" }).waitFor();
        await output.filter({ hasText: "Execution error: ArgumentException: INPUT_REQUIRED" }).waitFor();
        await frame.locator('#editor-run-feedback[data-state="error"]').waitFor();
        const fullscreenOutput = await output.textContent();
        await codeField.focus();
        await page.keyboard.press("Escape");
        assert.ok(await runHasFocus(), "Escape must focus Run in the viewport fallback");
        await checkExpanded();
        await page.keyboard.press("Escape");
        await checkCollapsed();
        await waitForLayout(true);
        assert.equal(await editorCode(), inputProgram);
        assert.equal(await output.textContent(), fullscreenOutput);

        await page.reload({ waitUntil: "domcontentloaded" });
        await openLessonCompiler(page);
        assert.equal(await editorCode(), inputProgram, "Fullscreen edits must survive a page reload");
        console.log("Embedded editor: checked larger normal editor with console below, " + (nativeFullscreen ? "native fullscreen, " : "") +
            "viewport fallback, draft, Ctrl+Enter, Escape, autocomplete and ReadLine");
    } finally {
        await page.close();
    }
}

async function verify() {
    const browser = await chromium.launch();
    try {
        for (const runtime of browserRuntimes) {
            const page = await browser.newPage();
            page.setDefaultTimeout(timeout);
            const url = new URL("browser-compiler-net" + runtime + "/", site);
            url.searchParams.set("course", runtime === "10" ? "memory" : "csharp-dotnet-9-11");
            url.searchParams.set("lesson", "1");
            if (revision) url.searchParams.set("v", revision);
            await page.goto(url.href, { waitUntil: "domcontentloaded" });
            await page.locator(readyRunSelector).waitFor();
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

            await start(page, diagnosticProgram);
            const diagnostic = await waitForOutput(page, "MissingMethod");
            assert.match(await diagnostic.textContent(), /Compilation failed with Roslyn/);
            assert.doesNotMatch(await diagnostic.textContent(), /Первый Assert|Execution error/);
            const target = diagnostic.locator(".compiler-diagnostic").filter({ hasText: "MissingMethod" });
            await verifyDiagnosticClick(page.locator(".CodeMirror"), target);
            await page.evaluate(code => window.DotnetBrowserEditor.setCode(code), diagnosticProgram + "\n// edited");
            assert.ok(await target.isDisabled(), "Diagnostics for older source must not move the cursor");
            assert.equal(await page.locator(".compiler-diagnostic-line").count(), 0);

            const runtimeMarker = `runtime: ${runtime}/wasm`;
            await start(page, 'using System; using Text = System.String; namespace Lesson; public class Program { public static void Main() { ' +
                'Console.WriteLine("runtime: " + System.Environment.Version.Major + "/" + ' +
                '(System.OperatingSystem.IsBrowser() ? "wasm" : "native")); ' +
                'Console.WriteLine((Text)"<button class=compiler-diagnostic>Строка 1: printed text</button>"); } }');
            const runtimeOutput = await waitForOutput(page, runtimeMarker);
            assert.equal(await runtimeOutput.textContent(), runtimeMarker + "\n<button class=compiler-diagnostic>Строка 1: printed text</button>\n");
            assert.equal(await runtimeOutput.locator(".compiler-diagnostic").count(), 0);

            await page.reload({ waitUntil: "domcontentloaded" });
            await page.locator(readyRunSelector).waitFor();
            await page.locator('input[aria-describedby="system-output-desc"]').evaluate(input => input.click());
            await start(page, inputProgram);
            const input = page.locator("#output input");
            await input.fill("42");
            await input.press("Enter");
            await checkFailure(page, "Введите значение\n42\nПолучено 42\n", "Execution error: ArgumentException: INPUT_REQUIRED");

            console.log(".NET " + runtime + ": checked Assert output, compiler diagnostics, rerun, and interactive exception output");
            await page.close();
        }
        for (const lesson of discoverLessons().filter(item => item.browserRuntime)) {
            await verifyLessonExample(browser, lesson);
        }
        await verifyDotnetLabLink(browser);
        await verifyLessonCompletion(browser, "courses/csharp-dotnet-9-11/", "lessons/001-params-countby/", "TASK-001");
        await verifyLessonCompletion(browser, "courses/memory/", "lessons/001-allocations-copies-retention/", "ALLOC-TASK-001", { width: 390, height: 844 });
        await verifyCodeMirrorFallback(browser);
        await verifyEmbeddedWorkspace(browser);
    } finally {
        await browser.close();
    }
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
