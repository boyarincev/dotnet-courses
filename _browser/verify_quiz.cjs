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

const importPreview = page => page.locator("#quiz-import-preview");
const applyImport = page => importPreview(page).getByRole("button", {name:"Импортировать", exact:true}).click();

async function chooseBackup(page, data) {
    await page.locator("#quiz-import-file").setInputFiles({
        name: "progress.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data))
    });
}

async function importProgress(page, data, expectedFeedback, accept = true) {
    await chooseBackup(page, data);
    if (accept) await applyImport(page);
    await page.locator("#quiz-backup-feedback").filter({hasText:expectedFeedback}).waitFor();
}

const lessonKey = (kind, courseId, number = 1) =>
    "dotnet-courses:" + kind + ":" + courseId + ":" + number;
const practice = {
    editorDrafts: {1:"// Черновик Program.cs"},
    taskDrafts: {1:"// Черновик метода"},
    verifiedSolutions: {1:"// Последнее успешное решение"},
    completedLessons: [1]
};
const draftEditor = lessonKey("compiler-draft", course);
const draftTask = lessonKey("practice-draft", course);
const verified = lessonKey("practice-verified", course);
const completedLesson = lessonKey("progress:lesson", course);
const otherCourse = lessonKey("compiler-draft", "memory");
const lessonState = {
    [draftEditor]: practice.editorDrafts[1],
    [draftTask]: practice.taskDrafts[1],
    [verified]: practice.verifiedSolutions[1],
    [completedLesson]: "1"
};

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
        await first.evaluate(items => {
            for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
        }, {...lessonState, [otherCourse]:"// Другой курс", [lessonKey("practice-draft", course, 999)]:"// Неопубликованный урок"});
        await openBackup(first);
        const backup = await exportProgress(first);
        assert.equal(backup.format, "dotnet-courses-course-v1");
        assert.deepEqual(backup.practice, practice, "Include only practice keys from this course and published lessons");
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
        await importProgress(page, {...backup, format:"dotnet-courses-fsrs-v2", practice:undefined}, "Копия импортирована.");
        assert.match(await lessonStatus(page).textContent(), /Квиз урока №1 пройден/);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), draftEditor), null,
            "Legacy copies have no lesson data");

        const otherLesson = lessonKey("compiler-draft", course, 2);
        await page.evaluate(keys => {
            for (const key of keys) localStorage.setItem(key,"// Существующий код");
        }, [draftEditor, otherLesson, otherCourse]);

        await importProgress(page, {...backup, practice:{...practice, editorDrafts:{999:"// Источник неизвестного урока"}}},
            "Ошибка импорта: Некорректные данные", false);
        await chooseBackup(page, backup);
        const preview = importPreview(page);
        await preview.waitFor();
        assert.match(await preview.textContent(), /Файлы Program.cs · добавить 0, заменить 1/);
        assert.match(await preview.textContent(), /Черновики заданий · добавить 1, заменить 0/);
        await preview.getByText("Какие записи изменятся").click();
        assert.match(await preview.locator("#quiz-import-records").textContent(), /Файлы Program.cs\. Заменятся урок №1/);
        await preview.getByRole("button", {name:"Отмена", exact:true}).click();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), draftEditor), "// Существующий код");

        await chooseBackup(page, backup);
        await preview.waitFor();
        await page.evaluate(key => {
            const setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (entry, value) {
                if (entry === key) throw new DOMException("Fixture storage failure", "QuotaExceededError");
                return setItem.call(this, entry, value);
            };
            window.restoreSetItem = () => { Storage.prototype.setItem = setItem; };
        }, verified);
        await applyImport(page);
        await page.locator("#quiz-backup-feedback").filter({hasText:"Прежние данные сохранены"}).waitFor();
        assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [draftEditor, draftTask, verified, completedLesson]),
            ["// Существующий код", null, null, null], "Rollback restores the previous value and removes additions");
        await page.evaluate(() => window.restoreSetItem());

        await chooseBackup(page, backup);
        await preview.waitFor();
        await page.evaluate(key => localStorage.setItem(key, "// Изменение из соседней вкладки"), draftEditor);
        await applyImport(page);
        await preview.waitFor();
        await preview.getByRole("status").filter({hasText:"Данные в браузере изменились"}).waitFor();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), draftEditor), "// Изменение из соседней вкладки");
        await applyImport(page);
        await page.locator("#quiz-backup-feedback").filter({hasText:"Копия импортирована."}).waitFor();
        assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), Object.keys(lessonState)),
            Object.values(lessonState), "The backup restores all lesson storage keys");
        assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [otherLesson, otherCourse]),
            ["// Существующий код", "// Существующий код"], "The merge preserves unrelated lessons and other courses");

        await page.locator("#quiz-show-all").click();
        for (const [id, draft] of Object.entries(backup.drafts)) {
            assert.equal(await question(page, "a-" + id).getByRole("textbox").inputValue(), draft);
        }
        console.log("Course backup: course isolation, legacy copies, preview, cancel, rollback, concurrent edits and lesson drafts verified");
    } finally {
        await context.close();
    }
}

