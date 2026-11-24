/* Shared reusable browser runner for Jekyll C# lessons.
 * A single component attaches run buttons to C# examples and moves practice drafts
 * into the appropriate .NET WebAssembly/Roslyn compiler.
 */
(() => {
  "use strict";

  const normalize = value => value.replace(/\r\n?/g, "\n");
  const practiceImportPattern = /^(?:global\s+)?using\s+(?:(?:unsafe\s+)?@?[_\p{ID_Start}]\p{ID_Continue}*\s*=\s*[^;{}]+|(?:static\s+)?(?:global::)?[\w.@\p{L}]+(?:\s*<[^;{}]+>)?)\s*;/u;
  const preambleCommentPattern = /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/;

  // Only assembles visible C# from the lesson with the student's method.
  // All Assert checks come from the lesson's practice program.
  function buildTaskProgram(template, source, taskId) {
    const text = normalize(String(template)).trim();
    const shape = splitTaskProgram(text, taskId);
    if (!shape) {
      throw Error("Проверочный C#-пример урока отсутствует или повреждён.");
    }
    const {entries, body: method} = splitPracticeSource(String(source));
    const knownImports = new Set(splitPracticeSource(text).entries.map(entry => entry.key).filter(Boolean));
    const extraImports = [];
    for (const entry of entries) {
      if (entry.key && knownImports.has(entry.key)) continue;
      extraImports.push(entry.text);
      if (entry.key) knownImports.add(entry.key);
    }
    const body = method.replace(/^\n+/, "").trimEnd();
    if (!body.trim()) throw Error("В задании нет стартового метода.");
    return (extraImports.length ? extraImports.join("\n") + "\n" : "") +
      shape.before + "\n" + body + "\n" + shape.after + "\n";
  }

  function splitPracticeSource(value) {
    const source = normalize(value);
    const entries = [];
    let end = 0;
    while (end < source.length) {
      const remaining = source.slice(end);
      const next = remaining.trimStart();
      const directive = next.match(practiceImportPattern)?.[0];
      const text = directive ?? next.match(preambleCommentPattern)?.[0];
      if (!text) break;
      const key = directive?.replace(/\s+/g, " ").replace(/\s*([=;])\s*/g, "$1");
      entries.push({ text, key });
      end += remaining.length - next.length + text.length;
    }
    return { entries, preamble: source.slice(0, end).trim(), body: source.slice(end) };
  }

  function practiceSource(value) {
    return splitPracticeSource(value).body.split("\n").map(line => line.trim()).filter(Boolean).join("\n");
  }

  function splitTaskProgram(source, taskId) {
    const lines = source.split("\n");
    const start = lines.findIndex(line => line.trim() === "// BEGIN " + taskId);
    const end = lines.findLastIndex(line => line.trim() === "// END " + taskId);
    if (start < 0 || end <= start) return null;
    return {
      before: lines.slice(0, start + 1).join("\n"),
      method: lines.slice(start + 1, end).join("\n"),
      after: lines.slice(end).join("\n")
    };
  }

  function extractTaskSource(source, taskId) {
    const {preamble, body} = splitPracticeSource(source);
    const parts = splitTaskProgram(body, taskId);
    if (!parts?.method.trim()) return null;
    return (preamble ? preamble + "\n\n" : "") + parts.method + "\n";
  }

  function matchesPracticeSource(template, source, taskId) {
    const original = splitTaskProgram(practiceSource(template), taskId);
    const current = splitTaskProgram(practiceSource(source), taskId);
    return !!original && !!current?.method &&
      original.before === current.before && original.after === current.after;
  }

  function isSuccessfulPracticeRun(template, source, output, taskId) {
    if (typeof template !== "string" || typeof source !== "string" || typeof output !== "string") return false;
    if (normalize(output).trimEnd().split("\n").at(-1) !== "Все проверки пройдены") return false;

    return matchesPracticeSource(template, source, taskId);
  }

  if (typeof module === "object" && module.exports) module.exports = {buildTaskProgram, extractTaskSource, isSuccessfulPracticeRun};
  if (typeof document === "undefined") return;
  const frame = document.getElementById("course-compiler");
  if (!frame) return;
  const lesson = Number(frame.dataset.lesson);
  const course = frame.dataset.course;
  const taskId = (course === "memory" ? "ALLOC-TASK-" : "TASK-") + String(lesson).padStart(3, "0");
  const practiceDraftKey = "dotnet-courses:practice-draft:" + course + ":" + lesson;
  let lastLoadedCode = null;
  let practiceButton = null;
  const provider = window.DotnetLessonSnippets;

  function bridge() {
    try {
      const win = frame.contentWindow;
      if (!win || win.location.origin !== location.origin) return null;
      const editor = win.document.getElementById("code-editor");
      if (!editor) return null;
      const api = win.DotnetBrowserEditor;
      if (api && typeof api.setCode === "function") return api;
      // Minimal fallback if the shared editor script itself is unavailable.
      const run = win.document.querySelector(".compile-btn");
      if (!run) return null;
      return {
        setCode(value) {
          const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) setter.call(editor, value); else editor.value = value;
          editor.dispatchEvent(new win.Event("input", {bubbles:true}));
          return true;
        },
        getCode: () => editor.value,
        focus: () => editor.focus(),
        run: () => {if (run.disabled) return false; run.click(); return true;},
        busy: () => run.disabled
      };
    } catch { return null; }
  }

  function show(button, message) {
    const messageEl = button.closest(".practice-actions")?.querySelector(".practice-feedback");
    if (messageEl) messageEl.textContent = message;
  }

  function readPracticeDraft() {
    try {
      return localStorage.getItem(practiceDraftKey);
    } catch {
      return null;
    }
  }

  function refreshPracticeButton() {
    if (practiceButton) {
      practiceButton.textContent = readPracticeDraft() ? "Открыть черновик" : "Открыть заготовку";
    }
  }

  function send(button, prepareCode, {run = true, replaceConfirmed = false} = {}) {
    const api = bridge();
    if (!api) {
      show(button, "Компилятор ещё загружается. Повтори после появления редактора.");
      return;
    }
    if (api.busy()) {
      show(button, "Компилятор занят предыдущим запуском.");
      return;
    }

    const current = api.getCode();
    let code;
    try {
      code = prepareCode(current);
    } catch (error) {
      show(button, error.message);
      return;
    }
    if (code === null) return;
    let savedPractice = false;
    if (code !== current) {
      if (!replaceConfirmed && current.trim() && current !== lastLoadedCode && !api.isInitialCode?.() &&
          !window.confirm("Заменить текущий код в редакторе? Чтобы сохранить весь файл отдельно, сначала скопируй или скачай Program.cs.")) {
        show(button, "Текущий код оставлен в редакторе.");
        return;
      }
      const workingMethod = extractTaskSource(current, taskId);
      if (workingMethod) {
        try {
          localStorage.setItem(practiceDraftKey, workingMethod);
          refreshPracticeButton();
          savedPractice = true;
        } catch {
          show(button, "Браузер не смог сохранить черновик задания. Код остался в редакторе. Для резервной копии скачай Program.cs.");
          return;
        }
      }
      if (!api.setCode(code)) {
        show(button, "Редактор ещё не готов к загрузке.");
        return;
      }
      lastLoadedCode = code;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    frame.scrollIntoView({behavior: reduceMotion ? "instant" : "smooth", block: "start"});
    if (!run) {
      api.focus?.();
      show(button, "Код задания открыт в редакторе. Для проверки нажми «Запустить текущий код».");
      return true;
    }
    show(button, savedPractice ? "Черновик задания сохранён. Результат примера появится в консоли." : "Результат появится в консоли редактора.");
    if (code === current) {
      if (!api.run()) show(button, "Запуск не начался. Проверь кнопку запуска.");
      return;
    }
    // Give the Blazor oninput binding a turn to receive the replacement.
    setTimeout(() => {
      if (api.getCode() !== code) {
        show(button, "Код изменился. Запусти текущую версию из редактора.");
      } else if (!api.run()) {
        show(button, "Запуск не начался. Проверь кнопку запуска.");
      }
    }, 170);
  }

  const codeBlock = block => block?.matches("pre") ? block : block?.querySelector("pre");

  function createPracticeArea() {
    const block = document.getElementById("practice-program");
    const template = codeBlock(block);
    if (!template) return null;
    const parts = splitTaskProgram(normalize(template.textContent), taskId);
    if (!parts?.method.trim()) {
      const error = document.createElement("p");
      error.setAttribute("role", "status");
      error.textContent = "Не удалось открыть заготовку. Скачай программу из блока кода или скопируй её для локального запуска.";
      block.insertAdjacentElement("afterend", error);
      return null;
    }

    const field = document.createElement("textarea");
    field.id = "solution-" + taskId;
    field.className = "code-editor";
    field.readOnly = true;
    field.spellcheck = false;
    field.defaultValue = parts.method.trimEnd();
    field.rows = Math.min(14, Math.max(5, field.defaultValue.split("\n").length));

    const label = document.createElement("label");
    label.htmlFor = field.id;
    label.className = "editor-label";
    label.textContent = "Заготовка задания";

    const actions = document.createElement("div");
    actions.className = "practice-actions";
    actions.dataset.practiceActions = taskId;
    const feedback = document.createElement("span");
    feedback.className = "practice-feedback";
    feedback.setAttribute("role", "status");
    actions.append(feedback);

    const area = document.createElement("div");
    area.append(label, field, actions);
    const renderedBlock = block.closest(".code-wrap") ?? block;
    renderedBlock.insertAdjacentElement("afterend", area);
    renderedBlock.hidden = true;
    return {template, field, actions};
  }

  function addTaskButtons() {
    const completion = document.getElementById("lesson-completion-status");
    if (!completion) return;
    const starter = createPracticeArea();
    if (!starter) return;
    const {template: templateElement, field: task, actions} = starter;

    const open = document.createElement("button");
    open.type = "button"; open.className = "button primary";
    practiceButton = open;
    refreshPracticeButton();
    actions.append(open);

    const migration = document.createElement("div");
    migration.hidden = true;
    const migrationActions = document.createElement("div");
    migrationActions.className = "practice-actions";
    const migrationNote = document.createElement("span");
    migrationNote.className = "practice-feedback";
    migrationNote.setAttribute("role", "status");
    const updateChecks = document.createElement("button");
    updateChecks.type = "button";
    updateChecks.className = "button";
    updateChecks.textContent = "Обновить проверки";
    const downloadPrevious = document.createElement("button");
    downloadPrevious.type = "button";
    downloadPrevious.className = "button";
    downloadPrevious.textContent = "Скачать прежний Program.cs";
    migrationActions.append(updateChecks, downloadPrevious, migrationNote);
    migration.append(migrationActions);
    actions.insertAdjacentElement("afterend", migration);

    let previousProgram = null;
    downloadPrevious.addEventListener("click", () => {
      const current = bridge()?.getCode();
      if (current && extractTaskSource(current, taskId) &&
          !matchesPracticeSource(templateElement.textContent, current, taskId)) previousProgram = current;
      if (previousProgram) {
        window.DotnetLearning.download("Program.previous.cs", previousProgram);
        show(downloadPrevious, "Прежний файл сохранён в Program.previous.cs.");
      }
    });
    updateChecks.addEventListener("click", () => {
      if (send(updateChecks, current => {
        const currentMethod = extractTaskSource(current, taskId);
        if (!currentMethod) {
          show(updateChecks, "Открой черновик задания, чтобы обновить проверки.");
          return null;
        }
        const template = templateElement.textContent;
        if (matchesPracticeSource(template, current, taskId)) return current;
        previousProgram = current;
        return buildTaskProgram(template, currentMethod, taskId);
      }, {run: false, replaceConfirmed: true})) {
        updateChecks.remove();
        show(downloadPrevious, "Актуальные проверки загружены. Запусти текущий код для проверки.");
      }
    });

    const verifiedKey = "dotnet-courses:practice-verified:" + course + ":" + lesson;
    const verifiedSection = document.createElement("section");
    verifiedSection.hidden = true;
    const verifiedField = document.createElement("textarea");
    verifiedField.id = "verified-" + taskId;
    verifiedField.className = task.className;
    verifiedField.rows = task.rows;
    verifiedField.spellcheck = false;
    verifiedField.readOnly = true;

    const label = document.createElement("label");
    label.htmlFor = verifiedField.id;
    label.className = "editor-label";
    label.textContent = "Последнее успешное решение";

    const verifiedActions = document.createElement("div");
    verifiedActions.className = "practice-actions";
    const note = document.createElement("span");
    note.className = "practice-feedback";
    note.setAttribute("role", "status");
    const copy = document.createElement("button");
    copy.type = "button"; copy.className = "button";
    copy.textContent = "Скопировать решение";
    copy.addEventListener("click", async () => {
      try {
        await window.DotnetLearning.copy(verifiedField.value);
        note.textContent = "Решение скопировано.";
      } catch {
        note.textContent = "Не удалось скопировать. Выдели код вручную.";
      }
    });
    const download = document.createElement("button");
    download.type = "button"; download.className = "button";
    download.textContent = "Скачать решение .cs";
    download.addEventListener("click", () => {
      window.DotnetLearning.download(taskId + ".cs", verifiedField.value);
      note.textContent = "Решение скачано.";
    });
    verifiedActions.append(copy, download, note);
    verifiedSection.append(label, verifiedField, verifiedActions);
    migration.insertAdjacentElement("afterend", verifiedSection);

    function showVerified(source, message) {
      verifiedField.value = source;
      note.textContent = message;
      verifiedSection.hidden = false;
    }

    try {
      const verified = localStorage.getItem(verifiedKey);
      if (verified?.trim()) showVerified(verified, "Решение восстановлено из этого браузера.");
    } catch {
      show(open, "Не удалось прочитать сохранённое решение в этом браузере.");
    }

    open.addEventListener("click", () => {
      send(open, current => {
        if (extractTaskSource(current, taskId)) {
          if (matchesPracticeSource(templateElement.textContent, current, taskId)) return current;
          previousProgram = current;
          migrationActions.prepend(updateChecks);
          migration.hidden = false;
          show(updateChecks, "Проверки в открытом файле отличаются от версии урока. При обновлении сохранятся метод и директивы using.");
          return null;
        }
        const source = readPracticeDraft() ?? task.defaultValue;
        return buildTaskProgram(templateElement.textContent, source, taskId);
      }, {run: false});
    });

    window.addEventListener("storage", event => {
      if (event.key === null || event.key === practiceDraftKey) refreshPracticeButton();
    });
    window.addEventListener("message", event => {
      const result = event.data;
      if (event.origin !== location.origin || event.source !== frame.contentWindow ||
          result?.type !== "dotnet-courses:practice-run-success") return;
      if (!isSuccessfulPracticeRun(templateElement.textContent, result.source, result.output, taskId)) {
        if (typeof result.source === "string" && result.source.includes("// BEGIN " + taskId) &&
            window.DotnetLearning.progress.get("lesson", course, lesson) !== true) {
          completion.textContent = "Отметка не поставлена. Запусти своё решение с исходными проверками урока.";
        }
        return;
      }
      const verified = extractTaskSource(result.source, taskId);
      if (!verified) return;
      try {
        localStorage.setItem(verifiedKey, verified);
        showVerified(verified, "Решение сохранено в этом браузере.");
      } catch {
        showVerified(verified, "Чтобы сохранить решение, скачай .cs.");
      }
      if (!window.DotnetLearning.progress.mark("lesson", course, lesson)) {
        completion.textContent = "Проверки пройдены, но отметку сохранить не удалось.";
      }
    });
  }

  function addCodeButtons() {
    const startId = frame.dataset.startSnippet;
    const prefix = "snippet-";
    const examples = [...document.querySelectorAll('.prose [id^="snippet-"]')]
      .map(block => ({pre: codeBlock(block), id: block.id.slice(prefix.length)}))
      .filter(example => example.pre);
    function prepare({pre, id}) {
      if (provider?.snippetIds.includes(id)) return provider.makeRunnable(pre.textContent, id);
      if (!provider && frame.dataset.snippetAdapter && id !== startId) {
        throw Error("Не загрузился адаптер примеров этого урока.");
      }
      return pre.textContent;
    }
    examples.forEach((example, i) => {
      const holder = example.pre.closest(".code-wrap") || example.pre;
      const actions=document.createElement("div");
      actions.className="practice-actions snippet-actions";
      const button=document.createElement("button");
      button.type="button";button.className="button";
      button.dataset.exampleId = example.id;
      const label = "Запустить этот пример";
      button.textContent = "▶ " + label;
      button.setAttribute("aria-label", label + " · C#-пример №" + (i + 1));
      const feedback=document.createElement("span");
      feedback.className="practice-feedback";feedback.setAttribute("role","status");
      actions.append(button,feedback);
      holder.insertAdjacentElement("afterend",actions);
      button.addEventListener("click",()=>{
        let source;
        try {source=prepare(example);}
        catch(error){show(button,"Ошибка подготовки: "+error.message);return;}
        send(button, () => source);
      });
    });
    if (!startId) return null;
    return () => {
      const initialExample = examples.find(example => example.id === startId);
      if (!initialExample) throw Error("Не найден стартовый пример: " + startId + ".");
      return prepare(initialExample);
    };
  }

  function protobufBytes(fieldNumber, bytes) {
    const header = [(fieldNumber << 3) | 2];
    let length = bytes.length;
    while (length >= 128) {
      header.push((length & 127) | 128);
      length = Math.floor(length / 128);
    }
    header.push(length);
    const field = new Uint8Array(header.length + bytes.length);
    field.set(header);
    field.set(bytes, header.length);
    return field;
  }

  async function dotnetLabUrl(source) {
    // .NET Lab's share links use raw DEFLATE and Base64URL around a protobuf
    // SavedState. InputCode has filename/text fields 1/2. SavedState has
    // inputs in field 1 and the selected output (the console) in field 9.
    const encoder = new TextEncoder();
    const fileName = protobufBytes(1, encoder.encode("Program.cs"));
    const fileText = protobufBytes(2, encoder.encode(source));
    const input = new Uint8Array(fileName.length + fileText.length);
    input.set(fileName);
    input.set(fileText, fileName.length);
    const state = new Blob([protobufBytes(1, input), protobufBytes(9, encoder.encode("run"))]);

    let compressor;
    let hasZlibWrapper = false;
    try {
      compressor = new CompressionStream("deflate-raw");
    } catch {
      compressor = new CompressionStream("deflate");
      hasZlibWrapper = true;
    }
    const compressed = new Uint8Array(await new Response(state.stream().pipeThrough(compressor)).arrayBuffer());
    // Older implementations support DEFLATE in a zlib wrapper. Remove the
    // two-byte header and four-byte Adler-32 checksum for the raw format.
    const raw = hasZlibWrapper ? compressed.subarray(2, -4) : compressed;
    let binary = "";
    for (let start = 0; start < raw.length; start += 8192) {
      binary += String.fromCharCode(...raw.subarray(start, start + 8192));
    }
    const slug = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    return "https://lab.razor.fyi/#" + slug;
  }

  function addEditorFullscreen() {
    const workspace = document.getElementById("lesson-editor-workspace");
    const toggle = document.getElementById("page-editor-fullscreen");
    if (!workspace || !toggle) return;

    const background = [];
    let expanded = false;
    let nativeFullscreen = false;
    let changing = false;
    let scrollPosition;

    function setExpanded(value) {
      if (expanded === value) return;
      expanded = value;
      workspace.classList.toggle("is-expanded", expanded);
      document.documentElement.classList.toggle("lesson-editor-expanded", expanded);
      connectFrame();
      workspace.setAttribute("role", expanded ? "dialog" : "region");
      toggle.textContent = expanded ? "Свернуть" : "На весь экран";
      toggle.setAttribute("aria-label", expanded ? "Свернуть полноэкранный редактор" : "На весь экран");

      if (expanded) {
        workspace.setAttribute("aria-modal", "true");
        // Keep the same iframe in place and take the rest of the lesson out of the tab order.
        for (let node = workspace; node !== document.body; node = node.parentElement) {
          for (const sibling of node.parentElement.children) {
            if (sibling === node || sibling.hasAttribute("inert")) continue;
            sibling.setAttribute("inert", "");
            background.push(sibling);
          }
        }
      } else {
        workspace.removeAttribute("aria-modal");
        for (const element of background) element.removeAttribute("inert");
        background.length = 0;
        window.scrollTo(scrollPosition);
      }
      toggle.focus({ preventScroll: true });
    }

    async function changeFullscreen() {
      if (changing) return;
      changing = true;
      try {
        if (expanded) {
          if (document.fullscreenElement === workspace) {
            try { await document.exitFullscreen(); }
            catch { if (document.fullscreenElement === workspace) return; }
          }
          setExpanded(false);
          return;
        }

        scrollPosition = { left: window.scrollX, top: window.scrollY, behavior: "instant" };
        if (document.fullscreenEnabled && workspace.requestFullscreen) {
          try { await workspace.requestFullscreen(); }
          catch { /* Some browsers or hosts only allow expanding within the viewport. */ }
        }
        setExpanded(true);
      } finally {
        changing = false;
      }
    }

    function closeOnEscape(event) {
      if (!expanded || event.defaultPrevented || event.key !== "Escape") return;
      if (event.currentTarget.querySelector(".CodeMirror-hints")) return;
      event.preventDefault();
      event.stopPropagation();
      changeFullscreen();
    }

    function connectFrame() {
      const editor = frame.contentDocument;
      editor?.documentElement?.classList.toggle("course-editor-fullscreen", expanded);
      // CodeMirror also binds Escape, so handle it before its editor keymap.
      editor?.addEventListener("keydown", closeOnEscape, true);
    }

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement === workspace) {
        nativeFullscreen = true;
      } else if (nativeFullscreen) {
        nativeFullscreen = false;
        setExpanded(false);
      }
    });
    document.addEventListener("keydown", closeOnEscape);
    frame.addEventListener("load", connectFrame);
    connectFrame();
    toggle.addEventListener("click", changeFullscreen);
    toggle.hidden = false;
  }

  // Controls live on the lesson page, outside the iframe. They work even if
  // the embedded CodeMirror's own toolbar is hidden by the compiler layout.
  function addEditorToolbar(prepareInitialExample) {
    const run = document.getElementById("page-editor-run");
    const output = document.getElementById("page-editor-output");
    const copy = document.getElementById("page-editor-copy");
    const download = document.getElementById("page-editor-download");
    const dotnetLab = document.getElementById("page-editor-dotnet-lab");
    const status = document.getElementById("page-editor-feedback");
    if (!run || !copy || !download || !status) return;
    let initialized = false;
    function editorReady() {
      const api = bridge();
      if (initialized || !api) return;
      initialized = true;
      try {
        if (prepareInitialExample && api.setInitialCode) api.setInitialCode(prepareInitialExample());
        status.textContent = "Редактор готов к запуску.";
      } catch (error) {
        status.textContent = "Не удалось открыть стартовый пример. " + error.message;
      }
    }
    window.addEventListener("message", event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow ||
          event.data?.type !== "dotnet-courses:compiler-state") return;
      switch (event.data.state) {
        case "ready":
          editorReady();
          break;
        case "running":
          status.textContent = "Выполняется текущий код.";
          break;
        case "complete":
          status.textContent = "Запуск завершён. Результат в выводе программы.";
          break;
        case "error":
          status.textContent = "Ошибка запуска. Подробности в выводе программы.";
          break;
      }
    });
    frame.addEventListener("load", editorReady);
    editorReady();
    const getEditor = () => {
      const api = bridge();
      if (!api) status.textContent = "Редактор ещё загружается. Попробуй после появления кода.";
      return api;
    };
    run.addEventListener("click", () => {
      const api = getEditor();
      if (!api) return;
      if (api.busy()) { status.textContent = "Компилятор ещё загружается или занят."; return; }
      if (api.run()) status.textContent = "Выполняется текущий код.";
      else status.textContent = "Запуск пока недоступен. Проверь состояние компилятора.";
    });
    output?.addEventListener("click", () => {
      const api = getEditor();
      if (api && !api.focusOutput?.()) status.textContent = "Вывод программы пока недоступен.";
    });
    copy.addEventListener("click", async () => {
      const api = getEditor();
      if (!api) return;
      try {
        await window.DotnetLearning.copy(api.getCode());
        status.textContent = "Весь текущий код скопирован.";
      } catch {
        status.textContent = "Не удалось скопировать. Выдели код вручную.";
      }
    });
    download.addEventListener("click", () => {
      const api = getEditor();
      if (!api) return;
      window.DotnetLearning.download("Program.cs", api.getCode());
      status.textContent = "Текущий код сохранён в Program.cs.";
    });
    dotnetLab?.addEventListener("click", async () => {
      const api = getEditor();
      if (!api) return;
      const source = api.getCode();
      // Open during the click, before async compression loses user activation.
      const tab = window.open("about:blank", "_blank");
      if (!tab) {
        status.textContent = "Браузер заблокировал новую вкладку .NET Lab.";
        return;
      }
      try {
        tab.opener = null;
        const url = await dotnetLabUrl(source);
        if (tab.closed) return;
        tab.location.replace(url);
        status.textContent = "Текущий код открыт в новой вкладке .NET Lab.";
      } catch {
        tab.close();
        status.textContent = "Не удалось открыть .NET Lab. Код можно перенести кнопкой «Копировать весь код».";
      }
    });
  }

  const init = () => {
    const prepareInitialExample = addCodeButtons();
    addTaskButtons();
    addEditorToolbar(prepareInitialExample);
    addEditorFullscreen();
  };
  // Wait for site.js to install shared progress and export helpers.
  if(document.readyState==="complete")init();
  else document.addEventListener("DOMContentLoaded",init,{once:true});
})();
