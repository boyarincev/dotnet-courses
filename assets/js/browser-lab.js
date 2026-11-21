(() => {
  "use strict";
  const frame = document.getElementById("browser-lab-compiler");
  const task = document.getElementById("solution-TASK-001");
  const send = document.getElementById("browser-task-load");
  const receive = document.getElementById("browser-task-import");
  if (!frame || !task || !send || !receive) return;

  function getEditor() {
    try {
      const win = frame.contentWindow;
      if (!win || win.location.origin !== window.location.origin) return null;
      return win.document.getElementById("code-editor");
    } catch {
      return null;
    }
  }

  function status(button, message) {
    const target = button.closest(".practice-actions")?.querySelector(".practice-feedback");
    if (target) target.textContent = message;
  }

  function makeProgram(input) {
    const normalized = input.replace(/\r\n?/g, "\n");
    if (/\b(?:class|struct)\s+Program\b/.test(normalized))
      return normalized; // User already wrote a complete console program.

    const lines = normalized.split("\n");
    const extraImports = lines.filter(line => /^\s*using\s+[\w.]+\s*;\s*$/.test(line));
    const code = lines.filter(line => !/^\s*using\s+[\w.]+\s*;\s*$/.test(line)).join("\n").trim();
    const imports = Array.from(new Set([
      "using System;",
      "using System.Collections.Generic;",
      "using System.Linq;",
      ...extraImports.map(x => x.trim())
    ])).join("\n");

    return imports + "\n\npublic static class Program\n{\n" +
      "    public static void Main()\n    {\n" +
      "        string[] methods = [\"get\", \"POST\", \"GET\", \"put\", \"post\", \"DELETE\", \"delete\", \"GET\"];\n" +
      "        foreach (var (method, count) in GetTopMethods(methods))\n" +
      "            Console.WriteLine($\"{method}: {count}\");\n" +
      "        Console.WriteLine($\"Empty: {GetTopMethods(Array.Empty<string>()).Count()}\");\n" +
      "    }\n\n" +
      "    // BEGIN TASK-001\n" + code + "\n    // END TASK-001\n}\n";
  }

  send.addEventListener("click", () => {
    const editor = getEditor();
    if (!editor) {
      status(send, "Компилятор ещё загружается. Повтори после появления редактора.");
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(editor, makeProgram(task.value));
    else editor.value = makeProgram(task.value);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
    status(send, "Заготовка загружена в компилятор. Нажми Compile & Run. Ошибка NotImplementedException исчезнет после твоей реализации.");
    frame.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  receive.addEventListener("click", () => {
    const editor = getEditor();
    if (!editor) {
      status(receive, "Компилятор ещё загружается.");
      return;
    }
    const content = editor.value;
    const start = content.indexOf("// BEGIN TASK-001");
    const end = content.indexOf("// END TASK-001");
    if (start === -1 || end < start) {
      status(receive, "Не найдены маркеры TASK-001. Скопируй код из компилятора вручную.");
      return;
    }
    const method = content.slice(start + "// BEGIN TASK-001".length, end).trim();
    const imports = [...content.matchAll(/^\s*using\s+[\w.]+\s*;\s*$/gm)].map(m => m[0].trim());
    task.value = imports.join("\n") + "\n\n" + method + "\n";
    task.dispatchEvent(new Event("input", { bubbles: true }));
    status(receive, "Код скопирован в поле TASK-001 и сохранён в локальном черновике.");
    task.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
})();
