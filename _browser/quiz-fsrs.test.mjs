// Executed with Node 24 against the actual ts-fsrs package in CI.
// This tests scheduling, lesson filtering and durable serialization.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import { quizSRSReady } from "./quiz-fsrs-entry.mjs";

const srs = await quizSRSReady;
const now = new Date("2026-11-21T12:00:00Z");
const bank = [
  { id: "L1-A", lesson_number: 1, available_from: "2026-11-20" },
  { id: "L1-B", lesson_number: 1, available_from: "2026-11-20" },
  { id: "L2-A", lesson_number: 2, available_from: "2026-11-21" },
  { id: "L3-A", lesson_number: 3, available_from: "2026-11-22" }
];
const all = srs.eligible(bank, now);
assert.deepEqual(all.map(x => x.id), ["L1-A", "L1-B", "L2-A"]);

const seeded = srs.seed("L1-A", now);
assert.equal(seeded.card.dueAt.toISOString(), "2026-11-21T20:00:00.000Z");
assert.deepEqual(seeded.history, []);
assert.equal(srs.validateRecord(seeded, "L1-A"), true);
assert.equal(srs.validateRecord(seeded, "L2-A"), false);
assert.equal(srs.validateRecord({...seeded, card: {...seeded.card, stability: null}}, "L1-A"), false);
assert.equal(srs.due(undefined, now), false);
assert.equal(srs.due(seeded, now), false);
assert.equal(srs.due(seeded, seeded.card.dueAt), true);

assert.throws(() => srs.evaluate(null, "L1-A", "correct", "", now), /напиши ответ/);
const answer = "Мой первый ответ";
const first = srs.evaluate(seeded, "L1-A", "correct", answer, now);
assert.deepEqual(first.card, srs.evaluate(null, "L1-A", "correct", answer, now).card,
  "The seed deadline must not affect the interval after a valid first grade");
assert.equal(first.history.length, 1);
assert.equal(first.history[0].rating, "correct");
assert.ok(new Date(first.card.dueAt) > now);
assert.equal(srs.due(first, now), false);
assert.throws(() => srs.evaluate(first, "L1-A", "easy", "Рано", now), /Срок повторения/);

// An early answer in the full question bank updates the shared history only.
const early = srs.evaluate(first, "L1-A", "wrong", "Ответ в банке", new Date(+now + 2000), {allowEarlyHistory: true});
assert.equal(early.history.length, 2);
assert.equal(early.history.at(-1).scheduled, false);
assert.equal(early.history.at(-1).rating, "wrong");
assert.equal(early.history.at(-1).nextDue, first.card.dueAt.toISOString());
assert.equal(early.history.at(-1).revlog, undefined);
assert.equal(early.card, first.card);
assert.equal(early.lastGrade, "correct");
assert.equal(srs.validateRecord(early, "L1-A"), true);

// Persistence round-trip must restore Date fields before FSRS review.
const restored = JSON.parse(JSON.stringify(early));
const future = new Date(restored.card.dueAt);
assert.equal(srs.due(restored, future), true);
const repeated = srs.evaluate(restored, "L1-A", "wrong", "Срок уже наступил", future, {allowEarlyHistory: true});
assert.equal(repeated.history.length, 3);
assert.equal(repeated.lastGrade, "wrong");
assert.ok(repeated.history.at(-1).revlog);
assert.ok(new Date(repeated.card.dueAt) > future);

const values = new Map();
const browser = {
  window: {}, crypto: {randomUUID},
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
};
runInNewContext(readFileSync(new URL("../assets/js/quiz-storage.js", import.meta.url), "utf8"), browser);
const {forCourse} = browser.window.DotnetQuizStorage;
const course = forCourse("csharp-dotnet-9-11");
const memory = forCourse("memory");
assert.equal(course.seed(srs, ["L1-A"], now), 1);
assert.equal(course.seed(srs, ["L1-A"], future), 0);
assert.equal(course.record("L1-A").card.dueAt, seeded.card.dueAt.toISOString());
assert.equal(memory.record("L1-A"), undefined);

const [importKey, serialized] = course.prepareHistoryWrite({"L1-A": early});
assert.equal(importKey, course.importKey);
assert.equal(course.changed(importKey), true);
assert.equal(memory.changed(importKey), false);
browser.localStorage.setItem(importKey, serialized);
assert.equal(course.record("L1-A").history.length, 2,
  "An import replaces the active revision rather than revealing stale card overrides");
assert.equal(course.seed(srs, ["L1-A", "L3-A"], future), 1);
assert.deepEqual(Object.keys(course.records(bank.map(question => question.id))), ["L1-A", "L3-A"]);

const bankGrade = memory.grade(srs, "ALLOC-Q-1", "easy", "Текст ответа", {allowEarlyHistory: true, now});
assert.equal(bankGrade.history.length, 1);
assert.ok(bankGrade.history[0].revlog);
assert.equal(memory.record("ALLOC-Q-1").history[0].answer, "Текст ответа");
assert.equal(course.record("ALLOC-Q-1"), undefined);

console.log("FSRS-7: +8h seed, early bank history, due scheduling and course storage verified");
