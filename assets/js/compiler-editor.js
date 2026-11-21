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
  const cmReady = () => typeof window.CodeMirror === "function";

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
    if (!cmReady()) return;
    const textarea = document.getElementById("code-editor");
    if (!textarea || (original === textarea && instance)) return;
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
    instance.on("change", cm => synchronize(cm));
    instance.on("inputRead", (cm, change) => {
      if (change.origin !== "+input" || !/^[\w]+$/.test(change.text?.join("") || "")) return;
      if (cm.state.completionActive) return;
      const suggestions = hint(cm);
      if (suggestions.list.length) cm.showHint({hint,completeSingle:false});
    });
    textarea.closest(".editor-container")?.classList.add("enhanced-csharp-editor");
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
