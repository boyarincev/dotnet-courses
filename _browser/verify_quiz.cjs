"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { chromium } = require("playwright");

const site = new URL(process.argv[2] || "http://127.0.0.1:4173/dotnet-courses/");
const mainCourse = "csharp-dotnet-9-11";
const memoryCourse = "memory";
const now = new Date("2030-01-01T12:00:00Z");
const hour = 60 * 60 * 1000;
const courseUrl = course => new URL("courses/" + course + "/", site).href;
const quizUrl = (course, query = "") => new URL("quiz/" + query, courseUrl(course)).href;
const quizCount = page => page.locator("#quiz-count");
const quizResult = page => page.locator("#quiz-result");
const questions = page => page.locator(".question[data-question-id]");
const question = (page, id) => questions(page).and(page.locator("[data-question-id=" + JSON.stringify(id) + "]"));
const questionIds = page => questions(page).evaluateAll(rows => rows.map(row => row.dataset.questionId));
const skip = page => page.getByRole("button", { name: "Пропустить", exact: true });
const grade = (row, name = "Легко") => row.getByRole("button", { name, exact: true });
const courseReview = page => page.locator("[data-course-review]");
const reviewStatus = page => courseReview(page).locator("[data-course-review-status]");
const reviewLink = page => courseReview(page).getByRole("link", { name: "Повторить сегодня" });
const practiceKey = (kind, course, lesson = 1) => "dotnet-courses:" + kind + ":" + course + ":" + lesson;
const lessonBadge = (page, lesson) => page.locator('.lesson-card [data-lesson-completion-badge][data-lesson="' + lesson + '"]');

async function assertBadge(badge, completed) {
    assert.ok(await badge.isVisible(), "The lesson badge must be shown in both states");
    assert.equal(await badge.textContent(), completed ? "Пройден" : "Не пройден");
    assert.equal((await badge.getAttribute("data-completed")) !== null, completed);
}

async function openQuiz(page, course, query = "") {
    await page.goto(quizUrl(course, query));
    await page.waitForFunction(() => Boolean(document.getElementById("quiz-count")?.textContent ||
        document.querySelector("#quiz-root > .notice")));
    await page.getByText("Правильность ответа определяешь ты.", { exact: false }).waitFor();
    assert.equal(await page.locator("#quiz-self-assessment + #quiz-root").count(), 1);
}

async function getBank(page) {
    await page.waitForFunction(() => Boolean(window.DotnetQuizSRSReady));
    return page.evaluate(async () => {
        const engine = await window.DotnetQuizSRSReady;
        const bank = JSON.parse(document.getElementById("question-bank").textContent);
        const published = document.getElementById("quiz-root").dataset.lessonNumbers.split(",").map(Number);
        return engine.eligible(bank, new Date()).filter(row => published.includes(Number(row.lesson_number)));
    });
}

async function markPractice(page, course, ...lessons) {
    await page.evaluate(({ course, lessons }) => {
        for (const lesson of lessons) window.DotnetLearning.progress.mark("lesson", course, lesson);
    }, { course, lessons });
    await page.waitForFunction(async ({ course, lessons }) => {
        const engine = await window.DotnetQuizSRSReady;
        const bank = JSON.parse(document.getElementById("question-bank").textContent);
        const storage = window.DotnetQuizStorage.forCourse(course);
        return engine.eligible(bank, new Date()).filter(row => lessons.includes(Number(row.lesson_number)))
            .every(row => storage.record(row.id)?.card);
    }, { course, lessons });
}

async function submitAnswer(page, id, answer, rating = "Легко") {
    const row = question(page, id);
    await row.getByRole("textbox").fill(answer);
    await grade(row, rating).click();
}

async function currentQuestion(page) {
    const row = questions(page).first();
    await row.waitFor();
    assert.equal(await questions(page).count(), 1, "Show one question at a time");
    return row.getAttribute("data-question-id");
}

async function assertQuestionLessonLink(row, lesson, lessonUrl) {
    const link = row.locator(".question-meta").getByRole("link", { name: "Урок №" + lesson, exact: true });
    await link.waitFor();
    const { href, target } = await link.evaluate(anchor => ({ href: anchor.href, target: anchor.target }));
    assert.equal(href, lessonUrl, "The question must link to its published lesson in the same course");
    assert.ok(!target || target === "_self", "The lesson link must use the current tab");
}

