// Shared local FSRS-7 scheduling engine. Bundled (not loaded from a CDN)
// into assets/js/quiz-fsrs.js by GitHub Actions, using ts-fsrs@6.0.0.
import { DefaultScheduler, Rating, State } from "ts-fsrs";

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
  if (!card || typeof card !== "object" || card.dueAt == null) return null;
  return {
    ...card,
    dueAt: toDate(card.dueAt),
    lastReviewAt: card.lastReviewAt == null ? null : toDate(card.lastReviewAt)
  };
}

function eligible(bank, today) {
  const day = toDate(today).toLocaleDateString("sv-SE");
  return (Array.isArray(bank) ? bank : []).filter(q =>
    typeof q.id === "string" &&
    Number.isSafeInteger(Number(q.lesson_number)) && Number(q.lesson_number) > 0 &&
    (!q.available_from || q.available_from <= day)
  );
}

function due(record, now) {
  if (!record?.card) return false;
  try { return reviveCard(record).dueAt.getTime() <= toDate(now).getTime(); }
  catch { return false; } // Do not silently overwrite damaged study history.
}

function validateRecord(record, questionId) {
  const card = reviveCard(record);
  if (!card || card.cardId !== questionId) return false;
  const measurements = [card.stability, card.stabilityFast, card.difficulty, card.reps,
    card.lapses, card.scheduledDays, card.learningStep];
  return typeof card.state === "number" && Object.values(State).includes(card.state) &&
    measurements.every(value => Number.isFinite(value) && value >= 0) &&
    Array.isArray(record.history) && record.history.every(attempt =>
      Object.hasOwn(ratings, attempt?.rating) && typeof attempt.answer === "string" &&
      attempt.answer.trim() && typeof attempt.at === "string" && Number.isFinite(Date.parse(attempt.at)));
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
  function seed(questionId, now = new Date()) {
    const created = toDate(now);
    const card = scheduler.newCard({ cardId: questionId, now: created });
    return {card: {...card, dueAt: new Date(created.getTime() + 8 * 3_600_000)}, history: []};
  }

  function evaluate(record, questionId, ratingName, answer, now = new Date(), {allowEarlyHistory = false} = {}) {
    if (!Object.hasOwn(ratings, ratingName)) throw new Error("Неизвестная оценка ответа");
    if (typeof answer !== "string" || !answer.trim()) throw new Error("Сначала напиши ответ");
    const date = toDate(now);
    const history = Array.isArray(record?.history) ? record.history : [];
    const attempt = {at: date.toISOString(), rating: ratingName, answer: answer.trim()};
    const card = record?.card ? reviveCard(record) : scheduler.newCard({cardId: questionId, now: date});
    if (!card) throw new Error("Некорректная карточка FSRS");
    if (card.state !== State.New && card.dueAt > date) {
      if (!allowEarlyHistory) throw new Error("Срок повторения ещё не наступил");
      return {...record, history: [...history, {...attempt, nextDue: card.dueAt.toISOString(), scheduled: false}]};
    }

    const result = scheduler.review({card, grade: ratings[ratingName], now: date});
    return {
      card: result.card,
      lastGrade: ratingName,
      history: [...history, {...attempt, nextDue: toDate(result.card.dueAt).toISOString(), revlog: result.revlog}]
    };
  }
  return {ratings, eligible, due, seed, evaluate, reviveCard, validateRecord, algorithm: "FSRS-7", library: "ts-fsrs@6.0.0"};
});

if (typeof window !== "undefined") window.DotnetQuizSRSReady = quizSRSReady;
