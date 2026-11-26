/* Shared .NET browser compiler editor. CodeMirror enhances the upstream Blazor textarea.
 * It provides C# highlighting, brackets and local completion; NOT semantic Roslyn IntelliSense.
 */
(() => {
  "use strict";
  const words = [
    "AggregateBy", "CountBy", "GroupBy", "Select", "Where", "OrderBy", "OrderByDescending",
    "ThenBy", "ThenByDescending", "ToArray", "ToList", "Take", "Sum", "Average",
    "StringComparer", "OrdinalIgnoreCase", "Ordinal", "ReadOnlySpan", "Span",
    "IEnumerable", "IReadOnlyList", "Dictionary", "List", "KeyValuePair", "Console",
    "WriteLine", "ReadLine", "TryParse", "NotImplementedException",
    "public", "private", "internal", "static", "void", "int", "long", "string",
    "var", "return", "foreach", "for", "if", "else", "while", "switch",
    "new", "class", "record", "struct", "interface", "async", "await", "using",
    "null", "true", "false", "is", "not", "params", "throw", "sealed",
    "System", "Collections", "Generic", "Linq", "Main", "StatusCode",
    "Client", "Route", "Count", "TotalBytes", "TotalMs"
  ];
  let instance = null;
  let original = null;
  let initialCode = null;
  let hasDraft = false;
  let applyingInitialCode = false;
  let wasBusy = false;
  let runSucceeded = false;
  let diagnosticSnapshot = null;
  let diagnosticLine = null;
  const diagnosticSelector = "#output .compiler-diagnostic";
  // The iframe URL carries a stable course + lesson identity. Keep authored
  // drafts separate across lessons and courses, without server-side storage.
  const pageParams = new URLSearchParams(location.search);
  const hasLessonContext = pageParams.has("course") && pageParams.has("lesson");
  const embeddedLesson = hasLessonContext && window.parent !== window;
  if (embeddedLesson) {
    document.documentElement.classList.add("course-editor-embedded");
    document.documentElement.lang = "ru";
    const scriptUrl = document.currentScript?.src;
    if (scriptUrl) {
      const stylesheet = new URL("../css/compiler-editor.css", scriptUrl);
      const revision = new URL(scriptUrl).searchParams.get("v");
      if (revision !== null) stylesheet.searchParams.set("v", revision);
      const link = document.createElement("link");
      link.id = "course-editor-style";
      link.rel = "stylesheet";
      link.href = stylesheet.href;
      document.head.append(link);
    }
  }
  const courseId = pageParams.get("course") || "standalone";
  const lessonId = pageParams.get("lesson") || "0";
  const storageKey = "dotnet-courses:compiler-draft:" + courseId + ":" + lessonId;
  const downloadLabel = embeddedLesson ? "Скачать Program.cs" : "Скачать .cs";
  let draftNotice = null;
  function showDraft(text) {
    if (draftNotice) draftNotice.textContent = text;
  }
  function saveDraft(source) {
    if (applyingInitialCode) return;
    hasDraft = true;
    try {
      localStorage.setItem(storageKey, source);
      showDraft("✓ Код автоматически сохранён в этом браузере.");
    } catch {
      showDraft("⚠ Не удалось сохранить черновик. Используй «" + downloadLabel + "».");
    }
  }
  const cmReady = () => typeof window.CodeMirror === "function";
  const currentCode = () => instance ? instance.getValue() : original?.value ?? "";

  function diagnosticRunForCurrentCode() {
    return diagnosticSnapshot && diagnosticSnapshot.source === currentCode() ? diagnosticSnapshot.run : null;
  }

  function updateDiagnosticButtons() {
    const currentRun = diagnosticRunForCurrentCode();
    for (const button of document.querySelectorAll(diagnosticSelector)) {
      const active = button.dataset.diagnosticRun === currentRun;
      if (button.disabled === active) button.disabled = !active;
    }
  }

  function clearDiagnosticHighlight() {
    if (!diagnosticLine) return;
    instance?.removeLineClass(diagnosticLine, "background", "compiler-diagnostic-line");
    diagnosticLine = null;
  }

  function revealTextareaDiagnostic(start, end) {
    original.focus();
    original.setSelectionRange(start, end);
    const precedingLines = original.value.slice(0, start).split("\n");
    const style = getComputedStyle(original);
    original.scrollTop = (precedingLines.length - 1) * Number.parseFloat(style.lineHeight) - original.clientHeight / 2;

    const measurement = document.createElement("canvas").getContext("2d");
    if (!measurement) return;
    measurement.font = `${style.fontSize} ${style.fontFamily}`;
    const tabWidth = measurement.measureText(" ").width * (Number.parseFloat(style.tabSize) || 4);
    let width = 0;
    for (const [index, text] of precedingLines.at(-1).split("\t").entries()) {
      if (index) width = (Math.floor(width / tabWidth) + 1) * tabWidth;
      width += measurement.measureText(text).width;
    }
    original.scrollLeft = width - original.clientWidth / 2;
  }

  function handleDiagnosticClick(event) {
    const button = event.target.closest("button");
    if (button?.matches('.compile-btn, button[aria-describedby="clear-instructions"]')) {
      diagnosticSnapshot = null;
      clearDiagnosticHighlight();
      updateDiagnosticButtons();
      return;
    }
    if (!button?.matches(diagnosticSelector) || button.dataset.diagnosticRun !== diagnosticRunForCurrentCode()) return;

    const start = Number(button.dataset.sourceStart);
    const end = Number(button.dataset.sourceEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > currentCode().length) return;
    if (!instance) {
      revealTextareaDiagnostic(start, end);
      return;
    }

    const from = instance.posFromIndex(start);
    const to = instance.posFromIndex(end);
    clearDiagnosticHighlight();
    diagnosticLine = instance.addLineClass(from.line, "background", "compiler-diagnostic-line");
    instance.setSelection(from, to);
    instance.focus();
    instance.scrollIntoView(from, 32);
  }

  function reportState(state, feedback) {
    if (embeddedLesson && feedback !== undefined) {
      const status = document.getElementById("editor-run-feedback");
      if (status) {
        status.dataset.state = state;
        status.textContent = feedback;
      }
    }
    if (window.parent === window) return;
    window.parent.postMessage({ type: "dotnet-courses:compiler-state", state }, location.origin);
  }

  function updateRunState() {
    const busy = document.querySelector(".compile-btn")?.disabled === true;
    if (embeddedLesson) document.getElementById("editor-run-current")?.setAttribute("aria-disabled", String(busy));
    if (busy && !wasBusy) {
      runSucceeded = false;
      reportState("running", "Выполняется текущий код.");
    }
    if (!busy && wasBusy && !runSucceeded) {
      reportState("error", diagnosticSnapshot
        ? "Ошибка компиляции. Подробности в консоли."
        : "Ошибка выполнения. Подробности в консоли.");
    }
    wasBusy = busy;
  }

  function replaceCode(source) {
    if (instance) {
      instance.setValue(source);
    } else {
      original.value = source;
      original.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function translateText(selector, text) {
    const element = document.querySelector(selector);
    // Keep Blazor's text nodes in place so later renders can still update them.
    const node = element && [...element.childNodes].find(child =>
      child.nodeType === Node.TEXT_NODE && child.data.trim());
    if (node && node.data !== text) node.data = text;
  }

  function localizeEmbeddedEditor(textarea) {
    document.title = "Редактор C#";
    translateText(".compiler-container .subheading", "Редактор для примеров и заданий курса");
    translateText("#editor-heading", "Редактор C#");
    translateText('label[for="code-editor"]', "Код C#");
    translateText("#editor-instructions", "Редактируй полный файл Program.cs. Ctrl+Enter запускает код. Esc переводит фокус на кнопку запуска.");
    translateText("#output-heading", "Консоль");
    translateText("#output-instructions", "Здесь появляются вывод программы и ошибки. Переключатель показывает подробности компиляции.");
    translateText("#clear-instructions", "Очищает вывод программы и сообщения компилятора.");
    translateText('button[aria-describedby="clear-instructions"]', "Очистить");
    translateText('label[aria-describedby="system-output-desc"] .toggle-label', "Подробности");
    const labels = [
      [".compiler-container", "Компилятор C#"],
      [".console-controls", "Управление консолью"],
      ["#output", "Вывод программы"],
      ['button[aria-describedby="clear-instructions"]', "Очистить консоль"],
      ['input[aria-describedby="system-output-desc"]', "Подробности компиляции"],
      ['label[aria-describedby="system-output-desc"]', "Подробности компиляции"]
    ];
    for (const [selector, label] of labels) document.querySelector(selector)?.setAttribute("aria-label", label);
    const details = document.querySelector('label[aria-describedby="system-output-desc"]');
    details?.setAttribute("title", "Показать или скрыть подробности компиляции");
    textarea.setAttribute("aria-label", "Код C#");
    textarea.placeholder = "Введи код C#";

    const skipLink = document.querySelector('.skip-link[href="#code-editor"]');
    if (skipLink) {
      translateText('.skip-link[href="#code-editor"]', "К редактору кода");
      skipLink.onclick = event => {
        event.preventDefault();
        window.DotnetBrowserEditor.focus();
      };
    }
  }

  function localizeConsoleState() {
    const details = document.querySelector('input[aria-describedby="system-output-desc"]');
    if (details) {
      translateText("#system-output-desc", details.checked
        ? "В консоли показаны сообщения компилятора и вывод программы."
        : "В консоли показаны вывод программы и ошибки.");
    }
    const input = document.querySelector("#output .interactive-output input[type=text]");
    if (input && !input.hasAttribute("aria-label")) {
      input.setAttribute("aria-label", "Ввод для программы");
      input.placeholder = "Введи значение и нажми Enter";
    }
  }

  function installFullscreenButton() {
    const heading = document.getElementById("editor-heading");
    if (!heading || document.getElementById("editor-fullscreen")) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "editor-fullscreen";
    toggle.title = document.documentElement.classList.contains("course-editor-fullscreen")
      ? "Свернуть полноэкранный редактор" : "На весь экран";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path class="editor-expand-icon" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>
      <path class="editor-collapse-icon" d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>
    </svg>`;
    heading.insertAdjacentElement("afterend", toggle);
  }

  // A real "run current code" control next to the CodeMirror editor:
  // the example-loader can replace the source, but this button never does.
  function installRunButton() {
    const wrapper = instance?.getWrapperElement() ?? original;
    if (!wrapper?.isConnected || wrapper.nextElementSibling?.id === "editor-run-bar") return;

    const bar = document.createElement("div");
    bar.id = "editor-run-bar";
    const button = document.createElement("button");
    button.type = "button";
    button.id = "editor-run-current";
    button.textContent = "▶ Запустить мой код";
    button.title = "Запуск текущего кода в редакторе (Ctrl+Enter)";
    draftNotice = document.createElement("small");
    draftNotice.id = "editor-draft-status";
    draftNotice.setAttribute("role", "status");
    draftNotice.textContent = "Черновик сохраняется автоматически в браузере на этом устройстве.";
    if (embeddedLesson) {
      const actions = document.createElement("div");
      actions.className = "editor-run-actions";
      button.textContent = "Запустить текущий код";
      button.addEventListener("click", () => {
        button.focus({preventScroll: true});
        window.DotnetBrowserEditor.run();
      });
      const dotnetLab = document.createElement("button");
      dotnetLab.type = "button";
      dotnetLab.id = "editor-dotnet-lab";
      dotnetLab.textContent = "Открыть в .NET Lab";
      dotnetLab.title = "Открыть текущий код в новой вкладке";
      actions.append(button, dotnetLab);
      const feedback = document.createElement("p");
      feedback.id = "editor-run-feedback";
      feedback.setAttribute("role", "status");
      bar.append(actions, feedback, draftNotice);
      wrapper.insertAdjacentElement("afterend", bar);
      return;
    }

    bar.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 18px;";
    button.style.cssText = "cursor:pointer;border:0;border-radius:9px;padding:12px 18px;font-size:14px;font-weight:700;background:#087c70;color:#fff;";
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    status.style.cssText = "font-size:13px;color:inherit;";
    button.addEventListener("click", () => {
      if (window.DotnetBrowserEditor.busy()) {
        status.textContent = "Компилятор ещё занят или загружается.";
        return;
      }
      if (window.DotnetBrowserEditor.run()) {
        status.textContent = "Запускается текущая версия кода из редактора.";
      } else {
        status.textContent = "Запуск пока недоступен; проверь компилятор.";
      }
    });
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Копировать весь код";
    copyButton.style.cssText = "cursor:pointer;border:1px solid #a4b7bb;border-radius:9px;padding:11px 14px;font-size:13px;background:transparent;color:inherit;";
    copyButton.addEventListener("click", async () => {
      const code = window.DotnetBrowserEditor.getCode();
      try {
        await navigator.clipboard.writeText(code);
        status.textContent = "Весь текущий код скопирован.";
      } catch {
        status.textContent = "Не удалось скопировать: выдели код в редакторе.";
      }
    });
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = downloadLabel;
    downloadButton.style.cssText = "cursor:pointer;border:1px solid #a4b7bb;border-radius:9px;padding:11px 14px;font-size:13px;background:transparent;color:inherit;";
    downloadButton.addEventListener("click", () => {
      const blob = new Blob([window.DotnetBrowserEditor.getCode()], {type:"text/plain;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Program.cs";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Текущий код сохранён в Program.cs.";
    });
    const shortcut = document.createElement("small");
    shortcut.textContent = "Ctrl+Enter";
    shortcut.style.cssText = "opacity:.7;";
    draftNotice.style.cssText = "display:block;flex-basis:100%;opacity:.8;";
    bar.append(button, copyButton, downloadButton, shortcut, status, draftNotice);
    wrapper.insertAdjacentElement("afterend", bar);
  }

  function hint(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line).slice(0, cursor.ch);
    const match = line.match(/[A-Za-z_][A-Za-z_0-9]*$/);
    const prefix = match ? match[0] : "";
    const start = cursor.ch - prefix.length;
    if (prefix.length < 2) return {list:[], from:{line:cursor.line,ch:start},to:cursor};
    const found = [...new Set([
      ...words,
      ...Array.from(new Set(cm.getValue().match(/\b[A-Za-z_][A-Za-z_0-9]{2,}\b/g) || []))
    ])].filter(item => item.toLowerCase().startsWith(prefix.toLowerCase()) && item !== prefix)
      .sort((a,b)=>a.localeCompare(b)).slice(0,30);
    return {list:found,from:{line:cursor.line,ch:start},to:cursor};
  }

  function synchronize(cm) {
    if (!original || !original.isConnected) return;
    cm.save();
    original.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function ensure() {
    // Lessons edit a complete Program.cs. The upstream simplified view rebuilds
    // the source from Main and can discard using directives and helper methods.
    if (hasLessonContext) {
      const codeViewToggle = document.getElementById("code-view-desc")?.closest(".toggle-container");
      if (codeViewToggle) codeViewToggle.style.display = "none";
    }
    const textarea = document.getElementById("code-editor");
    if (!textarea) return;
    if (embeddedLesson) installFullscreenButton();
    if (original === textarea && (!instance || instance.getWrapperElement().isConnected)) {
      installRunButton();
      return;
    }
    clearDiagnosticHighlight();
    initialCode ??= textarea.value;
    original = textarea;
    if (embeddedLesson) {
      // Hide the upstream sample and compile controls in the lesson editor.
      for (const selector of [".editor-controls", ".compile-section"]) {
        const control = document.querySelector(selector);
        if (control) control.style.display = "none";
      }
      localizeEmbeddedEditor(textarea);
    }
    instance = cmReady() ? window.CodeMirror.fromTextArea(textarea, {
      mode: "text/x-csharp",
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      lineWrapping: false,
      extraKeys: {
        "Shift-Tab": "indentLess",
        "Ctrl-Space": cm => cm.showHint?.({hint,completeSingle:false}),
        "Ctrl-Enter": () => window.DotnetBrowserEditor.run(),
        "Cmd-Enter": () => window.DotnetBrowserEditor.run()
      }
    }) : null;
    if (instance) {
      if (embeddedLesson) {
        const input = instance.getInputField();
        input.setAttribute("aria-label", "Код C#");
        input.setAttribute("aria-describedby", "editor-instructions");
      } else {
        instance.setSize("100%", 430);
      }
      instance.on("change", cm => {
        synchronize(cm);
        saveDraft(cm.getValue());
        clearDiagnosticHighlight();
        updateDiagnosticButtons();
      });
      instance.on("inputRead", (cm, change) => {
        if (change.origin !== "+input" || !/^[\w]+$/.test(change.text?.join("") || "")) return;
        if (cm.state.completionActive) return;
        const suggestions = hint(cm);
        if (suggestions.list.length) cm.showHint?.({hint,completeSingle:false});
      });
      textarea.closest(".editor-container")?.classList.add("enhanced-csharp-editor");
    } else {
      textarea.wrap = "off";
      textarea.addEventListener("input", () => {
        saveDraft(textarea.value);
        updateDiagnosticButtons();
      });
      if (embeddedLesson) {
        textarea.addEventListener("keydown", event => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            // The upstream textarea also handles Ctrl+Enter through Blazor.
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat && !event.isComposing) window.DotnetBrowserEditor.run();
          }
          if (event.ctrlKey && event.key.toLowerCase() === "l") event.stopPropagation();
        });
      }
    }
    installRunButton();
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        hasDraft = true;
        applyingInitialCode = true;
        replaceCode(saved);
        showDraft("✓ Восстановлен черновик этого урока из браузера.");
      } else {
        showDraft("Автосохранение включено. Код останется в этом браузере.");
      }
    } catch {
      showDraft("⚠ Локальное хранилище недоступно. Для сохранения используй «" + downloadLabel + "».");
    } finally {
      applyingInitialCode = false;
    }
    reportState("ready");
  }

  const watcher = new MutationObserver(() => {
    ensure();
    if (embeddedLesson) localizeConsoleState();
    updateDiagnosticButtons();
    updateRunState();
  });
  const start = () => {
    if (embeddedLesson) {
      translateText("#blazor-error-ui", "В редакторе произошла ошибка. ");
      translateText("#blazor-error-ui .reload", "Перезагрузить редактор");
      document.querySelector("#blazor-error-ui .dismiss")?.setAttribute("aria-label", "Закрыть сообщение об ошибке");
    }
    ensure();
    if (embeddedLesson) localizeConsoleState();
    document.addEventListener("click", handleDiagnosticClick, true);
    const app = document.getElementById("app");
    if (app) watcher.observe(app, {
      childList: true,
      subtree: true,
      characterData: embeddedLesson,
      attributes: true,
      attributeFilter: ["disabled"]
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start,{once:true});
  else start();

  window.DotnetBrowserEditor = {
    setCode(code, {focus = true} = {}) {
      ensure();
      if (!original?.isConnected) return false;
      replaceCode(String(code));
      if (focus) (instance ?? original).focus();
      return true;
    },
    setInitialCode(code) {
      ensure();
      if (!original?.isConnected || hasDraft || currentCode() !== initialCode) return;
      applyingInitialCode = true;
      try {
        replaceCode(code);
        initialCode = currentCode();
      } finally {
        applyingInitialCode = false;
      }
    },
    getCode() {
      ensure();
      return currentCode();
    },
    focus() {
      ensure();
      if (instance) instance.focus();
      else document.getElementById("code-editor")?.focus();
    },
    isInitialCode() {
      ensure();
      return !!original && !hasDraft && currentCode() === initialCode;
    },
    reportCompilationErrors(source, run) {
      diagnosticSnapshot = { source, run: String(run) };
      updateDiagnosticButtons();
    },
    reportSuccessfulRun(source, output) {
      runSucceeded = true;
      reportState("complete", "");
      if (window.parent === window) return;
      window.parent.postMessage({ type: "dotnet-courses:practice-run-success", source, output }, location.origin);
    },
    run() {
      ensure();
      const button = document.querySelector(".compile-btn");
      if (!button || button.disabled) return false;
      if (instance) synchronize(instance);
      button.click();
      return true;
    },
    busy() {
      const button = document.querySelector(".compile-btn");
      return !button || button.disabled;
    }
  };
})();
