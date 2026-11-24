const assert = require("node:assert/strict");
const {readFile} = require("node:fs/promises");
const {chromium} = require("playwright");

const site = new URL(process.argv[2] || "http://127.0.0.1:4173/dotnet-courses/");
const course = "csharp-dotnet-9-11";
const quizUrl = (courseId, query = "") => new URL("courses/" + courseId + "/quiz/" + query, site).href;
const fields = page => page.locator("#quiz-root textarea");
const lessonStatus = page => page.locator("#quiz-lesson-progress [role=status]");
const question = (page, id) => page.locator(".question", {has: page.locator("textarea[id=" + JSON.stringify(id) + "]")});
const ids = page => fields(page).evaluateAll(elements => elements.map(element => element.id));

async function openQuiz(page, courseId, query) {
    await page.goto(quizUrl(courseId, query));
    await fields(page).first().waitFor();
}

async function submitAnswer(page, id, answer) {
    const card = question(page, id);
    await card.getByRole("textbox").fill(answer);
    await card.getByRole("button", {name: "Верно", exact: true}).click();
}

async function openBackup(page) {
    await page.locator(".quiz-backup > summary").click();
}

async function exportProgress(page) {
    const downloadEvent = page.waitForEvent("download");
    await page.locator("#quiz-export-progress").click();
    const download = await downloadEvent;
    return JSON.parse(await readFile(await download.path(), "utf8"));
}

async function importProgress(page, data, expectedFeedback, accept = true) {
    if (accept) page.once("dialog", dialog => dialog.accept());
    await page.locator("#quiz-import-file").setInputFiles({
        name: "progress.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data))
    });
    await page.locator("#quiz-backup-feedback").filter({hasText:expectedFeedback}).waitFor();
}

async function verifyLessonQuiz(browser) {
    const context = await browser.newContext();
    try {
        const first = await context.newPage();
        await openQuiz(first, course, "?through=1");
        const selection = await ids(first);
        assert.equal(selection.length, 5);
        assert.equal(await first.locator("#quiz-next").isVisible(), false);

        const second = await context.newPage();
        await openQuiz(second, course, "?through=1");
        assert.deepEqual(await ids(second), selection, "Both tabs resume the same question order");
        await submitAnswer(first, selection[0], "Ответ из первой вкладки");
        await submitAnswer(second, selection[1], "Ответ из второй вкладки");

        await first.reload();
        await fields(first).first().waitFor();
        assert.deepEqual(await ids(first), selection, "Reload keeps the lesson selection");
        assert.match(await lessonStatus(first).textContent(), /С самооценкой: 2 из 5/);
        assert.equal(await fields(first).nth(0).inputValue(), "Ответ из первой вкладки");
        assert.equal(await fields(first).nth(1).inputValue(), "Ответ из второй вкладки");

        await first.locator("#quiz-show-all").click();
        assert.ok(await fields(first).count() > selection.length);
        assert.ok(await first.locator(".question-meta").evaluateAll(items =>
            items.every(item => item.textContent.includes("Урок №1"))),
            "The all-questions view of lesson one stays restricted to that lesson");
        await first.locator("#quiz-show-all").click();
        assert.deepEqual(await ids(first), selection);
        assert.match(await lessonStatus(first).textContent(), /С самооценкой: 2 из 5/);

        const revised = question(first, selection[0]);
        await revised.getByRole("textbox").fill("Уточнённый ответ");
        assert.match(await lessonStatus(first).textContent(), /С самооценкой: 1 из 5/);
        await revised.getByRole("button", {name:"Верно", exact:true}).click();
        assert.match(await lessonStatus(first).textContent(), /С самооценкой: 2 из 5/);

        for (const id of selection.slice(2)) await submitAnswer(first, id, "Тестовый ответ");
        assert.match(await lessonStatus(first).textContent(), /Квиз урока №1 пройден/);
        await openBackup(first);
        const backup = await exportProgress(first);
        assert.deepEqual(backup.completedLessons, [1]);
        assert.equal(Object.keys(backup.progress).length, 5, "Both tabs kept every FSRS record");
        assert.equal(backup.drafts[selection[0].slice(2)], "Уточнённый ответ");
        assert.equal(backup.drafts[selection[1].slice(2)], "Ответ из второй вкладки");
        assert.equal(backup.progress[selection[0].slice(2)].history.length, 1,
            "Reassessing a revised answer in the same selection keeps the FSRS schedule");
        return backup;
    } finally {
        await context.close();
    }
}

async function verifyImport(browser, backup) {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        await openQuiz(page, "memory");
        assert.equal(await page.locator("#quiz-next").isVisible(), true);
        assert.equal(await page.locator("#quiz-lesson-progress").isVisible(), false);
        await openBackup(page);
        await importProgress(page, backup, "Ошибка импорта: Это не файл прогресса данного курса.", false);

        await openQuiz(page, course, "?through=1");
        await page.evaluate(({id, answer, courseId}) => {
            localStorage.setItem("dotnet-courses:quiz-drafts:v1:" + courseId, JSON.stringify({[id]:answer}));
        }, {id:Object.keys(backup.drafts)[0], answer:"Черновик из прошлой версии", courseId:course});
        await page.reload();
        await fields(page).first().waitFor();
        await page.locator("#quiz-show-all").click();
        assert.equal(await question(page, "a-" + Object.keys(backup.drafts)[0]).getByRole("textbox").inputValue(),
            "Черновик из прошлой версии");
        await page.locator("#quiz-show-all").click();
        await openBackup(page);
        await importProgress(page, {...backup, format:"dotnet-courses-fsrs-v1", completedLessons:undefined}, "Копия импортирована.");
        assert.doesNotMatch(await lessonStatus(page).textContent(), /Квиз урока №1 пройден/);
        await importProgress(page, backup, "Копия импортирована.");
        assert.match(await lessonStatus(page).textContent(), /Квиз урока №1 пройден/);
        await page.locator("#quiz-show-all").click();
        for (const [id, draft] of Object.entries(backup.drafts)) {
            assert.equal(await question(page, "a-" + id).getByRole("textbox").inputValue(), draft);
        }
    } finally {
        await context.close();
    }
}

async function verifyEmptyQuiz(browser) {
    const context = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    try {
        const page = await context.newPage();
        await openQuiz(page, "memory");
        const heading = await page.locator("#quiz-root h2").first().boundingBox();
        assert.ok(heading && heading.y < 844, "The first question is visible on initial mobile view");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390,
            "The quiz wraps without horizontal scrolling on mobile");
        do {
            for (const id of await ids(page)) await submitAnswer(page, id, "Тестовый ответ");
            await page.locator("#quiz-next").click();
        } while (await fields(page).count());
        assert.equal(await page.locator("#quiz-actions").isVisible(), false);
        await openBackup(page);
        const file = await exportProgress(page);
        assert.ok(Object.keys(file.progress).length > 0);
        assert.match(await page.locator("#quiz-backup-feedback").textContent(), /Копия скачана/);
        await importProgress(page, {}, "Ошибка импорта: Это не файл прогресса данного курса.", false);
    } finally {
        await context.close();
    }
}

async function verify() {
    const browser = await chromium.launch();
    try {
        const backup = await verifyLessonQuiz(browser);
        await verifyImport(browser, backup);
        await verifyEmptyQuiz(browser);
        console.log("Quiz: tab isolation, lesson reload, course filtering, legacy import, progress backup and empty state verified");
    } finally {
        await browser.close();
    }
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
