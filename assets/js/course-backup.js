(() => {
  "use strict";

  const format = "dotnet-courses-course-v1";
  const kinds = [
    ["editorDrafts", "Файлы Program.cs", "compiler-draft"],
    ["taskDrafts", "Черновики заданий", "practice-draft"],
    ["verifiedSolutions", "Успешные решения", "practice-verified"]
  ];
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

  function updateStorage(writes) {
    const applied = [];
    try {
      for (const [key, value] of writes) {
        const before = localStorage.getItem(key);
        localStorage.setItem(key, value);
        applied.push([key, value, before]);
      }
    } catch {
      let restored = true;
      for (const [key, value, before] of applied.reverse()) {
        try {
          // Leave edits made by another tab after this import began in place.
          if (localStorage.getItem(key) !== value) continue;
          if (before === null) localStorage.removeItem(key);
          else localStorage.setItem(key, before);
        } catch {
          restored = false;
        }
      }
      throw Error(restored ? "Не удалось сохранить копию. Прежние данные сохранены." :
        "Не удалось завершить импорт и восстановить все прежние данные.");
    }
  }

  function attach({course, ids, publishedLessons, importKey, readQuizData, reviveCard, onImported}) {
    const control = document.querySelector(".quiz-backup");
    if (!control) return;
    const exportButton = control.querySelector("#quiz-export-progress");
    const importButton = control.querySelector("#quiz-import-progress");
    const input = control.querySelector("#quiz-import-file");
    const feedback = control.querySelector("#quiz-backup-feedback");
    const dialog = control.querySelector("#quiz-import-preview");
    const summary = dialog.querySelector("#quiz-import-changes");
    const notice = dialog.querySelector("#quiz-import-notice");
    const records = dialog.querySelector("#quiz-import-records");
    const recordList = records.querySelector("ul");
    const submit = dialog.querySelector('[value="import"]');
    const practiceLessons = (control.dataset.practiceLessons || "").split(",").map(Number)
      .filter(lesson => publishedLessons.includes(lesson));
    const storageKey = (kind, lesson) => "dotnet-courses:" + kind + ":" + course + ":" + lesson;
    const completed = (kind, lessons) => lessons.filter(lesson =>
      localStorage.getItem(storageKey("progress:" + kind, lesson)) === "1");
    let pending;

    function snapshot() {
      const practice = {};
      for (const [field, , kind] of kinds) {
        practice[field] = {};
        for (const lesson of practiceLessons) {
          const value = localStorage.getItem(storageKey(kind, lesson));
          if (value !== null) practice[field][lesson] = value;
        }
      }
      practice.completedLessons = completed("lesson", practiceLessons);
      return {...readQuizData(), completedLessons: completed("quiz", publishedLessons), practice};
    }

    function validate(data) {
      const legacy = ["dotnet-courses-fsrs-v1", "dotnet-courses-fsrs-v2"].includes(data?.format);
      if ((!legacy && data?.format !== format) || data.course !== course ||
          !isObject(data.progress) || !isObject(data.drafts)) {
        throw Error("Это не файл прогресса данного курса.");
      }
      for (const [id, record] of Object.entries(data.progress)) {
        try {
          if (ids.has(id) && isObject(record?.card) && Array.isArray(record.history) &&
              record.card.dueAt != null && reviveCard(record)) continue;
        } catch { /* The scheduler rejects invalid dates. */ }
        throw Error("Некорректная карточка FSRS.");
      }
      if (Object.entries(data.drafts).some(([id, value]) =>
          typeof value !== "string" || (!legacy && !ids.has(id)))) {
        throw Error("Некорректные черновики ответов.");
      }
      // Old quiz exports could include drafts from removed questions.
      const drafts = Object.fromEntries(Object.entries(data.drafts).filter(([id]) => ids.has(id)));
      const validateMarks = (marks, lessons, label) => {
        if (!Array.isArray(marks) || marks.some(lesson => !lessons.includes(lesson))) {
          throw Error("Некорректные отметки о прохождении " + label + ".");
        }
        return [...new Set(marks)];
      };
      const completedLessons = data.format === "dotnet-courses-fsrs-v1" ? [] :
        validateMarks(data.completedLessons, publishedLessons, "квизов");
      const practice = {};
      if (!legacy && !isObject(data.practice)) throw Error("Некорректные данные практики.");
      for (const [field, label] of kinds) {
        const values = legacy ? {} : data.practice[field];
        if (!isObject(values) || Object.entries(values).some(([lesson, value]) =>
            !practiceLessons.some(number => String(number) === lesson) || typeof value !== "string")) {
          throw Error("Некорректные данные в категории «" + label.toLowerCase() + "».");
        }
        practice[field] = values;
      }
      practice.completedLessons = legacy ? [] :
        validateMarks(data.practice.completedLessons, practiceLessons, "уроков");
      return {progress: data.progress, drafts, completedLessons, practice};
    }

    function makePlan(incoming, current) {
      const writes = [];
      const changes = [];
      function compare(label, source, target, update) {
        const added = [];
        const replaced = [];
        for (const [key, value] of Object.entries(source)) {
          if (!Object.hasOwn(target, key)) added.push(key);
          else if (JSON.stringify(value) !== JSON.stringify(target[key])) replaced.push(key);
          else continue;
          update?.(key, value);
        }
        changes.push({label, added, replaced});
        return added.length + replaced.length > 0;
      }
      function addMarks(label, kind, incomingMarks, currentMarks) {
        const added = incomingMarks.filter(lesson => !currentMarks.includes(lesson));
        for (const lesson of added) writes.push([storageKey("progress:" + kind, lesson), "1"]);
        changes.push({label, added, replaced: []});
      }

      const changedCards = compare("Карточки FSRS с историей", incoming.progress, current.progress);
      const changedAnswers = compare("Черновики ответов", incoming.drafts, current.drafts);
      addMarks("Отметки о пройденных квизах", "quiz", incoming.completedLessons, current.completedLessons);
      for (const [field, label, kind] of kinds) {
        compare(label, incoming.practice[field], current.practice[field],
          (lesson, value) => writes.push([storageKey(kind, lesson), value]));
      }
      addMarks("Отметки о пройденных уроках", "lesson", incoming.practice.completedLessons, current.practice.completedLessons);

      // Commit the quiz revision last so a rollback cannot invalidate live question overrides.
      if (changedCards || changedAnswers) {
        const imported = {
          revision: crypto.randomUUID(),
          progress: {...current.progress, ...incoming.progress},
          drafts: {...current.drafts, ...incoming.drafts}
        };
        writes.push([importKey, JSON.stringify(imported)]);
      }
      return {writes, changes};
    }

    function showPreview(incoming, current, changedSincePreview = false) {
      const {changes, writes} = makePlan(incoming, current);
      pending = {incoming, fingerprint: JSON.stringify(current), writes};
      importButton.disabled = true;
      const makeRow = text => {
        const row = document.createElement("li");
        row.textContent = text;
        return row;
      };
      summary.replaceChildren(...changes.map(({label, added, replaced}) =>
        makeRow(label + " · добавить " + added.length + ", заменить " + replaced.length)));
      const entryNames = entries => entries.map(id => /^\d+$/.test(id) ? "урок №" + id : id).join(", ");
      recordList.replaceChildren(...changes.filter(({added, replaced}) => added.length || replaced.length).map(({label, added, replaced}) =>
        makeRow(label + "." + (added.length ? " Добавятся " + entryNames(added) + "." : "") +
          (replaced.length ? " Заменятся " + entryNames(replaced) + "." : ""))));
      records.open = false;
      records.hidden = writes.length === 0;
      notice.textContent = changedSincePreview ? "Данные в браузере изменились. Проверь обновлённую сводку." :
        writes.length ? "" : "Записи из копии уже сохранены.";
      submit.disabled = writes.length === 0;
      dialog.returnValue = "";
      dialog.showModal();
    }

    exportButton.addEventListener("click", () => {
      try {
        const data = {format, algorithm: "FSRS-7", course, exportedAt: new Date().toISOString(), ...snapshot()};
        window.DotnetLearning.download("progress-" + course + ".json", JSON.stringify(data, null, 2));
        feedback.textContent = "Копия скачана. В JSON содержатся твои ответы и код.";
      } catch {
        feedback.textContent = "Не удалось прочитать сохранённый прогресс курса.";
      }
    });
    importButton.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      feedback.textContent = "";
      importButton.disabled = true;
      try {
        if (file.size > 10_000_000) throw Error("Нужен JSON-файл размером не более 10 МБ.");
        const data = JSON.parse(await file.text());
        showPreview(validate(data), snapshot());
      } catch (error) {
        importButton.disabled = false;
        feedback.textContent = "Ошибка импорта: " + error.message;
      }
    });
    dialog.addEventListener("close", () => {
      const preview = pending;
      pending = null;
      importButton.disabled = false;
      importButton.focus({preventScroll: true});
      if (!preview || dialog.returnValue !== "import" || !preview.writes.length) return;
      try {
        const current = snapshot();
        if (JSON.stringify(current) !== preview.fingerprint) {
          showPreview(preview.incoming, current, true);
          return;
        }
        updateStorage(preview.writes);
      } catch (error) {
        feedback.textContent = "Ошибка импорта: " + error.message;
        return;
      }
      feedback.textContent = "Копия импортирована.";
      onImported(preview.writes.some(([key]) => key === importKey));
    });
  }

  window.DotnetCourseBackup = {attach};
})();
