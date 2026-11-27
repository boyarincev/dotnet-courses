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
  const editorInputSelector = "#code-editor, .CodeMirror textarea";
  const lesson = Number(frame.dataset.lesson);
  const course = frame.dataset.course;
  const taskId = (course === "memory" ? "ALLOC-TASK-" : "TASK-") + String(lesson).padStart(3, "0");
  const practiceDraftKey = "dotnet-courses:practice-draft:" + course + ":" + lesson;
  let lastLoadedCode = null;
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

  function showRunFeedback(message) {
    const status = frame.contentDocument?.getElementById("editor-run-feedback");
    if (status) status.textContent = message;
  }

  function readPracticeDraft() {
    try {
      return localStorage.getItem(practiceDraftKey);
    } catch {
      return null;
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
          savedPractice = true;
        } catch {
          show(button, "Браузер не смог сохранить черновик задания. Код остался в редакторе. Для резервной копии скачай Program.cs.");
          return;
        }
      }
      if (!api.setCode(code, {focus: run})) {
        show(button, "Редактор ещё не готов к загрузке.");
        return;
      }
      lastLoadedCode = code;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollOptions = {behavior: reduceMotion ? "instant" : "smooth", block: "start"};
    if (!run) {
      const heading = frame.contentDocument?.getElementById("editor-heading");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({preventScroll: true});
      }
      frame.contentWindow.scrollTo({top: 0, behavior: "instant"});
      frame.scrollIntoView(scrollOptions);
      show(button, "Код задания открыт. Кнопка запуска находится под кодом.");
      return true;
    }
    frame.scrollIntoView(scrollOptions);
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
    const quizLink = document.querySelector("[data-lesson-quiz-link]");
    if (!completion) return;
    const starter = createPracticeArea();
    if (!starter) return;
    const {template: templateElement, field: task, actions} = starter;

    const open = document.createElement("button");
    open.type = "button"; open.className = "button primary";
    actions.append(open);

    const migration = document.createElement("div");
    migration.hidden = true;
    const migrationActions = document.createElement("div");
    migrationActions.className = "practice-actions";
    const migrationNote = document.createElement("span");
    migrationNote.className = "practice-feedback";
    migrationNote.setAttribute("role", "status");
    const updateFile = document.createElement("button");
    updateFile.type = "button";
    updateFile.className = "button";
    updateFile.textContent = "Обновить файл задания";
    const downloadPrevious = document.createElement("button");
    downloadPrevious.type = "button";
    downloadPrevious.className = "button";
    downloadPrevious.textContent = "Скачать прежний Program.cs";
    migrationActions.append(downloadPrevious, migrationNote);
    migration.append(migrationActions);
    actions.insertAdjacentElement("afterend", migration);

    let previousProgram = null;

    function needsUpdate(source) {
      return !matchesPracticeSource(templateElement.textContent, source, taskId);
    }

    function refreshPracticeActions(current = bridge()?.getCode()) {
      const taskOpen = !!current && !!extractTaskSource(current, taskId);
      const label = taskOpen ? "К коду задания" : readPracticeDraft() ? "Открыть черновик" : "Открыть заготовку";
      if (open.textContent !== label) open.textContent = label;

      const showUpdate = taskOpen && needsUpdate(current);
      if (showUpdate && !updateFile.isConnected) {
        migrationActions.prepend(updateFile);
        migrationNote.textContent = "Файл в редакторе отличается от актуального задания. Обновление перенесёт твой метод и директивы using в новый Program.cs.";
      } else if (!showUpdate && updateFile.isConnected) {
        updateFile.remove();
        migrationNote.textContent = "";
      }
      migration.hidden = !showUpdate && previousProgram === null;
    }

    function onEditorInput(event) {
      if (event.target.id === "code-editor") refreshPracticeActions(event.target.value);
    }

    function connectPracticeEditor() {
      frame.contentDocument?.addEventListener("input", onEditorInput);
      refreshPracticeActions();
    }

    downloadPrevious.addEventListener("click", () => {
      const current = bridge()?.getCode();
      const file = current && extractTaskSource(current, taskId) && needsUpdate(current) ? current : previousProgram;
      if (file) {
        window.DotnetLearning.download("Program.previous.cs", file);
        show(downloadPrevious, "Прежний файл сохранён в Program.previous.cs.");
      }
    });
    updateFile.addEventListener("click", () => {
      let replacedProgram;
      if (send(updateFile, current => {
        const currentMethod = extractTaskSource(current, taskId);
        if (!currentMethod) {
          show(updateFile, "Открой черновик, чтобы обновить файл задания.");
          return null;
        }
        if (!needsUpdate(current)) return current;
        replacedProgram = current;
        return buildTaskProgram(templateElement.textContent, currentMethod, taskId);
      }, {run: false, replaceConfirmed: true}) && replacedProgram) {
        previousProgram = replacedProgram;
        refreshPracticeActions();
        show(downloadPrevious, "Файл задания обновлён. Запусти текущий код для проверки.");
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
        if (extractTaskSource(current, taskId)) return current;
        const source = readPracticeDraft() ?? task.defaultValue;
        return buildTaskProgram(templateElement.textContent, source, taskId);
      }, {run: false});
    });

    frame.addEventListener("load", connectPracticeEditor);
    connectPracticeEditor();
    window.addEventListener("storage", event => {
      if (event.key === null || event.key === practiceDraftKey) refreshPracticeActions();
    });
    window.addEventListener("message", event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      const result = event.data;
      if (result?.type === "dotnet-courses:compiler-state" && result.state === "ready") connectPracticeEditor();
      if (result?.type !== "dotnet-courses:practice-run-success") return;
      if (!isSuccessfulPracticeRun(templateElement.textContent, result.source, result.output, taskId)) {
        if (typeof result.source === "string" && result.source.includes("// BEGIN " + taskId) &&
            window.DotnetLearning.progress.get("lesson", course, lesson) !== true) {
          showRunFeedback("Отметка не поставлена. Запусти своё решение с исходными проверками урока.");
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
      const quizWasHidden = quizLink?.hidden;
      if (!window.DotnetLearning.progress.mark("lesson", course, lesson)) {
        showRunFeedback("Проверки пройдены, но отметку сохранить не удалось.");
        return;
      }
      if (!quizWasHidden || quizLink.hidden) return;

      if (document.activeElement !== frame ||
          !frame.contentDocument?.activeElement?.matches(editorInputSelector + ", #editor-run-current")) return;
      const {top, bottom} = quizLink.getBoundingClientRect();
      if (top < 0 || bottom > window.innerHeight) {
        quizLink.closest(".lesson-practice-status")?.scrollIntoView({block: "nearest"});
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
    if (!workspace) return;

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
      const toggle = connectFrame();
      workspace.setAttribute("role", expanded ? "dialog" : "region");

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
      toggle?.focus({preventScroll: true});
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

    function handleEscape(event) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat) return;
      // Let CodeMirror dismiss its suggestions before moving focus.
      if (event.currentTarget.querySelector(".CodeMirror-hints")) return;
      const run = event.target.matches?.(editorInputSelector)
        ? event.currentTarget.getElementById("editor-run-current") : null;
      if (!run && !expanded) return;
      event.preventDefault();
      event.stopPropagation();
      if (run) run.focus();
      else changeFullscreen();
    }

    function toggleOnClick(event) {
      if (event.target.closest("#editor-fullscreen")) changeFullscreen();
    }

    function connectFrame() {
      const editor = frame.contentDocument;
      if (!editor) return;
      editor.documentElement?.classList.toggle("course-editor-fullscreen", expanded);
      editor.addEventListener("keydown", handleEscape, true);
      editor.addEventListener("click", toggleOnClick);
      const toggle = editor.getElementById("editor-fullscreen");
      if (toggle) {
        const label = expanded ? "Свернуть полноэкранный редактор" : "На весь экран";
        toggle.setAttribute("aria-label", label);
        toggle.title = label;
      }
      return toggle;
    }

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement === workspace) {
        nativeFullscreen = true;
      } else if (nativeFullscreen) {
        nativeFullscreen = false;
        setExpanded(false);
      }
    });
    document.addEventListener("keydown", handleEscape);
    frame.addEventListener("load", connectFrame);
    connectFrame();
  }

  function addEditorActions(prepareInitialExample) {
    const copy = document.getElementById("page-editor-copy");
    const download = document.getElementById("page-editor-download");
    const status = document.getElementById("page-editor-export-feedback");
    if (!copy || !download || !status) return;
    let initializedEditor;
    function editorReady() {
      const editor = frame.contentDocument;
      editor?.addEventListener("click", openLab);
      const api = bridge();
      if (initializedEditor === editor || !api) return;
      initializedEditor = editor;
      try {
        if (prepareInitialExample && api.setInitialCode) api.setInitialCode(prepareInitialExample());
      } catch (error) {
        showRunFeedback("Не удалось открыть стартовый пример. " + error.message);
      }
    }
    window.addEventListener("message", event => {
      if (event.origin === location.origin && event.source === frame.contentWindow &&
          event.data?.type === "dotnet-courses:compiler-state" && event.data.state === "ready") editorReady();
    });
    frame.addEventListener("load", editorReady);
    editorReady();
    const getEditor = () => {
      const api = bridge();
      if (!api) status.textContent = "Редактор ещё загружается. Попробуй после появления кода.";
      return api;
    };
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
    async function openLab(event) {
      if (!event.target.closest("#editor-dotnet-lab")) return;
      const api = bridge();
      if (!api) return;
      const feedback = event.currentTarget.getElementById("editor-run-feedback");
      const blocked = "Браузер заблокировал новую вкладку .NET Lab.";
      const failed = "Не удалось открыть .NET Lab. Код можно перенести кнопкой «Копировать весь код».";
      const source = api.getCode();
      // Open during the click, before async compression loses user activation.
      const tab = window.open("about:blank", "_blank");
      if (!tab) {
        showRunFeedback(blocked);
        return;
      }
      try {
        tab.opener = null;
        const url = await dotnetLabUrl(source);
        if (tab.closed) return;
        tab.location.replace(url);
        if (feedback && (feedback.textContent === blocked || feedback.textContent === failed)) feedback.textContent = "";
      } catch {
        tab.close();
        showRunFeedback(failed);
      }
    }
  }

  const init = () => {
    const prepareInitialExample = addCodeButtons();
    addTaskButtons();
    addEditorActions(prepareInitialExample);
    addEditorFullscreen();
  };
  // Wait for site.js to install shared progress and export helpers.
  if(document.readyState==="complete")init();
  else document.addEventListener("DOMContentLoaded",init,{once:true});
})();
