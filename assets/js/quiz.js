(() => {
  "use strict";

  const root = document.getElementById("quiz-root");
  const courseReview = document.querySelector("[data-course-review]");
  const courseRoot = root ?? courseReview;
  const source = document.getElementById("question-bank");
  if (!courseRoot || !source) return;

  const course = courseRoot.dataset.course;
  const lessonNumbers = courseRoot.dataset.lessonNumbers.split(",").map(Number).filter(number => number > 0);
  const storage = window.DotnetQuizStorage.forCourse(course);
  const bank = JSON.parse(source.textContent);
  const dateFormat = new Intl.DateTimeFormat("ru-RU", {dateStyle: "medium", timeStyle: "short"});
  const progressEvent = "dotnet-courses:progress-changed";

  function availableQuestions(engine, now) {
    return engine.eligible(bank, now).filter(question => lessonNumbers.includes(Number(question.lesson_number)));
  }

  function recordsFor(questions) {
    return storage.records(questions.map(question => question.id));
  }

  function dueQuestions(engine, now) {
    const questions = availableQuestions(engine, now);
    const records = recordsFor(questions);
    return questions.filter(question => engine.due(records[question.id], now));
  }

  function completedLesson(number) {
    return window.DotnetLearning.progress.get("lesson", course, number) === true;
  }

  function initCourseReview(engine) {
    const status = courseReview.querySelector("[data-course-review-status]");
    const action = courseReview.querySelector("[data-course-review-action]");
    const refresh = () => {
      const count = dueQuestions(engine, new Date()).length;
      status.textContent = count ? "Вопросов к повторению: " + count : "На сегодня повторений нет";
      action.hidden = count === 0;
      courseReview.hidden = false;
    };

    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", event => {
      if (storage.changed(event.key)) refresh();
    });

    if (document.getElementById("course-backup")) {
      const courseBank = bank.filter(question => lessonNumbers.includes(Number(question.lesson_number)));
      window.DotnetCourseBackup.attach({
        course,
        ids: new Set(courseBank.map(question => question.id)),
        publishedLessons: lessonNumbers,
        readHistory: () => recordsFor(courseBank),
        prepareHistoryWrite: records => storage.prepareHistoryWrite(records),
        validateHistoryRecord: (record, id) => engine.validateRecord(record, id),
        onImported() {
          window.DotnetLearning.refreshProgress();
          refresh();
        }
      });
    }
    refresh();
    return refresh;
  }

  function latestAnswer(record) {
    return record?.history?.findLast(attempt => typeof attempt.answer === "string" &&
      attempt.answer.trim() && Object.hasOwn(ratingLabels, attempt.rating));
  }

  const ratingLabels = {wrong: "Неверно", partial: "Частично", correct: "Верно", easy: "Легко"};

  function renderHistory(details, history) {
    const attempts = history ?? [];
    const summary = details.querySelector("summary");
    const list = details.querySelector("ol");
    const more = details.querySelector("button");
    let remaining = attempts.length;
    list.replaceChildren();
    list.start = remaining;
    summary.textContent = "История ответов (" + remaining + ")";
    details.hidden = remaining === 0;
    more.hidden = true;

    function appendPage() {
      const end = Math.max(0, remaining - 5);
      const page = document.createDocumentFragment();
      while (remaining > end) {
        const attempt = attempts[--remaining];
        const item = document.createElement("li");
        const label = document.createElement("div");
        label.className = "muted";
        const time = document.createElement("time");
        time.dateTime = attempt.at;
        time.textContent = dateFormat.format(new Date(attempt.at));
        label.append(time, " · " + ratingLabels[attempt.rating]);
        const answer = document.createElement("pre");
        answer.textContent = attempt.answer;
        item.append(label, answer);
        page.append(item);
      }
      const first = page.firstElementChild;
      list.append(page);
      more.hidden = remaining === 0;
      return first;
    }

    details.ontoggle = () => {
      if (details.open && !list.childElementCount) appendPage();
    };
    more.onclick = () => {
      const first = appendPage();
      if (first) {
        first.tabIndex = -1;
        first.focus();
      }
    };
    if (details.open) appendPage();
  }

  function initQuiz(engine) {
    const query = new URLSearchParams(location.search);
    const requested = query.getAll("through");
    const lesson = requested.length === 1 && /^\d+$/.test(requested[0]) ? Number(requested[0]) : null;
    const lessonQuiz = lessonNumbers.includes(lesson);
    const todayQuiz = !lessonQuiz && query.get("review") === "today";
    const questionBank = !lessonQuiz && !todayQuiz;
    const lessons = [...document.getElementById("quiz-lesson-links").content.querySelectorAll("a")];
    const title = document.getElementById("quiz-title");
    const count = document.getElementById("quiz-count");
    const result = document.getElementById("quiz-result");
    const navigation = document.getElementById("quiz-navigation");
    const back = document.getElementById("quiz-back");
    const feedback = document.getElementById("quiz-feedback");
    const template = document.getElementById("quiz-question-template").content.firstElementChild;
    const questions = availableQuestions(engine, new Date());
    const lessonQuestions = lessonQuiz ? questions.filter(question => Number(question.lesson_number) === lesson) : [];

    document.getElementById("quiz-bank-link").hidden = questionBank;
    if (lessonQuiz) {
      title.textContent = "Квиз урока " + lesson;
      const current = lessons.find(link => Number(link.dataset.lesson) === lesson);
      if (current) {
        back.href = current.href;
        back.textContent = "Вернуться к уроку";
      }
      const next = lessons.filter(link => Number(link.dataset.lesson) > lesson)
        .sort((left, right) => Number(left.dataset.lesson) - Number(right.dataset.lesson))[0];
      if (next) {
        const link = document.getElementById("quiz-next-lesson");
        link.href = next.href;
        link.textContent = "Следующий урок";
      }
    } else if (todayQuiz) {
      title.textContent = "Повторить сегодня";
    }

    function emptyState(message) {
      const text = document.createElement("p");
      text.className = "notice";
      text.textContent = message;
      root.replaceChildren(text);
    }

    function buildQuestion(question, record, advance, skipQuestion) {
      const box = template.cloneNode(true);
      const title = box.querySelector("[data-question-title]");
      const status = box.querySelector("[data-question-due]");
      const label = box.querySelector("label");
      const input = box.querySelector("textarea");
      const hint = box.querySelector(".quiz-rating-hint");
      const controls = box.querySelector(".quiz-rating-actions");
      const buttons = [...controls.querySelectorAll("button")];
      const skip = box.querySelector(".quiz-skip");
      const message = box.querySelector(".question-feedback");
      const history = box.querySelector(".question-answer-history");

      box.dataset.questionId = question.id;
      box.querySelector(".question-meta").textContent =
        "Урок №" + question.lesson_number + " · " + question.id + " · " + question.tag;
      title.textContent = question.prompt;
      input.id = "answer-" + question.id;
      label.htmlFor = input.id;
      hint.id = "rating-hint-" + question.id;

      function showStatus(current) {
        if (!questionBank) return;
        status.hidden = false;
        status.textContent = !current?.card ? "Новый вопрос"
          : engine.due(current, new Date()) ? "Ждёт ответа"
          : "Следующий ответ: " + dateFormat.format(new Date(current.card.dueAt));
      }

      function updateRatingAvailability() {
        const blank = !input.value.trim();
        hint.hidden = !blank || input.disabled;
        controls.title = hint.hidden ? "" : hint.textContent;
        if (hint.hidden) input.removeAttribute("aria-describedby");
        else input.setAttribute("aria-describedby", hint.id);
        for (const button of buttons) button.disabled = blank || input.disabled;
      }

      input.addEventListener("input", updateRatingAvailability);
      for (const button of buttons) {
        button.addEventListener("click", () => {
          const answer = input.value.trim();
          if (!answer || input.disabled) return;
          const now = new Date();
          let updated;
          try {
            if (!questionBank) {
              const current = storage.record(question.id);
              if (lessonQuiz && latestAnswer(current)) {
                advance();
                return;
              }
              if (todayQuiz && !engine.due(current, now)) {
                message.textContent = "Срок ответа изменился. Обнови страницу, чтобы получить актуальные вопросы.";
                return;
              }
            }
            updated = storage.grade(engine, question.id, button.dataset.rating, answer, {
              allowEarlyHistory: questionBank, now
            });
          } catch {
            message.textContent = "Не удалось сохранить ответ. Текст остался в поле.";
            return;
          }

          input.value = "";
          input.disabled = true;
          updateRatingAvailability();
          if (advance) {
            advance();
          } else {
            showStatus(updated);
            renderHistory(history, updated.history);
            message.textContent = "Ответ и самооценка сохранены.";
          }
        });
      }

      if (skipQuestion) {
        skip.hidden = false;
        skip.addEventListener("click", skipQuestion);
      }
      showStatus(record);
      updateRatingAvailability();
      renderHistory(history, record?.history);
      return box;
    }

    if (questionBank) {
      const filter = document.getElementById("quiz-filter");
      const selected = query.get("filter");
      filter.value = [...filter.options].some(option => option.value === selected) ? selected
        : lessonNumbers.some(completedLesson) ? "completed" : "all";
      document.getElementById("quiz-filter-control").hidden = false;
      filter.addEventListener("change", () => {
        query.set("filter", filter.value);
        location.search = query.toString();
      });

      const filtered = questions.filter(question => {
        const number = Number(question.lesson_number);
        return filter.value === "all" || (filter.value === "completed"
          ? completedLesson(number) : number === Number(filter.value));
      });
      count.textContent = "Вопросов: " + filtered.length;
      if (filtered.length) {
        const records = recordsFor(filtered);
        root.replaceChildren(...filtered.map(question => buildQuestion(question, records[question.id])));
      } else {
        emptyState("Для выбранных уроков пока нет вопросов.");
      }
      return;
    }

    function exportText() {
      const records = recordsFor(lessonQuestions);
      return [
        ".NET Courses · Квиз урока " + lesson,
        "Проверь мои ответы, объясни ошибки и предложи короткие исправления.",
        "",
        ...lessonQuestions.map(question => {
          const answer = latestAnswer(records[question.id]).answer;
          return question.id + "\n" + question.prompt + "\n\nМой ответ\n" + answer + "\n";
        })
      ].join("\n");
    }

    if (lessonQuiz) {
      document.getElementById("quiz-copy").addEventListener("click", async () => {
        try {
          await window.DotnetLearning.copy(exportText());
          feedback.textContent = "Ответы скопированы.";
        } catch {
          feedback.textContent = "Не удалось скопировать ответы. Можно скачать .txt.";
        }
      });
      document.getElementById("quiz-download").addEventListener("click", () => {
        try {
          window.DotnetLearning.download(course + "-lesson-" + lesson + ".txt", exportText());
        } catch {
          feedback.textContent = "Не удалось скачать ответы. Обнови страницу и попробуй снова.";
        }
      });
    }

    function unanswered(questions) {
      const records = recordsFor(questions);
      return questions.filter(question => !latestAnswer(records[question.id]));
    }

    let queue = lessonQuiz ? unanswered(lessonQuestions) : dueQuestions(engine, new Date());

    function afterAnswer() {
      queue.shift();
      if (todayQuiz) {
        const due = dueQuestions(engine, new Date());
        const dueIds = new Set(due.map(question => question.id));
        queue = queue.filter(question => dueIds.has(question.id));
        const queued = new Set(queue.map(question => question.id));
        queue.push(...due.filter(question => !queued.has(question.id)));
      } else {
        queue = unanswered(queue);
      }
      renderQueue(true);
    }

    function skipQuestion() {
      queue.push(queue.shift());
      renderQueue(true);
    }

    function renderQueue(focus = false) {
      const finishedLesson = lessonQuiz && lessonQuestions.length > 0 && queue.length === 0;
      result.hidden = !finishedLesson;
      navigation.hidden = finishedLesson;
      count.textContent = lessonQuiz ? "Отвечено " + (lessonQuestions.length - queue.length) + " из " + lessonQuestions.length
        : queue.length ? "Осталось повторить: " + queue.length : "";

      if (queue.length) {
        const question = queue[0];
        root.replaceChildren(buildQuestion(question, storage.record(question.id), afterAnswer,
          queue.length > 1 ? skipQuestion : undefined));
      } else if (finishedLesson) {
        root.replaceChildren();
      } else {
        emptyState(todayQuiz ? "На сегодня больше вопросов нет" : "У этого урока пока нет вопросов.");
      }

      if (focus) {
        const target = root.querySelector("[data-question-title]") ?? (finishedLesson ? result.querySelector("h2") : back);
        target.focus();
      }
    }

    renderQueue();
  }

  // site.js and the course backup module are deferred as well.
  const ready = new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, {once: true}))
    .then(() => window.DotnetQuizSRSReady)
    .then(engine => {
      if (!engine) throw Error("FSRS not loaded");
      return engine;
    });

  if (courseReview) {
    const active = ready.then(engine => ({engine, refresh: initCourseReview(engine)}));
    window.addEventListener(progressEvent, event => {
      if (event.detail.kind !== "lesson" || event.detail.course !== course) return;
      const now = new Date();
      const feedback = courseReview.querySelector("[data-course-review-feedback]");
      active.then(({engine, refresh}) => {
        const ids = availableQuestions(engine, now)
          .filter(question => completedLesson(Number(question.lesson_number)))
          .map(question => question.id);
        storage.seed(engine, ids, now);
        feedback.hidden = true;
        refresh();
      }).catch(() => {
        feedback.textContent = "Не удалось создать карточки для повторения. Сайт попробует снова при следующем зачёте.";
        feedback.hidden = false;
      });
    });
    active.catch(() => {
      courseReview.querySelector("[data-course-review-status]").textContent = "Не удалось загрузить повторение.";
      courseReview.hidden = false;
      const backupFeedback = document.getElementById("quiz-backup-feedback");
      if (backupFeedback && document.getElementById("quiz-export-progress").disabled) {
        backupFeedback.textContent = "Не удалось загрузить резервное копирование. Обнови страницу.";
      }
    });
  } else {
    window.addEventListener("pageshow", event => {
      if (event.persisted) location.reload();
    });
    ready.then(initQuiz).catch(() => {
      document.getElementById("quiz-feedback").textContent = "Не удалось загрузить вопросы. Обнови страницу.";
    });
  }
})();