async function verifyReviewToday(browser) {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        const other = await context.newPage();
        const summary = other.locator("[data-course-review-status]");
        const startReview = other.getByRole("link", {name: "Повторить сегодня"});
        const count = other.locator("#quiz-count");
        const zero = "На сегодня повторений нет";

        for (const [courseId, scheduled] of [[course, 6], ["memory", 2]]) {
            const courseUrl = new URL("courses/" + courseId + "/", site).href;
            await other.goto(courseUrl);
            await summary.filter({hasText:zero}).waitFor();
            assert.equal(await startReview.isVisible(), false, "Fresh course must have no scheduled reviews");

            await openQuiz(page, courseId);
            const expected = await page.evaluate(async ({courseId, scheduled}) => {
                const engine = await window.DotnetQuizSRSReady;
                const bank = JSON.parse(document.getElementById("question-bank").textContent);
                const now = new Date();
                const past = new Date(+now - 7 * 86_400_000);
                const eligible = engine.eligible(bank, now, null);
                const due = eligible.slice(0, scheduled).map(question => question.id);
                const later = eligible[scheduled].id;
                const records = Object.fromEntries(due.map(id => [id, engine.evaluate(null, id, "correct", "Ответ", past)]));
                records[later] = engine.evaluate(null, later, "easy", "Ответ", now);
                localStorage.setItem("dotnet-courses:fsrs-7:v1:" + courseId, JSON.stringify(records));
                return due.map(id => "a-" + id);
            }, {courseId, scheduled});
            await summary.filter({hasText:"Вопросов к повторению: " + scheduled}).waitFor();
            await startReview.click();
            await count.filter({hasText:"Осталось повторить: " + scheduled}).waitFor();
            assert.equal(new URL(other.url()).searchParams.get("review"), "today");
            assert.equal(await other.locator("#quiz-show-all").isVisible(), false);
            assert.equal(await other.locator("#quiz-lesson-progress").isVisible(), false);
            await page.goto(courseUrl);
            const remainingIds = new Set(expected);

            while (remainingIds.size) {
                const batch = await ids(other);
                assert.equal(batch.length, Math.min(5, remainingIds.size), "Review uses short batches");
                for (const id of batch) {
                    assert.ok(remainingIds.delete(id), "Review excludes new, later and already answered questions");
                    await submitAnswer(other, id, "Повторение");
                    const remaining = remainingIds.size;
                    await count.filter({hasText:remaining ? "Осталось повторить: " + remaining : zero}).waitFor();
                    await page.locator("[data-course-review-status]")
                        .filter({hasText:remaining ? "Вопросов к повторению: " + remaining : zero}).waitFor();
                }
                if (remainingIds.size) await other.locator("#quiz-next").click();
            }
            assert.equal(await other.locator("#quiz-next").isDisabled(), true);
            await other.reload();
            await count.filter({hasText:zero}).waitFor();
            assert.equal(await fields(other).count(), 0);
        }
        console.log("Review today: both courses, scheduled cards only, short batches and live remaining count verified");
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
        await verifyReviewToday(browser);
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
