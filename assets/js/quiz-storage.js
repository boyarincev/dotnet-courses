(() => {
  "use strict";

  function read(key) {
    return JSON.parse(localStorage.getItem(key));
  }

  function forCourse(course) {
    const prefix = "dotnet-courses:quiz:v2:" + course + ":";
    const cardPrefix = prefix + "card:";
    const importKey = prefix + "import";

    function readRevision() {
      const data = read(importKey);
      if (data === null) return {revision: "initial", progress: {}};
      if (typeof data.revision !== "string" || !data.progress ||
          typeof data.progress !== "object" || Array.isArray(data.progress)) {
        throw new Error("Некорректная резервная копия прогресса курса");
      }
      return data;
    }

    function readRecord(id, data) {
      const override = read(cardPrefix + id);
      if (override?.revision === data.revision) return override.value;
      return Object.hasOwn(data.progress, id) ? data.progress[id] : undefined;
    }

    function writeRecord(id, revision, value) {
      localStorage.setItem(cardPrefix + id, JSON.stringify({revision, value}));
    }

    return {
      importKey,
      changed(key) {
        return key === null || key === importKey || key.startsWith(cardPrefix);
      },
      record(id) {
        return readRecord(id, readRevision());
      },
      records(ids) {
        const data = readRevision();
        const records = [];
        for (const id of ids) {
          const record = readRecord(id, data);
          if (record) records.push([id, record]);
        }
        return Object.fromEntries(records);
      },
      grade(engine, id, rating, answer, {allowEarlyHistory = false, now = new Date()} = {}) {
        const data = readRevision();
        const record = engine.evaluate(readRecord(id, data), id, rating, answer, now, {allowEarlyHistory});
        writeRecord(id, data.revision, record);
        return record;
      },
      seed(engine, ids, now = new Date()) {
        const data = readRevision();
        let created = 0;
        for (const id of ids) {
          if (readRecord(id, data)?.card) continue;
          writeRecord(id, data.revision, engine.seed(id, now));
          created++;
        }
        return created;
      },
      prepareHistoryWrite(progress) {
        return [importKey, JSON.stringify({revision: crypto.randomUUID(), progress})];
      }
    };
  }

  window.DotnetQuizStorage = {forCourse};
})();
