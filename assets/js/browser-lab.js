(() => {
  "use strict";
  const frame = document.getElementById("browser-lab-compiler");
  const task = document.getElementById("solution-TASK-001");
  const send = document.getElementById("browser-task-load");
  const receive = document.getElementById("browser-task-import");
  if (!frame || !task || !send || !receive) return;

  function getCompiler() {
    try {
      const win = frame.contentWindow;
      if (!win || win.location.origin !== window.location.origin) return null;
      const editor = win.document.getElementById("code-editor");
      const run = win.document.querySelector("button.compile-btn");
      return editor && run ? { editor, run } : null;
    } catch {
      return null;
    }
  }

  function setCompilerCode(editor, code) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(editor, code);
    else editor.value = code;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function status(button, message) {
    const target = button.closest(".practice-actions, .snippet-actions")?.querySelector(".practice-feedback");
    if (target) target.textContent = message;
  }

  function makeProgram(input) {
    const normalized = input.replace(/\r\n?/g, "\n");
    if (/\b(?:class|struct)\s+Program\b/.test(normalized)) return normalized;
    const lines = normalized.split("\n");
    const isImport = line => /^\s*using\s+[\w.]+\s*;\s*$/.test(line);
    const extraImports = lines.filter(isImport);
    const code = lines.filter(line => !isImport(line)).join("\n").trim();
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
    const compiler = getCompiler();
    if (!compiler) {
      status(send, "Компилятор ещё загружается. Повтори после появления редактора.");
      return;
    }
    setCompilerCode(compiler.editor, makeProgram(task.value));
    compiler.editor.focus();
    status(send, "Заготовка загружена. Нажми Compile & Run; ошибка NotImplementedException исчезнет после реализации.");
    frame.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  receive.addEventListener("click", () => {
    const compiler = getCompiler();
    if (!compiler) {
      status(receive, "Компилятор ещё загружается.");
      return;
    }
    const content = compiler.editor.value;
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
    status(receive, "Код перенесён в TASK-001 и сохранён в локальном черновике.");
    task.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // Each existing C# code fence gets an actual runnable program.
  // Other code fences, including terminal commands and expected output, stay read-only.
  function insertExampleButtons() {
    const builder = window.DotnetLesson001Snippets;
    if (!builder) {
      console.error("Не загружен генератор запускаемых C#-примеров.");
      return;
    }
    const examples = [...document.querySelectorAll(".prose pre")].filter(pre =>
      pre.closest(".language-csharp") || pre.querySelector("code.language-csharp")
    );
    if (examples.length !== builder.exampleCount) {
      console.error("Неожиданное число C#-примеров:", examples.length);
      return;
    }
    examples.forEach((pre, index) => {
      const holder = pre.closest(".code-wrap") || pre;
      const actions = document.createElement("div");
      actions.className = "practice-actions snippet-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = "▶ Запустить этот пример";
      button.setAttribute("aria-label", "Запустить пример C# №" + (index + 1));
      const feedback = document.createElement("span");
      feedback.className = "practice-feedback";
      feedback.setAttribute("role", "status");
      actions.append(button, feedback);
      holder.insertAdjacentElement("afterend", actions);
      button.addEventListener("click", async () => {
        const compiler = getCompiler();
        if (!compiler) {
          status(button, "Компилятор ещё загружается. Попробуй снова после появления редактора.");
          return;
        }
        if (compiler.run.disabled) {
          status(button, "Компилятор выполняет предыдущую программу.");
          return;
        }
        let program;
        try {
          program = builder.makeRunnable(pre.textContent, index);
        } catch (error) {
          status(button, "Не удалось подготовить пример: " + error.message);
          return;
        }
        setCompilerCode(compiler.editor, program);
        status(button, "Пример №" + (index + 1) + " передан в Roslyn. Запуск...");
        // Give Blazor's oninput binding a moment to update before its onclick handler.
        await new Promise(resolve => setTimeout(resolve, 180));
        if (compiler.run.disabled) {
          status(button, "Компилятор занят. Повтори после завершения.");
          return;
        }
        compiler.run.click();
        frame.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", insertExampleButtons, { once: true });
  } else {
    insertExampleButtons();
  }
})();