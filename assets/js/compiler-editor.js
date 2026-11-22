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
  // The iframe URL carries a stable course + lesson identity. Keep authored
  // drafts separate across lessons and courses, without server-side storage.
  const pageParams = new URLSearchParams(location.search);
  const courseId = pageParams.get("course") || "standalone";
  const lessonId = pageParams.get("lesson") || "0";
  const storageKey = "dotnet-courses:compiler-draft:" + courseId + ":" + lessonId;
  let draftNotice = null;
  function showDraft(text) {
    if (draftNotice) draftNotice.textContent = text;
  }
  function saveDraft(source) {
    try {
      localStorage.setItem(storageKey, source);
      showDraft("✓ Код автоматически сохранён в этом браузере.");
    } catch {
      showDraft("⚠ Не удалось сохранить черновик. Используй «Скачать .cs».");
    }
  }
  const cmReady = () => typeof window.CodeMirror === "function";

  // A real "run current code" control next to the CodeMirror editor:
  // the example-loader can replace the source, but this button never does.
  function installRunButton() {
    const wrapper = instance?.getWrapperElement();
    if (!wrapper?.isConnected || wrapper.nextElementSibling?.id === "editor-run-bar") return;

    const bar = document.createElement("div");
    bar.id = "editor-run-bar";
    bar.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 18px;";
    const button = document.createElement("button");
    button.type = "button";
    button.id = "editor-run-current";
    button.textContent = "▶ Запустить мой код";
    button.title = "Запуск текущего кода в редакторе (Ctrl+Enter)";
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
    downloadButton.textContent = "Скачать .cs";
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
    draftNotice = document.createElement("small");
    draftNotice.id = "editor-draft-status";
    draftNotice.setAttribute("role", "status");
    draftNotice.style.cssText = "display:block;flex-basis:100%;opacity:.8;";
    draftNotice.textContent = "Черновик сохраняется автоматически в браузере на этом устройстве.";
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
    if (pageParams.has("course") && pageParams.has("lesson")) {
      const codeViewToggle = document.getElementById("code-view-desc")?.closest(".toggle-container");
      if (codeViewToggle) codeViewToggle.style.display = "none";
    }
    if (!cmReady()) return;
    const textarea = document.getElementById("code-editor");
    if (!textarea) return;
    if (original === textarea && instance && instance.getWrapperElement().isConnected) {
      installRunButton();
      return;
    }
    initialCode ??= textarea.value;
    original = textarea;
    instance = window.CodeMirror.fromTextArea(textarea, {
      mode: "text/x-csharp",
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      lineWrapping: false,
      extraKeys: {
        "Ctrl-Space": cm => cm.showHint({hint,completeSingle:false}),
        "Ctrl-Enter": cm => {synchronize(cm); document.querySelector(".compile-btn")?.click();},
        "Cmd-Enter": cm => {synchronize(cm); document.querySelector(".compile-btn")?.click();}
      }
    });
    instance.setSize("100%", 430);
    instance.on("change", cm => {
      synchronize(cm);
      saveDraft(cm.getValue());
    });
    instance.on("inputRead", (cm, change) => {
      if (change.origin !== "+input" || !/^[\w]+$/.test(change.text?.join("") || "")) return;
      if (cm.state.completionActive) return;
      const suggestions = hint(cm);
      if (suggestions.list.length) cm.showHint({hint,completeSingle:false});
    });
    textarea.closest(".editor-container")?.classList.add("enhanced-csharp-editor");
    installRunButton();
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        instance.setValue(saved);
        synchronize(instance);
        showDraft("✓ Восстановлен черновик этого урока из браузера.");
      } else {
        showDraft("Автосохранение включено. Код останется в этом браузере.");
      }
    } catch {
      showDraft("⚠ Локальное хранилище недоступно. Для сохранения используй «Скачать .cs».");
    }
  }

  const watcher = new MutationObserver(() => ensure());
  const start = () => {
    ensure();
    const app = document.getElementById("app");
    if (app) watcher.observe(app, {childList:true,subtree:true});
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start,{once:true});
  else start();

  window.DotnetBrowserEditor = {
    setCode(code) {
      ensure();
      if (!instance) return false;
      instance.setValue(String(code));
      synchronize(instance);
      instance.focus();
      return true;
    },
    getCode() {
      ensure();
      return instance ? instance.getValue() : document.getElementById("code-editor")?.value ?? "";
    },
    focus() {
      ensure();
      if (instance) instance.focus();
      else document.getElementById("code-editor")?.focus();
    },
    isInitialCode() {
      ensure();
      return instance !== null && instance.getValue() === initialCode;
    },
    reportSuccessfulRun(source, output) {
      if (window.parent === window) return;
      window.parent.postMessage({ type: "dotnet-courses:practice-run-success", source, output }, location.origin);
    },
    run() {
      ensure();
      if (instance) synchronize(instance);
      const button = document.querySelector(".compile-btn");
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    busy() {
      const button = document.querySelector(".compile-btn");
      return !button || button.disabled;
    }
  };
})();
