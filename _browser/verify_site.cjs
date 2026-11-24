"use strict";

const assert = require("node:assert/strict");
const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");
const { courses, discoverLessons } = require("./lesson-sources.cjs");
const { prepareLesson } = require("./verify_lessons.cjs");

const [baseUrl, siteDirectory, revision] = process.argv.slice(2);
if (!baseUrl || !siteDirectory) throw Error("Usage: node verify_site.cjs <site-url> <site-directory> [revision]");
const site = new URL(baseUrl);
const lessons = discoverLessons();

function verifyLocalFile(target, from) {
    assert.ok(target.pathname.startsWith(site.pathname), "Link points outside the Pages base URL: " + target);
    const local = decodeURIComponent(target.pathname.slice(site.pathname.length));
    const filename = join(siteDirectory, local.endsWith("/") || !local ? local + "index.html" : local);
    assert.ok(statSync(filename, { throwIfNoEntry: false })?.isFile(), `Missing ${target} linked from ${from}`);
}

async function visit(page, url) {
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
    assert.ok(response?.ok(), "Could not open " + url);
    if (revision) {
        assert.equal(await page.locator('meta[name="site-revision"]').getAttribute("content"), revision, url.href);
    }

    const ids = await page.locator("[id]").evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(new Set(ids).size, ids.length, "Duplicate element ID on " + url);
    const references = await page.locator("a[href], link[href], script[src]").evaluateAll(nodes => nodes.map(node => node.href || node.src));
    for (const reference of new Set(references)) {
        const target = new URL(reference);
        if (target.origin !== site.origin) continue;
        verifyLocalFile(target, url);
        if (target.pathname === url.pathname && target.hash) {
            assert.ok(ids.includes(decodeURIComponent(target.hash.slice(1))), `Missing anchor ${target}`);
        }
    }
}

async function verifyLesson(page, lesson, quiz) {
    const url = new URL(lesson.route, site);
    await visit(page, url);
    const quizLink = new URL(quiz);
    quizLink.searchParams.set("through", lesson.number);
    const links = await page.locator("a[href]").evaluateAll(anchors => anchors.map(anchor => anchor.href));
    assert.ok(links.includes(quizLink.href), `Missing current-course quiz link on ${url}`);

    const sourceBlock = id => page.locator(`pre#${id}, #${id} pre`);
    const normalize = source => source.replace(/\r\n/g, "\n").trimEnd();
    assert.equal(normalize(await sourceBlock("practice-program").textContent()), normalize(lesson.practice), `${url}: practice code`);
    for (const example of lesson.examples) {
        assert.equal(normalize(await sourceBlock(`snippet-${example.id}`).textContent()), normalize(example.code), `${url}: #snippet-${example.id}`);
        assert.equal(normalize(await sourceBlock(`output-${example.id}`).textContent()), normalize(example.output), `${url}: #output-${example.id}`);
    }

    const frame = page.locator("#course-compiler");
    if (!lesson.browserRuntime) {
        assert.equal(await frame.count(), 0, `${url}: local-only lesson must not load a browser compiler`);
        return;
    }
    assert.equal(await frame.getAttribute("data-course"), lesson.course.id, url.href);
    assert.equal(await frame.getAttribute("data-lesson"), String(lesson.number), url.href);
    const compilerSource = await frame.getAttribute("data-src") ?? await frame.getAttribute("src");
    assert.ok(compilerSource, `Missing compiler URL on ${url}`);
    const compilerUrl = new URL(compilerSource, url);
    assert.equal(compilerUrl.origin, site.origin, `Compiler must share its origin with ${url}`);
    assert.equal(compilerUrl.pathname, new URL(`browser-compiler-net${lesson.browserRuntime}/`, site).pathname);
    verifyLocalFile(compilerUrl, url);

    const task = lesson.taskId;
    assert.equal(await page.locator(`#solution-${task}`).count(), 1, `Missing starter for ${task}`);
    assert.equal(await page.locator("#page-editor-run").count(), 1, `Missing Run button for ${task}`);

    const exampleIds = await page.locator(".snippet-actions button[data-example-id]")
        .evaluateAll(buttons => buttons.map(button => button.dataset.exampleId));
    const runnable = await page.evaluate(ids => ids.map(id => {
        const block = document.querySelector(`pre#snippet-${id}, #snippet-${id} pre`);
        const adapter = window.DotnetLessonSnippets;
        return adapter?.snippetIds?.includes(id) ? adapter.makeRunnable(block.textContent, id) : block.textContent;
    }), lesson.examples.map(example => example.id));
    assert.deepEqual(runnable.map(normalize), prepareLesson(lesson).examples.map(example => normalize(example.code)),
        `${task}: browser and native example code diverged`);
    assert.deepEqual(exampleIds.sort(), lesson.examples.map(example => example.id).sort(), `${task}: runnable example buttons`);
    assert.equal(await frame.getAttribute("data-start-snippet"), lesson.startSnippet, `${task}: invalid starting example`);
}

async function verifyCourse(page, course) {
    const courseUrl = new URL(`courses/${course.id}/`, site);
    const quiz = new URL("quiz/", courseUrl);
    const lessonDirectory = join(siteDirectory, "courses", course.id, "lessons");
    const slugs = readdirSync(lessonDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    const courseLessons = lessons.filter(lesson => lesson.course.id === course.id);
    assert.deepEqual(slugs.sort(), courseLessons.map(lesson => lesson.slug).sort(), `Unexpected built lessons for ${course.id}`);
    assert.ok(slugs.length, `No built lessons for ${course.id}`);
    const numbers = courseLessons.map(lesson => lesson.number);
    assert.equal(new Set(numbers).size, numbers.length, `Duplicate lesson number in ${course.id}`);

    await visit(page, courseUrl);
    const cardLinks = await page.locator("a.lesson-card").evaluateAll(cards => cards.map(card => card.href));
    assert.deepEqual(cardLinks.sort(), courseLessons.map(lesson => new URL(lesson.route, site).href).sort(), course.id);

    await visit(page, quiz);
    const quizRoot = page.locator("#quiz-root");
    assert.equal(await quizRoot.getAttribute("data-course"), course.id);
    const quizNumbers = (await quizRoot.getAttribute("data-lesson-numbers")).split(",").map(Number);
    assert.deepEqual(quizNumbers.sort(), [...numbers].sort(), `Missing lessons in the quiz for ${course.id}`);
    const bank = JSON.parse(await page.locator("#question-bank").textContent());
    const questionIds = new Set();
    for (const question of bank) {
        assert.match(question.id, /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/, `Invalid question ID in ${course.id}`);
        assert.ok(!questionIds.has(question.id), `Duplicate question ${question.id} in ${course.id}`);
        questionIds.add(question.id);
        assert.ok(numbers.includes(question.lesson_number), `Unpublished lesson for question ${question.id}`);
        assert.ok(question.prompt?.trim(), `Missing prompt for question ${question.id}`);
    }
    assert.deepEqual([...new Set(bank.map(question => question.lesson_number))].sort(), [...numbers].sort());

    for (const lesson of courseLessons) await verifyLesson(page, lesson, quiz);
}

async function verify() {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ serviceWorkers: "block" });
        // The page contract only needs generated markup and its lesson adapter.
        await page.route("**/browser-compiler-net*/**", route => route.abort());
        await visit(page, site);
        for (const path of ["about/", "copyright/"]) await visit(page, new URL(path, site));
        for (const course of courses) await verifyCourse(page, course);
        console.log("Built site: checked internal links, quiz banks and the contract for every lesson");
    } finally {
        await browser.close();
    }
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
