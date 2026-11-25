(() => {
  "use strict";

  const format = "dotnet-courses-course-v2";
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
        if (before === value) continue;
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
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
      throw Error(restored ? "Не удалось сохранить изменения. Прежние данные сохранены." :
        "Не удалось восстановить все прежние данные после ошибки записи.");
    }
  }

  function attach({course, ids, publishedLessons, readHistory, prepareHistoryWrite, validateHistoryRecord, onImported}) {
    const control = document.getElementById("course-backup");
    if (!control) return;
    const exportButton = control.querySelector("#quiz-export-progress");
    const importButton = control.querySelector("#quiz-import-progress");
    const deleteButton = control.querySelector("#course-delete-progress");
    const input = control.querySelector("#quiz-import-file");
    const feedback = control.querySelector("#quiz-backup-feedback");
    const practiceLessons = (control.dataset.practiceLessons || "").split(",").map(Number)
      .filter(lesson => publishedLessons.includes(lesson));
    const practiceNumbers = new Set(practiceLessons);
    const practiceIds = new Set(practiceLessons.map(String));
    const storageKey = (kind, lesson) => "dotnet-courses:" + kind + ":" + course + ":" + lesson;

    function snapshot() {
      const practice = {};
      for (const [field, , kind] of kinds) {
        practice[field] = {};
        for (const lesson of practiceLessons) {
          const value = localStorage.getItem(storageKey(kind, lesson));
          if (value !== null) practice[field][lesson] = value;
        }
      }
      practice.completedLessons = practiceLessons.filter(lesson =>
        localStorage.getItem(storageKey("progress:lesson", lesson)) === "1");
      return {progress: readHistory(), practice};
    }

    function validate(data) {
      if (data?.format !== format || data.algorithm !== "FSRS-7" || data.course !== course ||
          !isObject(data.progress)) {
        throw Error("Это не файл прогресса данного курса.");
      }
      let skipped = 0;
      function keepKnown(catalog, id) {
        if (catalog.has(id)) return true;
        skipped++;
        return false;
      }

      const history = Object.entries(data.progress);
      for (const [id, record] of history) {
        try {
          if (id && validateHistoryRecord(record, id)) continue;
        } catch { /* Reject records that the history reader cannot use. */ }
        throw Error("Некорректная карточка FSRS.");
      }
      const progress = Object.fromEntries(history.filter(([id]) => keepKnown(ids, id)));

      if (!isObject(data.practice)) throw Error("Некорректные данные практики.");
      const practice = {};
      for (const [field, label] of kinds) {
        const values = data.practice[field];
        if (!isObject(values)) throw Error("Некорректные данные в категории «" + label.toLowerCase() + "».");
        const entries = Object.entries(values);
        if (entries.some(([lesson, value]) => !/^[1-9]\d*$/.test(lesson) ||
            !Number.isSafeInteger(Number(lesson)) || typeof value !== "string")) {
          throw Error("Некорректные данные в категории «" + label.toLowerCase() + "».");
        }
        practice[field] = Object.fromEntries(entries.filter(([lesson]) => keepKnown(practiceIds, lesson)));
      }
      const completed = data.practice.completedLessons;
      if (!Array.isArray(completed) || completed.some(lesson => !Number.isSafeInteger(lesson) || lesson <= 0)) {
        throw Error("Некорректные отметки о выполнении практики.");
      }
      practice.completedLessons = [...new Set(completed)].filter(lesson => keepKnown(practiceNumbers, lesson));
      return {progress, practice, skipped};
    }

    function importData({progress, practice}) {
      const writes = [];
      for (const [field, , kind] of kinds) {
        for (const [lesson, value] of Object.entries(practice[field])) {
          writes.push([storageKey(kind, lesson), value]);
        }
      }
      for (const lesson of new Set(practice.completedLessons)) {
        writes.push([storageKey("progress:lesson", lesson), "1"]);
      }

      const current = readHistory();
      const historyChanged = Object.entries(progress).some(([id, record]) =>
        JSON.stringify(record) !== JSON.stringify(current[id]));
      if (historyChanged) {
        // Change the history revision only after all practice records are written.
        writes.push(prepareHistoryWrite({...current, ...progress}));
      }
      updateStorage(writes);
      return historyChanged;
    }

    function deleteCourseData() {
      const lessonPrefixes = [...kinds.map(([, , kind]) => kind), "progress:lesson", "progress:quiz"]
        .map(kind => storageKey(kind, ""));
      const quizPrefix = "dotnet-courses:quiz:v2:" + course + ":";
      const revisionKey = quizPrefix + "import";
      const legacyKeys = new Set([
        "dotnet-courses:fsrs-7:v1:" + course,
        "dotnet-courses:quiz-drafts:v1:" + course
      ]);
      let legacyPractice;
      if (course === "memory") {
        legacyKeys.add("dotnet-learning:quiz-drafts:memory");
        legacyPractice = /^dotnet-learning:practice:ALLOC-TASK-\d+$/;
      } else if (course === "csharp-dotnet-9-11") {
        legacyKeys.add("dotnet-learning:quiz-drafts");
        legacyPractice = /^dotnet-learning:practice:TASK-\d+$/;
      }
      const quizEntry = /^(?:(?:card|draft):[^:]+|lesson:[1-9]\d*(?::assessment:[^:]+)?)$/;
      const keys = Array.from({length: localStorage.length}, (_, index) => localStorage.key(index));
      const writes = keys.filter(key => key !== null && (
        legacyKeys.has(key) || legacyPractice?.test(key) ||
        (key.startsWith(quizPrefix) && quizEntry.test(key.slice(quizPrefix.length))) ||
        lessonPrefixes.some(prefix => key.startsWith(prefix) && /^[1-9]\d*$/.test(key.slice(prefix.length)))
      )).map(key => [key, null]);
      // Remove the quiz revision last, so readers cannot see an older card during deletion.
      writes.push([revisionKey, null]);
      updateStorage(writes);
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
      deleteButton.disabled = true;
      let historyChanged;
      let skipped;
      try {
        if (file.size > 10_000_000) throw Error("Нужен JSON-файл размером не более 10 МБ.");
        const data = validate(JSON.parse(await file.text()));
        if (!window.confirm("Импортировать резервную копию? Записи для вопросов и уроков из файла заменят соответствующие данные в браузере.")) return;
        historyChanged = importData(data);
        skipped = data.skipped;
      } catch (error) {
        feedback.textContent = "Не удалось импортировать копию. " + error.message;
        return;
      } finally {
        importButton.disabled = false;
        deleteButton.disabled = false;
      }
      feedback.textContent = "Копия импортирована." +
        (skipped ? " Пропущено записей вне актуальной программы — " + skipped + "." : "");
      onImported(historyChanged);
    });
    deleteButton.addEventListener("click", () => {
      if (!window.confirm("Удалить прогресс этого курса из браузера? Будут удалены сохранённые ответы, история попыток и расписание FSRS, отметки о выполненной практике, черновики C# и успешные решения.")) return;
      try {
        deleteCourseData();
      } catch (error) {
        feedback.textContent = "Не удалось удалить прогресс курса. " + error.message;
        return;
      }
      feedback.textContent = "Прогресс курса удалён.";
      onImported(true);
    });
    for (const button of [exportButton, importButton, deleteButton]) button.disabled = false;
  }

  window.DotnetCourseBackup = {attach};
})();
