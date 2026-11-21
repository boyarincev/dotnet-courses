/* Shared reusable browser runner for Jekyll C# lessons.
 * A single component attaches run buttons to C# examples and moves practice drafts
 * into the appropriate .NET WebAssembly/Roslyn compiler.
 */
(() => {
  "use strict";

  // Only assembles visible C# from the lesson with the student's method.
  // All Assert checks are plain C# in each lesson's practice-program-template.
  function buildTaskProgram(template, source, taskId) {
    const text = String(template).trim();
    const value = String(source).replace(/\r\n?/g, "\n");
    const marker = "// INSERT_SOLUTION_HERE";
    if (text.split(marker).length !== 2 ||
        !text.includes("// BEGIN " + taskId) ||
        !text.includes("// END " + taskId)) {
      throw Error("Проверочный C#-пример урока отсутствует или повреждён.");
    }
    if (/\b(?:class|struct)\s+Program\b/.test(value)) {
      throw Error("В поле задания нужна только реализация метода, без собственного Program. Для полного файла используй редактор ниже.");
    }
    const importPattern = /^\s*using\s+[\w.]+\s*;\s*$/;
    const lines = value.split("\n");
    const extraImports = [...new Set(lines.filter(line => importPattern.test(line)).map(line => line.trim()))]
      .filter(line => !text.includes(line));
    const body = lines.filter(line => !importPattern.test(line)).join("\n").trim();
    if (!body) throw Error("Сначала напиши метод в поле задания.");
    return (extraImports.length ? extraImports.join("\n") + "\n" : "") +
      text.replace(marker, body) + "\n";
  }
  // Expose the same assembly routine to CI without creating a separate JS test engine.
  if (typeof module === "object" && module.exports) module.exports = {buildTaskProgram};
  if (typeof document === "undefined") return;
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

  function addTaskButtons() {
    if (!task) return;
    const actions = task.nextElementSibling;
    if (!actions?.classList.contains("practice-actions")) return;
    const load = document.createElement("button");
    load.type = "button"; load.className = "button primary";
    load.textContent = "▶ Запустить и проверить Assert";
    const save = document.createElement("button");
    save.type="button"; save.className="button";
    save.textContent="Сохранить решение из редактора в задание";
    actions.append(load,save);
    load.addEventListener("click",()=>{
      let code;
      try {
        const template = document.getElementById("practice-program-template")?.textContent;
        code = buildTaskProgram(template, task.value, taskId);
      } catch(error) {show(load,error.message);return;}
      send(load,code,true);
    });
    save.addEventListener("click",()=>{
      const api=bridge();
      if (!api) {show(save,"Компилятор ещё загружается.");return;}
      const code=api.getCode();
      const start=code.indexOf("// BEGIN "+taskId);
      const stop=code.indexOf("// END "+taskId);
      if(start<0 || stop<=start){
        show(save,"Сейчас в редакторе открыт обычный пример, а не решение задания. Чтобы сохранить весь пример, используй кнопку «Скачать .cs» в редакторе. Для переноса решения сначала нажми «Запустить и проверить Assert».");
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
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
