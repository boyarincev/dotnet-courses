/* Shared reusable browser runner for Jekyll C# lessons.
 * A single component attaches run buttons to C# examples and moves practice drafts
 * into the appropriate .NET WebAssembly/Roslyn compiler.
 */
(() => {
  "use strict";

  const normalize = value => value.replace(/\r\n?/g, "\n");
  const solutionMarker = "// INSERT_SOLUTION_HERE";
  const practiceImportPattern = /^(?:global\s+)?using\s+(?:(?:static\s+)|(?:\w+\s*=\s*))?(?:global::)?[\w.]+\s*;$/;

  const currentInstructionsHeading = "// Актуальное условие из урока";

  function removePreviousInstructions(leading, previousBlocks) {
    const lines = leading.match(/[^\n]+\n?|\n/g) || [];
    const trimmed = lines.map(line => line.trim());
    const kept = [];
    for (let index = 0; index < lines.length;) {
      const start = trimmed[index] === currentInstructionsHeading ? index + 1 : index;
      const block = previousBlocks.find(block =>
        block.every((line, offset) => trimmed[start + offset] === line)
      );
      if (block) index = start + block.length;
      else kept.push(lines[index++]);
    }
    return kept.join("");
  }

  function addTaskInstructions(source, starter, previousInstructions = "", onlyReplacePrevious = false) {
    const opening = normalize(starter).match(
      /^[ \t]*(static\b[^{]*?)\{[ \t]*\n((?:[ \t]*\/\/[^\n]*\n)+)[ \t\n]*throw new NotImplementedException\(\);/m
    );
    if (!opening || !source.trim()) return source;

    const instructions = opening[2].trim().split("\n").map(line => line.trim());
    const guidance = [currentInstructionsHeading, ...instructions];

    // Only insert inside a body if the source starts with the known signature,
    // after ordinary imports and line comments. Otherwise keep the code intact.
    let offset = 0;
    for (const line of source.match(/[^\n]*\n/g) || []) {
      const trimmed = line.trim();
      if (trimmed && !practiceImportPattern.test(trimmed) && !trimmed.startsWith("//")) break;
      offset += line.length;
    }
    let prefix = source.slice(0, offset);
    const methodSource = source.slice(offset);
    const tokens = opening[1].match(/\w+|\S/g);
    const signature = tokens.map((token, index) => {
      const needsSpace = index > 0 && /^\w/.test(tokens[index - 1]) && /^\w/.test(token);
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, character => "\\" + character);
      return (needsSpace ? "\\s+" : "\\s*") + escaped;
    }).join("");
    const method = methodSource.match(new RegExp(
      "^([ \\t]*)(?:(?:public|internal|protected|private)\\s+)?" + signature + "\\s*\\{"
    ));
    const brace = method?.[0].length ?? 0;
    const existingNewline = method ? methodSource.slice(brace).match(/^[ \t]*\r?\n/)?.[0] || "" : "";
    const at = brace + existingNewline.length;
    const methodOpening = methodSource.slice(0, at);
    let body = methodSource.slice(at);

    const previousBlocks = normalize(previousInstructions).trim().split(/\n[ \t]*\n/)
      .map(block => block.split("\n").map(line => line.trim()))
      .filter(block => block.every(line => line.startsWith("//")));
    if (previousBlocks.length) {
      // Match complete historical blocks only in the leading lines, preserving all other bytes.
      prefix = removePreviousInstructions(prefix, previousBlocks);
      if (existingNewline) {
        const comments = body.match(/^(?:[ \t]*(?:\/\/[^\r\n]*)?\r?\n)*/)[0];
        body = removePreviousInstructions(comments, previousBlocks) + body.slice(comments.length);
      }
    }

    const restored = prefix + methodOpening + body;
    if (onlyReplacePrevious && restored === source) return source;
    const existing = "\n" + normalize(restored).split("\n").map(line => line.trim()).join("\n") + "\n";
    if (existing.includes("\n" + instructions.join("\n") + "\n")) return restored;

    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    if (!method) return prefix + guidance.join(newline) + newline + body;

    const comments = guidance.map(line => method[1] + "    " + line).join(newline);
    return prefix + methodOpening + (existingNewline ? "" : newline) + comments + newline + body;
  }

  // Only assembles visible C# from the lesson with the student's method.
  // All Assert checks are plain C# in each lesson's practice-program-template.
  function buildTaskProgram(template, source, taskId) {
    const text = String(template).trim();
    const value = normalize(String(source));
    if (text.split(solutionMarker).length !== 2 ||
        !text.includes("// BEGIN " + taskId) ||
        !text.includes("// END " + taskId)) {
      throw Error("Проверочный C#-пример урока отсутствует или повреждён.");
    }
    const {imports, bodyLines} = splitPracticeSource(value);
    const templateImports = new Set(splitPracticeSource(text).imports.map(line => line.trim()));
    const extraImports = [...new Set(imports.map(line => line.trim()))].filter(line => !templateImports.has(line));
    const body = bodyLines.join("\n").trim();
    if (!body) throw Error("В задании нет стартового метода.");
    return (extraImports.length ? extraImports.join("\n") + "\n" : "") +
      text.replace(solutionMarker, () => body) + "\n";
  }

  function splitPracticeSource(value) {
    const lines = normalize(value).split("\n");
    const imports = [];
    let start = 0;
    for (; start < lines.length; start++) {
      const line = lines[start].trim();
      if (!line) continue;
      if (!practiceImportPattern.test(line)) break;
      imports.push(lines[start]);
    }
    return {imports, bodyLines: lines.slice(start)};
  }

  function practiceSource(value) {
    return splitPracticeSource(value).bodyLines.map(line => line.trim()).filter(Boolean).join("\n");
  }

  function extractTaskSource(source, taskId) {
    const {imports, bodyLines} = splitPracticeSource(source);
    const start = bodyLines.findIndex(line => line.trim() === "// BEGIN " + taskId);
    const end = bodyLines.findLastIndex(line => line.trim() === "// END " + taskId);
    if (start < 0 || end <= start) return null;
    const method = bodyLines.slice(start + 1, end).join("\n");
    if (!method.trim()) return null;
    return (imports.length ? imports.join("\n") + "\n\n" : "") + method + "\n";
  }

  function refreshOpenTask(source, taskId, starter, previousInstructions) {
    if (!previousInstructions) return source;
    const lines = source.split(/(?<=\n)/);
    const start = lines.findIndex(line => line.trim() === "// BEGIN " + taskId);
    const end = lines.findLastIndex(line => line.trim() === "// END " + taskId);
    if (start < 0 || end <= start) return source;

    const method = lines.slice(start + 1, end).join("");
    const updated = addTaskInstructions(method, starter, previousInstructions, true);
    return lines.slice(0, start + 1).join("") + updated + lines.slice(end).join("");
  }

  function matchesPracticeSource(template, source, taskId) {
    const [before, after, ...extra] = template.split("\n" + solutionMarker + "\n");
    if (!after || extra.length || !before.endsWith("// BEGIN " + taskId) ||
        !after.startsWith("// END " + taskId + "\n")) return false;

    const start = before + "\n";
    const end = "\n" + after;
    return source.startsWith(start) && source.endsWith(end) && source.length > start.length + end.length;
  }

  // Saved drafts may still put the solution after Assert. Keep the same C# checks in both layouts.
  function previousPracticeOrder(template, taskId) {
    const header = "public static class Program\n{\n";
    const solution = "// BEGIN " + taskId + "\n" + solutionMarker + "\n// END " + taskId + "\n";
    if (!template.startsWith(header + solution)) return "";

    const assertStart = template.indexOf("\nprivate static void Assert(");
    if (assertStart < 0) return "";
    const classEnd = template.indexOf("\n}\n}", assertStart);
    if (classEnd < 0) return "";
    const programEnd = classEnd + "\n}\n".length;
    return header + template.slice(header.length + solution.length, programEnd) +
      solution + template.slice(programEnd);
  }

  function isSuccessfulPracticeRun(template, source, output, taskId) {
    if (typeof template !== "string" || typeof source !== "string" || typeof output !== "string") return false;
    if (normalize(output).trimEnd().split("\n").at(-1) !== "Все проверки пройдены") return false;

    return matchesPracticeTemplate(template, source, taskId);
  }

  function matchesPracticeTemplate(template, source, taskId) {
    const normalizedTemplate = practiceSource(template);
    const code = practiceSource(source);
    return matchesPracticeSource(normalizedTemplate, code, taskId) ||
      matchesPracticeSource(previousPracticeOrder(normalizedTemplate, taskId), code, taskId);
  }

  if (typeof module === "object" && module.exports) module.exports = {addTaskInstructions, buildTaskProgram, extractTaskSource, isSuccessfulPracticeRun, refreshOpenTask};
  if (typeof document === "undefined") return;
  const frame = document.getElementById("course-compiler");
  if (!frame) return;
  const lesson = Number(frame.dataset.lesson);
  const course = frame.dataset.course === "memory" ? "memory" : "whats-new";
  const taskId = (course === "memory" ? "ALLOC-TASK-" : "TASK-") + String(lesson).padStart(3, "0");
  const task = document.getElementById("solution-" + taskId);
  const practiceDraftKey = "dotnet-courses:practice-draft:" + course + ":" + lesson;
  let lastLoadedCode = null;
  let practiceButton = null;
  const provider = course === "memory" ? (lesson === 1 ? window.DotnetMemoryLesson001Snippets : null) :
                   lesson === 1 ? window.DotnetLesson001Snippets :
                   lesson === 2 ? window.DotnetLesson002Snippets : null;

  function bridge() {
    try {
      const win = frame.contentWindow;
      if (!win || win.location.origin !== location.origin) return null;
      const editor = win.document.getElementById("code-editor");
      if (!editor) return null;
      const api = win.DotnetBrowserEditor;
      if (api && typeof api.setCode === "function") return api;
      // Plain textarea fallback if CodeMirror scripts are unavailable.
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

  function send(button, prepareCode, run = true) {
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
    let savedPractice = false;
    if (code !== current) {
      const workingMethod = extractTaskSource(current, taskId);
      const updatingCurrentTask = workingMethod && !run;
      if (!updatingCurrentTask && current.trim() && current !== lastLoadedCode && !api.isInitialCode?.() &&
          !window.confirm("Заменить текущий код в редакторе? Чтобы сохранить весь файл отдельно, сначала скопируй или скачай Program.cs.")) {
        show(button, "Текущий код оставлен в редакторе.");
        return;
      }
      if (workingMethod && !updatingCurrentTask) {
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
      if (!updatingCurrentTask || current === lastLoadedCode) lastLoadedCode = code;
    }
    frame.scrollIntoView({behavior:"smooth",block:"start"});
    if (!run) {
      api.focus?.();
      show(button, "Код задания открыт в редакторе. Для проверки нажми «Запустить текущий код».");
      return;
    }
    show(button, savedPractice ? "Черновик задания сохранён. Компиляция и выполнение..." : "Компиляция и выполнение...");
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

  function addTaskButtons() {
    if (!task) return;
    const templateElement = document.getElementById("practice-program-template");
    const completion = document.getElementById("lesson-completion-status");
    const actions = document.querySelector('[data-practice-actions="' + taskId + '"]');
    if (!templateElement || !completion || !actions) return;

    const open = document.createElement("button");
    open.type = "button"; open.className = "button primary";
    practiceButton = open;
    refreshPracticeButton();
    actions.append(open);

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
    actions.insertAdjacentElement("afterend", verifiedSection);

    function showVerified(source, message) {
      verifiedField.value = source;
      note.textContent = message;
      verifiedSection.hidden = false;
    }

    try {
      const verified = localStorage.getItem(verifiedKey);
      if (verified?.trim()) showVerified(verified, "Решение восстановлено из этого браузера.");

      const previousDraft = localStorage.getItem("dotnet-learning:practice:" + taskId);
      if (previousDraft?.trim() && previousDraft !== task.defaultValue) {
        const recovery = document.createElement("div");
        recovery.className = "practice-actions";
        const recover = document.createElement("button");
        recover.type = "button"; recover.className = "button";
        recover.textContent = "Скачать старый черновик";
        const recoveryNote = document.createElement("span");
        recoveryNote.className = "practice-feedback";
        recoveryNote.setAttribute("role", "status");
        recover.addEventListener("click", () => {
          window.DotnetLearning.download(taskId + "-черновик.cs", previousDraft);
          recoveryNote.textContent = "Старый черновик скачан.";
        });
        recovery.append(recover, recoveryNote);
        verifiedSection.insertAdjacentElement("beforebegin", recovery);
      }
    } catch {
      show(open, "Не удалось прочитать сохранённое решение в этом браузере.");
    }

    const previousInstructions = document.getElementById("practice-previous-instructions")?.textContent;
    open.addEventListener("click", () => {
      send(open, current => {
        if (extractTaskSource(current, taskId)) {
          return refreshOpenTask(current, taskId, task.defaultValue, previousInstructions);
        }
        const source = readPracticeDraft() ?? task.defaultValue;
        const method = addTaskInstructions(source, task.defaultValue, previousInstructions);
        return buildTaskProgram(templateElement.textContent, method, taskId);
      }, false);
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
    if (!provider) return;
    const examples=[...document.querySelectorAll(".prose pre")].filter(pre=>
      pre.closest(".language-csharp") || pre.querySelector("code.language-csharp")
    );
    if(examples.length!==provider.exampleCount){
      console.error("C# examples mismatch",lesson,examples.length,provider.exampleCount);
      return;
    }
    examples.forEach((pre,i)=>{
      const holder=pre.closest(".code-wrap")||pre;
      const actions=document.createElement("div");
      actions.className="practice-actions snippet-actions";
      const button=document.createElement("button");
      button.type="button";button.className="button";
      button.textContent=i===5&&lesson===2?"▶ Проверить сигнатуру в компиляторе":"▶ Запустить этот пример";
      button.setAttribute("aria-label","Открыть C#-пример №"+(i+1)+" в браузерном компиляторе");
      const feedback=document.createElement("span");
      feedback.className="practice-feedback";feedback.setAttribute("role","status");
      actions.append(button,feedback);
      holder.insertAdjacentElement("afterend",actions);
      button.addEventListener("click",()=>{
        let source;
        try {source=provider.makeRunnable(pre.textContent,i);}
        catch(error){show(button,"Ошибка подготовки: "+error.message);return;}
        send(button, () => source);
      });
    });
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

  // Controls live on the lesson page, outside the iframe. They work even if
  // the embedded CodeMirror's own toolbar is hidden by the compiler layout.
  function addEditorToolbar() {
    const run = document.getElementById("page-editor-run");
    const copy = document.getElementById("page-editor-copy");
    const download = document.getElementById("page-editor-download");
    const dotnetLab = document.getElementById("page-editor-dotnet-lab");
    const status = document.getElementById("page-editor-feedback");
    if (!run || !copy || !download || !status) return;
    const getEditor = () => {
      const api = bridge();
      if (!api) status.textContent = "Редактор ещё загружается. Попробуй после появления кода.";
      return api;
    };
    run.addEventListener("click", () => {
      const api = getEditor();
      if (!api) return;
      if (api.busy()) { status.textContent = "Компилятор ещё загружается или занят."; return; }
      if (api.run()) status.textContent = "Выполняется текущий код, включая твои изменения.";
      else status.textContent = "Запуск пока недоступен. Проверь состояние компилятора.";
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

  const init=()=>{addCodeButtons();addTaskButtons();addEditorToolbar();};
  // Wait for site.js to install shared progress and export helpers.
  if(document.readyState==="complete")init();
  else document.addEventListener("DOMContentLoaded",init,{once:true});
})();
