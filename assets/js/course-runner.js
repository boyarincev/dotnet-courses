/* Shared reusable browser runner for Jekyll C# lessons.
 * A single component attaches run buttons to C# examples and moves practice drafts
 * into the appropriate .NET WebAssembly/Roslyn compiler.
 */
(() => {
  "use strict";
  const frame = document.getElementById("course-compiler");
  if (!frame) return;
  const lesson = Number(frame.dataset.lesson);
  const course = frame.dataset.course === "memory" ? "memory" : "whats-new";
  const taskId = (course === "memory" ? "ALLOC-TASK-" : "TASK-") + String(lesson).padStart(3, "0");
  const task = document.getElementById("solution-" + taskId);
  const provider = course === "memory" ? (lesson === 1 ? window.DotnetMemoryLesson001Snippets : null) :
                   lesson === 1 ? window.DotnetLesson001Snippets :
                   lesson === 2 ? window.DotnetLesson002Snippets : null;

  function bridge() {
    try {
      const win = frame.contentWindow;
      if (!win || win.location.origin !== location.origin) return null;
      const api = win.DotnetBrowserEditor;
      if (api && typeof api.setCode === "function") return api;
      // Plain textarea fallback if CodeMirror scripts are unavailable.
      const editor = win.document.getElementById("code-editor");
      const run = win.document.querySelector(".compile-btn");
      if (!editor || !run) return null;
      return {
        setCode(value) {
          const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) setter.call(editor, value); else editor.value = value;
          editor.dispatchEvent(new win.Event("input", {bubbles:true}));
          return true;
        },
        getCode: () => editor.value,
        run: () => {if (run.disabled) return false; run.click(); return true;},
        busy: () => run.disabled
      };
    } catch { return null; }
  }

  function show(button, message) {
    const messageEl = button.closest(".practice-actions")?.querySelector(".practice-feedback");
    if (messageEl) messageEl.textContent = message;
  }

  function send(button, code, runNow) {
    const api = bridge();
    if (!api) {
      show(button, "Компилятор ещё загружается; повтори после появления редактора.");
      return;
    }
    if (api.busy()) {
      show(button, "Компилятор занят предыдущим запуском.");
      return;
    }
    if (!api.setCode(code)) {
      show(button, "Редактор ещё не готов к загрузке.");
      return;
    }
    show(button, runNow ? "Код отправлен. Компиляция и выполнение..." : "Код загружен. Нажми Compile & Run (Ctrl+Enter).");
    frame.scrollIntoView({behavior:"smooth",block:"start"});
    if (runNow) {
      // Give the Blazor oninput binding a turn to receive the new source.
      setTimeout(() => {
        if (!api.run()) show(button,"Запуск не начался — проверь кнопку Compile & Run.");
      }, 170);
    }
  }

  function taskProgram001(input) {
    if (/\b(?:class|struct)\s+Program\b/.test(input)) return input;
    const code = stripImports(input);
    return commonImports + "\npublic static class Program\n{\n" +
      "    public static void Main()\n    {\n" +
      '        string[] methods = ["get","POST","GET","put","post","DELETE","delete","GET"];\n' +
      '        foreach (var (method,count) in GetTopMethods(methods)) Console.WriteLine($"{method}: {count}");\n' +
      '        Console.WriteLine($"Empty: {GetTopMethods(Array.Empty<string>()).Count()}");\n' +
      "    }\n    // BEGIN TASK-001\n" + code + "\n    // END TASK-001\n}\n";
  }
  function taskProgram002(input) {
    if (/\b(?:class|struct)\s+Program\b/.test(input)) return input;
    const code = stripImports(input);
    return commonImports + "\npublic static class Program\n{\n" +
      "    public static void Main()\n    {\n" +
      '        Failure[] calls = [new("api-A",500,150),new("API-a",404,50),new("api-b",503,400),new("api-b",200,900),new("api-c",500,400)];\n' +
      "        var audit = new AuditReport();\n" +
      "        foreach (var (client,count,bytes) in GetNoisiestClients(calls,audit))\n" +
      '            Console.WriteLine($"{client}: Count={count}, TotalBytes={bytes}");\n' +
      '        Console.WriteLine("Audit: " + audit.Text);\n' +
      '        Console.WriteLine($"Empty: {GetNoisiestClients(Array.Empty<Failure>(), new AuditReport()).Count}");\n' +
      "    }\n    // BEGIN TASK-002\n" + code + "\n    // END TASK-002\n}\n" +
      'sealed record Failure(string Client, int StatusCode, long ResponseBytes);\n' +
      'sealed class AuditReport { public string Text { get; set; } = ""; }\n';
  }

  const commonImports="using System;\nusing System.Collections.Generic;\nusing System.Linq;\n";

  function taskProgramMemory001(input) {
    if (/\bclass\s+Program\b/.test(input)) return input;
    const code = stripImports(input);
    return commonImports + "\nusing System.Globalization;\n\n" +
      "public static class Program\n{\n" +
      "    public static void Main()\n    {\n" +
      '        string[] rows = ["ORD-1042;paid;1499.90","ORD-1043;new;250.00","ORD-1044;paid;80.00","broken","ORD-1045;paid;not-a-number","ORD-1046;PAID;30.00"];\n' +
      '        var summary = SummarizePaid(rows);\n' +
      '        Console.WriteLine($"Paid: {summary.PaidCount}");\n' +
      '        Console.WriteLine($"Total: {summary.Total.ToString("F2", CultureInfo.InvariantCulture)}");\n' +
      '        Console.WriteLine($"Empty: {SummarizePaid(Array.Empty<string>()).PaidCount}");\n' +
      "    }\n    // BEGIN ALLOC-TASK-001\n" + code +
      "\n    // END ALLOC-TASK-001\n}\n";
  }

  function stripImports(raw) {
    return String(raw).replace(/\r\n?/g,"\n").split("\n")
      .filter(line=>!/^\s*using\s+[\w.]+\s*;\s*$/.test(line)).join("\n").trim();
  }
  function addTaskButtons() {
    if (!task) return;
    const actions = task.nextElementSibling;
    if (!actions?.classList.contains("practice-actions")) return;
    const load = document.createElement("button");
    load.type = "button"; load.className = "button primary";
    load.textContent = "▶ Запустить моё решение в браузере";
    const save = document.createElement("button");
    save.type="button"; save.className="button";
    save.textContent="Сохранить решение из редактора в задание";
    actions.append(load,save);
    load.addEventListener("click",()=>{
      const code=course==="memory"?taskProgramMemory001(task.value):(lesson===1?taskProgram001(task.value):taskProgram002(task.value));
      send(load,code,true);
    });
    save.addEventListener("click",()=>{
      const api=bridge();
      if (!api) {show(save,"Компилятор ещё загружается.");return;}
      const code=api.getCode();
      const start=code.indexOf("// BEGIN "+taskId);
      const stop=code.indexOf("// END "+taskId);
      if(start<0 || stop<=start){
        show(save,"Сейчас в редакторе открыт обычный пример, а не решение задания. Чтобы сохранить весь пример, используй кнопку «Скачать .cs» в редакторе. Для переноса решения сначала нажми «Запустить моё решение в браузере».");
        return;
      }
      const imports=[...code.matchAll(/^\s*using\s+[\w.]+\s*;\s*$/gm)].map(x=>x[0].trim());
      task.value=[...new Set(imports)].join("\n")+"\n\n"+
        code.slice(start+("// BEGIN "+taskId).length,stop).trim()+"\n";
      task.dispatchEvent(new Event("input",{bubbles:true}));
      show(save,"Код сохранён в черновике задания (только в этом браузере).");
      task.scrollIntoView({behavior:"smooth",block:"nearest"});
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
        send(button,source,true);
      });
    });
  }

  const init=()=>{addCodeButtons();addTaskButtons();};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
