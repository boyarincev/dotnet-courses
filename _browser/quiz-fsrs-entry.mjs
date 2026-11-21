// Shared local FSRS-7 scheduling engine. Bundled (not loaded from a CDN)
// into assets/js/quiz-fsrs.js by GitHub Actions, using ts-fsrs@6.0.0.
import { DefaultScheduler, Rating } from "ts-fsrs";

const ratings = Object.freeze({
  wrong: Rating.Again,
  partial: Rating.Hard,
  correct: Rating.Good,
  easy: Rating.Easy
});

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error("Некорректная дата карточки FSRS");
  return date;
}

function reviveCard(record) {
  const card = record?.card;
  if (!card || typeof card !== "object") return null;
  return {
    ...card,
    dueAt: toDate(card.dueAt),
    lastReviewAt: card.lastReviewAt == null ? null : toDate(card.lastReviewAt)
  };
}

function randomize(items, random = Math.random) {
  const array = items.slice();
  for (let i = array.length - 1; i > 0; i--) {
    const r = Math.max(0, Math.min(0.999999999, Number(random())));
    const j = Math.floor(r * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function eligible(bank, today, maxLesson) {
  const lessonLimit = Number.isSafeInteger(maxLesson) && maxLesson > 0 ? maxLesson : Infinity;
  const day = toDate(today).toLocaleDateString("sv-SE");
  return (Array.isArray(bank) ? bank : []).filter(q =>
    typeof q.id === "string" &&
    Number.isSafeInteger(Number(q.lesson_number)) && Number(q.lesson_number) > 0 &&
    Number(q.lesson_number) <= lessonLimit &&
    (!q.available_from || q.available_from <= day)
  );
}

function due(record, now) {
  if (!record || !record.card) return true;
  try { return reviveCard(record).dueAt.getTime() <= toDate(now).getTime(); }
  catch { return false; } // Do not silently overwrite damaged study history.
}

function select(bank, progress, today, maxLesson, limit = 5, random = Math.random, exclude = []) {
  const excluded = new Set(exclude);
  const groups = [[], [], []];
  for (const q of eligible(bank, today, maxLesson)) {
    if (excluded.has(q.id)) continue;
    const row = progress?.[q.id];
    if (!due(row, today)) continue;
    let group = 2; // New
    if (row?.card) group = row.lastGrade === "wrong" || row.lastGrade === "partial" ? 0 : 1;
    groups[group].push(q);
  }
  return groups.flatMap(items => randomize(items, random)).slice(0, Math.max(0, limit));
}

export const quizSRSReady = DefaultScheduler({
  version: "FSRS-7",
  desiredRetention: 0.9,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
  enableFuzz: false,
  maximumInterval: 36500
}).then(scheduler => {
  function evaluate(record, questionId, ratingName, answer, now = new Date()) {
    if (!Object.hasOwn(ratings, ratingName)) throw new Error("Неизвестная оценка ответа");
    if (typeof answer !== "string" || !answer.trim()) throw new Error("Сначала напиши ответ");
    const date = toDate(now);
    if (record?.card && !due(record, date)) throw new Error("Срок повторения ещё не наступил");
    const card = reviveCard(record) || scheduler.newCard({ cardId: questionId, now: date });
    const result = scheduler.review({ card, grade: ratings[ratingName], now: date });
    const entry = {
      at: date.toISOString(),
      rating: ratingName,
      answer: answer.trim().slice(0, 12000),
      nextDue: toDate(result.card.dueAt).toISOString(),
      revlog: result.revlog
    };
    return {
      card: result.card,
      lastGrade: ratingName,
      history: [...(Array.isArray(record?.history) ? record.history : []), entry]
    };
  }
  return { ratings, eligible, due, select, evaluate, reviveCard, algorithm: "FSRS-7", library: "ts-fsrs@6.0.0" };
});

if (typeof window !== "undefined") window.DotnetQuizSRSReady = quizSRSReady;