async function assertEmptyAnswer(page, row) {
    const input = row.getByRole("textbox");
    assert.equal(await input.inputValue(), "");
    await input.fill(" \n ");
    const buttons = row.getByRole("button", { name: /^(Неверно|Частично|Верно|Легко)$/ });
    assert.equal(await buttons.count(), 4);
    assert.ok(await buttons.evaluateAll(elements => elements.every(button => button.disabled)),
        "Whitespace cannot enable any grade");
    await row.getByText("Сначала введи ответ", { exact: true }).waitFor();
    const explanation = page.locator("#quiz-self-assessment");
    await explanation.waitFor();
    await input.fill("Ответ для проверки интерфейса");
    await explanation.waitFor();
    await input.fill("");
}

async function readRecord(page, course, id) {
    return page.evaluate(({ course, id }) => window.DotnetQuizStorage.forCourse(course).record(id),
        { course, id });
}

async function failStorageWrite(page, key) {
    await page.evaluate(denied => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (entry, value) {
            if (entry === denied) throw new DOMException("Test storage failure", "QuotaExceededError");
            return setItem.call(this, entry, value);
        };
        window.restoreTestSetItem = () => { Storage.prototype.setItem = setItem; };
    }, key);
}

async function download(page, selector) {
    const nextDownload = page.waitForEvent("download");
    await page.locator(selector).click();
    return readFile(await (await nextDownload).path(), "utf8");
}

async function publishTestQuestions(page, pages, ...additions) {
    const paths = new Set(pages.map(url => new URL(url).pathname));
    await page.route(url => paths.has(url.pathname), async route => {
        const upstream = await route.fetch();
        const original = await upstream.text();
        const document = original.replace(
            /(<script[^>]+id="question-bank"[^>]*>)([\s\S]*?)(<\/script>)/,
            (_, opening, payload, closing) => opening + JSON.stringify([...JSON.parse(payload), ...additions]) + closing);
        assert.notEqual(document, original, "The lesson fixture must add a question");
        const headers = upstream.headers();
        delete headers["content-length"];
        delete headers["content-encoding"];
        await route.fulfill({ status: upstream.status(), headers, body: document });
    });
}

