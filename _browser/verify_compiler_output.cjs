"use strict";

const assert = require("node:assert/strict");
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

async function verify() {
    const browser = await chromium.launch();
    try {
        for (const runtime of [9, 10]) {
            const page = await browser.newPage();
            page.setDefaultTimeout(timeout);
            const url = new URL("browser-compiler-net" + runtime + "/", site);
            if (revision) url.searchParams.set("v", revision);
            await page.goto(url.href, { waitUntil: "domcontentloaded" });
            await page.locator("#editor-run-current").waitFor({ state: "attached" });
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
    } finally {
        await browser.close();
    }
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
