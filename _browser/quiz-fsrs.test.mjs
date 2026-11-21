// Executed with Node 24 against the actual ts-fsrs package in CI.
// This tests scheduling, lesson filtering, randomized selection and durable serialization.
import assert from "node:assert/strict";
import { quizSRSReady } from "./quiz-fsrs-entry.mjs";

const srs = await quizSRSReady;
const now = new Date("2026-11-21T12:00:00Z");
const bank = [
  { id: "L1-A", lesson_number: 1, available_from: "2026-11-20" },
  { id: "L1-B", lesson_number: 1, available_from: "2026-11-20" },
  { id: "L2-A", lesson_number: 2, available_from: "2026-11-21" },
  { id: "L3-A", lesson_number: 3, available_from: "2026-11-22" }
];
const all = srs.eligible(bank, now, 2);
assert.deepEqual(all.map(x => x.id), ["L1-A", "L1-B", "L2-A"]);
assert.deepEqual(srs.eligible(bank, now, 1).map(x => x.id), ["L1-A", "L1-B"]);
assert.deepEqual(srs.eligible(bank, now, null).map(x => x.id), ["L1-A", "L1-B", "L2-A"]);
assert.equal(srs.select(bank, {}, now, 2, 5, () => 0.5).length, 3);

let p = {};
assert.throws(() => srs.evaluate(null, "L1-A", "correct", "", now), /напиши ответ/);
p["L1-A"] = srs.evaluate(null, "L1-A", "correct", "Мой первый ответ", now);
assert.equal(p["L1-A"].history.length, 1);
assert.equal(p["L1-A"].history[0].rating, "correct");
assert.ok(new Date(p["L1-A"].card.dueAt) > now);
assert.equal(srs.due(p["L1-A"], now), false);
assert.equal(srs.select(bank, p, now, 1, 5).some(q => q.id === "L1-A"), false);
assert.throws(() => srs.evaluate(p["L1-A"], "L1-A", "easy", "Рано", now), /Срок повторения/);

// Persistence round-trip must restore Date fields before FSRS review.
p = JSON.parse(JSON.stringify(p));
const future = new Date(new Date(p["L1-A"].card.dueAt).getTime() + 2000);
assert.equal(srs.due(p["L1-A"], future), true);
p["L1-A"] = srs.evaluate(p["L1-A"], "L1-A", "wrong", "Проверочный неверный ответ", future);
assert.equal(p["L1-A"].history.length, 2);
assert.equal(p["L1-A"].lastGrade, "wrong");
assert.ok(new Date(p["L1-A"].card.dueAt) > future);
assert.deepEqual(srs.select(bank, p, future, 1, 10).map(q => q.id).sort(), ["L1-B"]);

// A wrong/partial answer is prioritized when it becomes due again.
const again = new Date(new Date(p["L1-A"].card.dueAt).getTime() + 2000);
assert.equal(srs.select(bank, p, again, 1, 10, () => 0.4)[0].id, "L1-A");
p["L1-A"] = srs.evaluate(p["L1-A"], "L1-A", "partial", "Частично понимаю", again);
assert.equal(p["L1-A"].history.length, 3);
assert.ok(new Date(p["L1-A"].card.dueAt) > again);

console.log("FSRS-7: rating, due scheduling, lesson filtering, persistence and priority OK");