async function verifyLessonQuiz(browser, course, lesson) {
    const pageContext = await browser.newContext({ serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
    try {
        const page = await pageContext.newPage();
        await page.clock.setFixedTime(now);
        await page.goto(courseUrl(course));
        const courseLessons = await page.locator(".lesson-card").evaluateAll(links => links.map(link => ({
            number: Number(link.querySelector("[data-lesson-completion-badge]").dataset.lesson),
            url: link.href,
        })));
        for (const item of courseLessons) await assertBadge(lessonBadge(page, item.number), false);
        const otherLesson = courseLessons.find(item => item.number > lesson)
            ?? courseLessons.find(item => item.number !== lesson);
        if (course === mainCourse) assert.ok(otherLesson, "Cover acceptance of a different lesson");
        const link = page.locator(".lesson-card").filter({
            has: page.locator("[data-lesson-completion-badge][data-lesson=" + JSON.stringify(String(lesson)) + "]"),
        });
        await link.click();
        const lessonUrl = page.url();
        const startQuiz = page.locator("[data-lesson-quiz-link]");
        assert.equal(await startQuiz.isVisible(), false);
        await reviewStatus(page).waitFor();
        await markPractice(page, course, lesson);
        await startQuiz.waitFor();
        assert.equal(await reviewLink(page).isVisible(), false,
            "New cards seeded after practice are not due immediately");
        await startQuiz.click();
        assert.equal(new URL(page.url()).searchParams.get("through"), String(lesson));

        const bank = await getBank(page);
        const expected = bank.filter(row => Number(row.lesson_number) === lesson);
        assert.ok(expected.length > 1);
        await quizCount(page).filter({ hasText: "Отвечено 0 из " + expected.length }).waitFor();
        assert.equal(await page.locator("#quiz-download").isVisible(), false);
        assert.equal(await page.getByRole("button", { name: "Начать заново" }).count(), 0);

        const first = await currentQuestion(page);
        await assertQuestionLessonLink(question(page, first), lesson, lessonUrl);
        await assertEmptyAnswer(page, question(page, first));
        await skip(page).click();
        const next = await currentQuestion(page);
        assert.notEqual(next, first, "Skipping puts the question behind the remaining queue");
        await page.locator("#quiz-self-assessment").waitFor();
        await quizCount(page).filter({ hasText: "Отвечено 0 из " + expected.length }).waitFor();
        const seeded = await readRecord(page, course, first);
        assert.deepEqual(seeded.history, []);
        assert.equal(seeded.card.dueAt, new Date(+now + 8 * hour).toISOString());

        const answerFor = id => "Тестовый ответ " + id;
        await submitAnswer(page, next, answerFor(next));
        await quizCount(page).filter({ hasText: "Отвечено 1 из " + expected.length }).waitFor();
        const unsubmitted = await currentQuestion(page);
        await question(page, unsubmitted).getByRole("textbox").fill("Этот ответ не оценён");
        await page.reload();
        await quizCount(page).filter({ hasText: "Отвечено 1 из " + expected.length }).waitFor();
        assert.equal(await question(page, next).count(), 0, "Graded question stays out of the lesson queue");

        const pending = new Set(expected.map(row => row.id));
        assert.ok(pending.delete(next));
        while (pending.size) {
            const id = await currentQuestion(page);
            assert.ok(pending.delete(id), id + " must be a remaining question of the selected lesson");
            assert.equal(await question(page, id).getByRole("textbox").inputValue(), "");
            if (pending.size === 0) assert.equal(await skip(page).isVisible(), false);
            await submitAnswer(page, id, answerFor(id));
        }

        await quizResult(page).waitFor();
        if (bank.some(row => Number(row.lesson_number) > lesson)) {
            await quizResult(page).getByRole("link", { name: "Следующий урок" }).waitFor();
        } else {
            await quizResult(page).getByRole("link", { name: "К списку уроков" }).waitFor();
        }
        const report = await download(page, "#quiz-download");
        for (const row of expected) {
            assert.ok(report.includes(row.id) && report.includes(row.prompt) && report.includes(answerFor(row.id)),
                "The lesson report contains the full question and graded answer for " + row.id);
        }
        for (const row of bank.filter(row => Number(row.lesson_number) !== lesson)) {
            assert.ok(!report.includes(row.id), "Lesson report excludes other lessons");
        }
        await page.locator("#quiz-copy").click();
        await page.locator("#quiz-feedback").filter({ hasText: "Ответы скопированы." }).waitFor();
        assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Тестовый ответ/);

        await page.reload();
        await quizResult(page).waitFor();
        assert.equal(await questions(page).count(), 0);
        await openQuiz(page, course, "?filter=" + lesson);
        await assertQuestionLessonLink(question(page, next), lesson, lessonUrl);
        const revisedAnswer = "Обновлённый ответ " + next;
        await submitAnswer(page, next, revisedAnswer);
        await openQuiz(page, course, "?through=" + lesson);
        await quizResult(page).waitFor();

        const added = { ...expected[0], id: "BROWSER-SMOKE-NEW", prompt: "Вопрос, добавленный после прохождения" };
        const previousRecord = await readRecord(page, course, next);
        const acceptanceLesson = otherLesson ?? { number: lesson, url: lessonUrl };
        await publishTestQuestions(page, [lessonUrl, acceptanceLesson.url, quizUrl(course)], added);
        await page.goto(lessonUrl);
        await reviewStatus(page).waitFor();
        assert.equal(await readRecord(page, course, added.id) ?? null, null,
            "Publishing a new question does not seed a card just by viewing an already passed lesson");
        const acceptanceTime = new Date(+now + hour);
        await page.clock.setFixedTime(acceptanceTime);
        await page.goto(acceptanceLesson.url);
        await markPractice(page, course, acceptanceLesson.number);
        const addedRecord = await readRecord(page, course, added.id);
        assert.deepEqual(addedRecord.history, []);
        assert.equal(addedRecord.card.dueAt, new Date(+acceptanceTime + 8 * hour).toISOString());
        assert.deepEqual(await readRecord(page, course, next), previousRecord,
            "Seeding after another accepted solution leaves existing cards unchanged");
        await page.goto(lessonUrl);
        await page.clock.setFixedTime(new Date(+acceptanceTime + hour));
        await markPractice(page, course, lesson);
        assert.deepEqual(await readRecord(page, course, added.id), addedRecord,
            "Repeated acceptance does not reset the new card's due date");
        await startQuiz.click();
        assert.equal(await currentQuestion(page), added.id);
        assert.equal(await quizResult(page).isVisible(), false);
        assert.equal(await skip(page).isVisible(), false);
        await quizCount(page).filter({ hasText: "Отвечено " + expected.length + " из " + (expected.length + 1) }).waitFor();
        await submitAnswer(page, added.id, answerFor(added.id));
        await quizResult(page).waitFor();
        const updatedReport = await download(page, "#quiz-download");
        assert.ok(updatedReport.includes(answerFor(added.id)) && updatedReport.includes(revisedAnswer) &&
            !updatedReport.includes(answerFor(next)), "Export uses the latest graded answer for every question");

        await page.goto(courseUrl(course));
        await page.locator(".quiz-backup > summary").click();
        const backup = JSON.parse(await download(page, "#quiz-export-progress"));
        assert.equal(backup.format, "dotnet-courses-course-v2");
        assert.equal(backup.course, course);
        assert.equal(Object.hasOwn(backup, "drafts"), false);
        assert.equal(Object.hasOwn(backup, "completedLessons"), false);
        assert.ok(backup.practice.completedLessons.includes(lesson));
        return backup;
    } finally {
        await pageContext.close();
    }
}

async function verifyReviewToday(browser, course) {
    const pageContext = await browser.newContext({ serviceWorkers: "block" });
    try {
        const page = await pageContext.newPage();
        await page.clock.setFixedTime(now);
        await page.goto(courseUrl(course));
        await reviewStatus(page).waitFor();
        assert.equal(await reviewLink(page).isVisible(), false);

        const fixture = await page.evaluate(async ({ course, hour }) => {
            const engine = await window.DotnetQuizSRSReady;
            const bank = JSON.parse(document.getElementById("question-bank").textContent);
            const today = new Date();
            const published = document.querySelector("[data-course-review]").dataset.lessonNumbers.split(",").map(Number);
            const nearby = engine.eligible(bank, today).filter(question => published.includes(Number(question.lesson_number)))
                .slice(0, 5).map(question => question.id);
            const [due, dueNow, dueSoon, dueLater, unseen] = nearby;
            const offsets = [-hour, 0, 5 * 60 * 1000, hour];
            const past = new Date(+today - 7 * 24 * hour);
            const records = Object.fromEntries(nearby.slice(0, 4).map((id, index) => {
                const row = engine.evaluate(null, id, "correct", "Предыдущий ответ", past);
                row.card.dueAt = new Date(+today + offsets[index]);
                return [id, row];
            }));
            localStorage.setItem(...window.DotnetQuizStorage.forCourse(course).prepareHistoryWrite(records));
            return { due, dueNow, dueSoon, dueLater, unseen };
        }, { course, hour });

        await page.reload();
        await reviewStatus(page).filter({ hasText: "Вопросов к повторению: 2" }).waitFor();
        await reviewLink(page).waitFor();
        await reviewLink(page).click();
        assert.equal(new URL(page.url()).searchParams.get("review"), "today");
        assert.equal(await page.locator("#quiz-download").isVisible(), false);
        const initial = await currentQuestion(page);
        const eligible = [fixture.due, fixture.dueNow];
        assert.ok(eligible.includes(initial));
        const oldRecord = await readRecord(page, course, initial);
        await assertEmptyAnswer(page, question(page, initial));
        await question(page, initial).locator(".question-answer-history summary").click();
        await question(page, initial).getByText("Предыдущий ответ").waitFor();
        await skip(page).click();
        const skippedTo = await currentQuestion(page);
        assert.notEqual(skippedTo, initial);
        assert.deepEqual(await readRecord(page, course, initial), oldRecord,
            "Skipping does not create an attempt or move the due date");
        await question(page, skippedTo).getByRole("textbox").fill("Ответ ещё не оценён");
        await page.reload();
        await quizCount(page).filter({ hasText: "Осталось повторить: 2" }).waitFor();

        const pending = new Set(eligible);
        const firstRated = await currentQuestion(page);
        assert.ok(pending.delete(firstRated));
        assert.equal(await question(page, firstRated).getByRole("textbox").inputValue(), "");
        await page.clock.setFixedTime(new Date(+now + 10 * 60 * 1000));
        await submitAnswer(page, firstRated, "Ежедневный ответ " + firstRated);
        pending.add(fixture.dueSoon);
        while (pending.size) {
            const id = await currentQuestion(page);
            assert.ok(pending.delete(id), id + " must be due");
            if (pending.size === 0) assert.equal(await skip(page).isVisible(), false);
            await submitAnswer(page, id, "Ежедневный ответ " + id);
        }
        const empty = page.getByText("На сегодня больше вопросов нет", { exact: true }).first();
        await empty.waitFor();
        assert.equal(await questions(page).count(), 0);
        assert.equal(await readRecord(page, course, fixture.unseen) ?? null, null);
        assert.equal((await readRecord(page, course, fixture.dueLater)).history.length, 1);
        for (const id of [...eligible, fixture.dueSoon]) {
            const record = await readRecord(page, course, id);
            assert.equal(record.history.at(-1).answer, "Ежедневный ответ " + id);
            assert.ok(new Date(record.card.dueAt) > new Date(+now + 10 * 60 * 1000),
                "A scheduled daily review increments history and sets a new due date");
        }
        await page.reload();
        await empty.waitFor();
    } finally {
        await pageContext.close();
    }
}

async function verifyQuestionBank(browser) {
    const pageContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
        const page = await pageContext.newPage();
        await page.clock.setFixedTime(now);
        await openQuiz(page, mainCourse);
        const filter = page.locator("#quiz-filter");
        await filter.waitFor();
        const bank = await getBank(page);
        assert.equal(await filter.inputValue(), "all");
        assert.deepEqual((await questionIds(page)).sort(), bank.map(row => row.id).sort());
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390,
            "The quiz wraps without horizontal scrolling on mobile");
        await page.setViewportSize({ width: 320, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320,
            "Long code identifiers in question prompts wrap on a narrow screen");
        await page.setViewportSize({ width: 390, height: 844 });

        await page.goto(courseUrl(mainCourse));
        await markPractice(page, mainCourse, 1, 3);
        await assertBadge(lessonBadge(page, 1), true);
        const gap = lessonBadge(page, 2);
        await assertBadge(gap, false);
        await assertBadge(lessonBadge(page, 3), true);
        const resume = page.locator("[data-course-start]");
        assert.equal(await resume.textContent(), "Продолжить с урока 2");
        assert.equal(await resume.getAttribute("href"), await gap.evaluate(badge => badge.closest("a").getAttribute("href")),
            "Resume must lead to the first incomplete lesson even after passing a later one");
        await openQuiz(page, mainCourse);
        await filter.waitFor();
        assert.equal(await filter.inputValue(), "completed");
        const completed = bank.filter(row => [1, 3].includes(Number(row.lesson_number)));
        assert.deepEqual((await questionIds(page)).sort(), completed.map(row => row.id).sort(),
            "The completed filter respects the gap between passed lessons");
        const seeded = question(page, completed[0].id);
        await seeded.locator("[data-question-due]").filter({ hasText: "Следующий ответ:" }).waitFor();
        await page.clock.setFixedTime(new Date(+now + 8 * hour));
        await page.reload();
        await seeded.locator("[data-question-due]").filter({ hasText: "Ждёт ответа" }).waitFor();
        await page.goto(courseUrl(mainCourse));
        await reviewStatus(page).filter({ hasText: "Вопросов к повторению: " + completed.length }).waitFor();
        await reviewLink(page).waitFor();
        await openQuiz(page, mainCourse);

        await filter.selectOption("2");
        await page.waitForURL(quizUrl(mainCourse, "?filter=2"));
        const ofLessonTwo = bank.filter(row => Number(row.lesson_number) === 2);
        const first = ofLessonTwo[0].id;
        const row = question(page, first);
        await row.waitFor();
        assert.deepEqual((await questionIds(page)).sort(), ofLessonTwo.map(item => item.id).sort());
        assert.match(await row.locator("[data-question-due]").textContent(), /Новый вопрос/);
        await assertEmptyAnswer(page, row);

        const failureKey = "dotnet-courses:quiz:v2:" + mainCourse + ":card:" + first;
        await failStorageWrite(page, failureKey);
        await submitAnswer(page, first, "Ответ сохранится после повторной попытки");
        await row.getByText("Не удалось сохранить ответ. Текст остался в поле.").waitFor();
        assert.equal(await row.getByRole("textbox").inputValue(), "Ответ сохранится после повторной попытки");
        assert.equal(await readRecord(page, mainCourse, first) ?? null, null);
        await page.evaluate(() => window.restoreTestSetItem());

        await submitAnswer(page, first, "Ответ в банке");
        await row.locator("[data-question-due]").filter({ hasText: "Следующий ответ:" }).waitFor();
        assert.equal(await row.getByRole("textbox").inputValue(), "");
        const before = await readRecord(page, mainCourse, first);
        assert.equal(before.history.length, 1);
        await page.clock.setFixedTime(new Date(+now + 8 * hour + 60 * 1000));
        await page.reload();
        await row.waitFor();
        assert.equal(await row.getByRole("textbox").inputValue(), "");
        await submitAnswer(page, first, "Уточнение раньше срока", "Верно");
        const after = await readRecord(page, mainCourse, first);
        assert.equal(after.history.length, 2);
        assert.equal(after.history.at(-1).answer, "Уточнение раньше срока");
        assert.equal(after.card.dueAt, before.card.dueAt, "Early bank rating preserves the FSRS due date");
        const extendedHistory = await page.evaluate(async ({ course, id }) => {
            const engine = await window.DotnetQuizSRSReady;
            const storage = window.DotnetQuizStorage.forCourse(course);
            for (let index = 1; index <= 6; index++) {
                storage.grade(engine, id, "partial", "Длинная строка из теста " + index + "\n" + "x".repeat(160), {
                    allowEarlyHistory: true,
                    now: new Date(Date.now() + index * 60_000),
                });
            }
            return storage.record(id).history.reverse();
        }, { course: mainCourse, id: first });
        await page.reload();
        await row.waitFor();
        assert.equal(await filter.inputValue(), "2");
        assert.equal(await row.getByRole("textbox").inputValue(), "");
        const history = row.locator(".question-answer-history");
        const entries = history.locator("li");
        const summary = history.locator("summary");
        assert.equal(await summary.textContent(), "История ответов (8)");
        assert.equal(await history.getAttribute("open"), null);
        assert.equal(await entries.count(), 0, "Collapsed history is not rendered");
        await summary.click();
        await entries.nth(4).waitFor();
        assert.deepEqual(await entries.locator("pre").allTextContents(), extendedHistory.slice(0, 5).map(row => row.answer));
        await history.getByRole("button", { name: "Показать ещё" }).click();
        assert.deepEqual(await entries.locator("pre").allTextContents(), extendedHistory.map(row => row.answer),
            "History shows the newest answer first and older answers after expansion");
        const dates = await page.evaluate(attempts => attempts.map(attempt =>
            new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(attempt.at))),
        extendedHistory);
        const ratings = ["Частично", "Частично", "Частично", "Частично", "Частично", "Частично", "Верно", "Легко"];
        assert.deepEqual(await entries.locator(".muted").allTextContents(),
            dates.map((date, index) => date + " · " + ratings[index]));
        assert.deepEqual(await entries.locator("time").evaluateAll(times => times.map(time => time.dateTime)),
            extendedHistory.map(attempt => attempt.at));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
        assert.equal(await page.locator("#quiz-download").isVisible(), false);
        await row.getByRole("textbox").fill("Неоцененный ответ");
        await page.reload();
        await row.waitFor();
        assert.equal(await row.getByRole("textbox").inputValue(), "");
        await filter.selectOption("all");
        await page.waitForURL(quizUrl(mainCourse, "?filter=all"));
        await question(page, first).waitFor();
        assert.deepEqual((await questionIds(page)).sort(), bank.map(item => item.id).sort());
        await openQuiz(page, mainCourse, "?through=2");
        const outstanding = await currentQuestion(page);
        assert.notEqual(outstanding, first, "An answer graded in the bank is counted on the lesson quiz");
        await quizCount(page).filter({ hasText: "Отвечено 1 из " + ofLessonTwo.length }).waitFor();
    } finally {
        await pageContext.close();
    }
}

async function openBackup(page, course) {
    await page.goto(courseUrl(course));
    await reviewStatus(page).waitFor();
    await page.locator(".quiz-backup > summary").click();
}

async function chooseBackup(page, data) {
    await page.locator("#quiz-import-file").setInputFiles({
        name: "progress.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
}

async function confirmAction(page, run, accept) {
    await Promise.all([
        page.waitForEvent("dialog").then(async dialog => {
            assert.equal(dialog.type(), "confirm");
            if (accept) await dialog.accept();
            else await dialog.dismiss();
        }),
        run(),
    ]);
}

async function verifyBackup(browser, backup) {
    const pageContext = await browser.newContext({ serviceWorkers: "block" });
    try {
        const page = await pageContext.newPage();
        await page.clock.setFixedTime(now);
        const feedback = page.locator("#quiz-backup-feedback");
        await openBackup(page, memoryCourse);
        await chooseBackup(page, backup);
        await feedback.filter({ hasText: "Это не файл прогресса данного курса." }).waitFor();
        const foreignHistory = await page.evaluate(async course => {
            const engine = await window.DotnetQuizSRSReady;
            const bank = JSON.parse(document.getElementById("question-bank").textContent);
            const id = engine.eligible(bank, new Date())[0].id;
            const storage = window.DotnetQuizStorage.forCourse(course);
            storage.grade(engine, id, "correct", "Ответ другого курса");
            return { id, record: storage.record(id) };
        }, memoryCourse);

        await openQuiz(page, mainCourse, "?filter=1");
        const [existingId, dueId] = await questionIds(page);
        await submitAnswer(page, existingId, "Другой вопрос в истории");
        const existingRecord = await readRecord(page, mainCourse, existingId);
        await page.evaluate(async ({ course, id, hour }) => {
            const engine = await window.DotnetQuizSRSReady;
            window.DotnetQuizStorage.forCourse(course).seed(engine, [id], new Date(Date.now() - 9 * hour));
        }, { course: mainCourse, id: dueId, hour });
        await openBackup(page, mainCourse);
        await chooseBackup(page, { ...backup, format: "dotnet-courses-course-v1" });
        await feedback.filter({ hasText: "Это не файл прогресса данного курса." }).waitFor();

        const addedLesson = await page.locator(".lesson-card").evaluateAll(lessons => lessons
            .map(link => ({ number: Number(link.querySelector("[data-lesson-completion-badge]").dataset.lesson), url: link.href }))
            .find(lesson => lesson.number > 2));
        assert.ok(addedLesson, "The current catalog contains a lesson added after the copy");
        const deletedQuestionId = "BROWSER-SMOKE-RETIRED";
        const deletedLesson = 100001;
        const { laterQuestions, deletedCard } = await page.evaluate(async ({ number, deletedId }) => {
            const engine = await window.DotnetQuizSRSReady;
            const bank = JSON.parse(document.getElementById("question-bank").textContent);
            const first = engine.evaluate(null, deletedId, "correct", "Ответ из старой копии", new Date());
            return {
                laterQuestions: bank.filter(question => Number(question.lesson_number) === number),
                deletedCard: engine.evaluate(first, deletedId, "correct", "Следующий ответ", new Date(),
                    { allowEarlyHistory: true }),
            };
        }, { number: addedLesson.number, deletedId: deletedQuestionId });
        assert.ok(laterQuestions.length, "The added lesson has questions");
        const addedQuestion = { ...laterQuestions[0], id: "BROWSER-SMOKE-BACKUP-NEW", prompt: "Вопрос из нового урока" };
        const orphanedQuestion = { ...laterQuestions[0], id: deletedQuestionId, lesson_number: deletedLesson };
        await publishTestQuestions(page, [courseUrl(mainCourse), quizUrl(mainCourse), addedLesson.url],
            addedQuestion, orphanedQuestion);
        await openBackup(page, mainCourse);
        const badge = lessonBadge(page, 2);
        await assertBadge(badge, false);

        const sourceDraft = practiceKey("compiler-draft", mainCourse, 2);
        const sourceMethod = practiceKey("practice-draft", mainCourse, 2);
        const sourceSolution = practiceKey("practice-verified", mainCourse, 2);
        const unrelatedDraft = practiceKey("compiler-draft", mainCourse, 1);
        const foreignDraft = practiceKey("compiler-draft", memoryCourse, 1);
        const readDrafts = () => page.evaluate(keys => keys.map(key => localStorage.getItem(key)),
            [sourceDraft, unrelatedDraft, foreignDraft]);
        const oldValues = ["Прежний код", "Другой урок", "Другой курс"];
        await page.evaluate(({ keys, values }) => {
            keys.forEach((key, index) => localStorage.setItem(key, values[index]));
        }, { keys: [sourceDraft, unrelatedDraft, foreignDraft], values: oldValues });
        const laterIds = new Set(laterQuestions.map(question => question.id));
        const imported = {
            ...backup,
            progress: {
                ...Object.fromEntries(Object.entries(backup.progress).filter(([id]) => !laterIds.has(id))),
                [deletedQuestionId]: deletedCard,
            },
            practice: {
                completedLessons: [2, deletedLesson],
                editorDrafts: { 2: "Новый код", [deletedLesson]: "Код удалённого урока" },
                taskDrafts: { 2: "Сохранённый метод", [deletedLesson]: "Метод удалённого урока" },
                verifiedSolutions: { 2: "Сохранённое решение", [deletedLesson]: "Решение удалённого урока" },
            },
        };
        await chooseBackup(page, {
            ...imported,
            practice: { ...imported.practice, editorDrafts: { [deletedLesson]: 42 } },
        });
        await feedback.filter({ hasText: "Некорректные данные" }).waitFor();
        assert.deepEqual(await readDrafts(), oldValues, "Even a retired record must have the expected field type");
        const importCourse = () => chooseBackup(page, imported);
        await confirmAction(page, importCourse, false);
        assert.deepEqual(await readDrafts(), oldValues, "Cancelling import retains the original browser data");
        const historyKey = await page.evaluate(course => window.DotnetQuizStorage.forCourse(course).importKey, mainCourse);
        await failStorageWrite(page, historyKey);
        await confirmAction(page, importCourse, true);
        await feedback.filter({ hasText: "Прежние данные сохранены." }).waitFor();
        assert.deepEqual(await readDrafts(), oldValues, "Failed import rolls back practice changes");
        assert.equal(await page.evaluate(course => window.DotnetLearning.progress.get("lesson", course, 2), mainCourse), false);
        await assertBadge(badge, false);
        await page.evaluate(() => window.restoreTestSetItem());
        await confirmAction(page, importCourse, true);
        await feedback.filter({ hasText: "Копия импортирована. Пропущено записей вне актуальной программы — 5." }).waitFor();
        assert.deepEqual(await readDrafts(), ["Новый код", ...oldValues.slice(1)], "Import preserves unrelated data");
        assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [sourceMethod, sourceSolution]),
            ["Сохранённый метод", "Сохранённое решение"]);
        assert.ok(await page.evaluate(course => window.DotnetLearning.progress.get("lesson", course, 2), mainCourse));
        await assertBadge(badge, true);
        await assertBadge(lessonBadge(page, addedLesson.number), false);
        const id = Object.keys(imported.progress).find(questionId => questionId !== deletedQuestionId);
        assert.ok(id);
        assert.deepEqual(await readRecord(page, mainCourse, id), imported.progress[id]);
        assert.equal(await readRecord(page, mainCourse, deletedQuestionId) ?? null, null);
        const practiceKinds = ["compiler-draft", "practice-draft", "practice-verified", "progress:lesson"];
        const absentPractice = [deletedLesson, addedLesson.number].flatMap(number =>
            practiceKinds.map(kind => practiceKey(kind, mainCourse, number)));
        assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), absentPractice),
            absentPractice.map(() => null), "Import skips retired practice and does not mark a new lesson");
        assert.deepEqual(await readRecord(page, mainCourse, existingId), existingRecord,
            "Import preserves history for an unrelated question");
        await openQuiz(page, mainCourse, "?through=2");
        await quizResult(page).waitFor();
        assert.equal(await questions(page).count(), 0, "Imported graded answers restore the lesson outcome");

        await openQuiz(page, mainCourse, "?filter=" + addedLesson.number);
        await question(page, addedQuestion.id).waitFor();
        assert.equal(await readRecord(page, mainCourse, addedQuestion.id) ?? null, null,
            "A new question is available without an invented card");
        await page.goto(addedLesson.url);
        await reviewStatus(page).waitFor();
        await markPractice(page, mainCourse, addedLesson.number);
        const newCard = await readRecord(page, mainCourse, addedQuestion.id);
        assert.deepEqual(newCard.history, []);
        assert.equal(newCard.card.dueAt, new Date(+now + 8 * hour).toISOString(),
            "Completing the new lesson seeds its cards on the usual schedule");

        await openBackup(page, mainCourse);
        await assertBadge(badge, true);
        await reviewLink(page).waitFor();
        const deleteCourse = () => page.locator("#course-delete-progress").click();
        const legacyKeys = [mainCourse, memoryCourse].map(course => "dotnet-courses:fsrs-7:v1:" + course);
        await page.evaluate(keys => keys.forEach(key => localStorage.setItem(key, "{}")), legacyKeys);
        await confirmAction(page, deleteCourse, false);
        assert.deepEqual(await readDrafts(), ["Новый код", "Другой урок", "Другой курс"]);
        assert.deepEqual(await readRecord(page, mainCourse, id), backup.progress[id]);
        await assertBadge(badge, true);
        assert.equal(await reviewLink(page).isVisible(), true);

        await confirmAction(page, deleteCourse, true);
        await feedback.filter({ hasText: "Прогресс курса удалён." }).waitFor();
        await assertBadge(badge, false);
        await assertBadge(lessonBadge(page, addedLesson.number), false);
        await reviewLink(page).waitFor({ state: "hidden" });
        assert.deepEqual(await readDrafts(), [null, null, "Другой курс"]);
        assert.equal(await readRecord(page, mainCourse, id) ?? null, null);
        assert.equal(await readRecord(page, mainCourse, dueId) ?? null, null);
        assert.deepEqual(await readRecord(page, memoryCourse, foreignHistory.id), foreignHistory.record);
        assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), legacyKeys), [null, "{}"]);
    } finally {
        await pageContext.close();
    }
}

async function verify() {
    const browser = await chromium.launch();
    try {
        const backup = await verifyLessonQuiz(browser, mainCourse, 2);
        await verifyLessonQuiz(browser, memoryCourse, 1);
        await verifyReviewToday(browser, mainCourse);
        await verifyReviewToday(browser, memoryCourse);
        await verifyQuestionBank(browser);
        await verifyBackup(browser, backup);
        console.log("Quiz: verified lesson completion and export, daily queues, bank filters and course backup");
    } finally {
        await browser.close();
    }
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
