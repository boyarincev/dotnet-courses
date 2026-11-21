(() => {
  "use strict";
  const frame = document.getElementById("browser-lab-compiler");
  const lab = document.getElementById("solution-TASK-001-browser");
  if (!frame || !lab) return;

  function compilerEditor() {
    try {
      if (frame.contentWindow?.location.origin !== window.location.origin) return null;
      return frame.contentDocument?.getElementById("code-editor") || null;
    } catch {
      return null;
    }
  }

  function setStatus(button, text) {
    const label = button.parentElement?.querySelector(".practice-feedback");
    if (label) label.textContent = text;
  }

  document.querySelectorAll("[data-load-compiler]").forEach(button => {
    button.addEventListener("click", () => {
      const source = document.getElementById(button.dataset.loadCompiler);
      const destination = compilerEditor();
      if (!source || !destination) {
        setStatus(button, "Компилятор ещё загружается. Повтори после появления редактора.");
        return;
      }
      // Trigger Blazor's oninput binding, not only a DOM-only value change.
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(destination, source.value);
      else destination.value = source.value;
      destination.dispatchEvent(new Event("input", { bubbles: true }));
      destination.focus();
      setStatus(button, "Код перенесён. Нажми Compile & Run в компиляторе.");
      frame.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });

  const importButton = document.getElementById("browser-lab-import");
  importButton?.addEventListener("click", () => {
    const source = compilerEditor();
    if (!source) {
      setStatus(importButton, "Компилятор ещё загружается.");
      return;
    }
    lab.value = source.value;
    lab.dispatchEvent(new Event("input", { bubbles: true })); // site.js saves draft
    setStatus(importButton, "Код перенесён в задание и сохранён в черновике.");
    lab.scrollIntoView({ block: "nearest" });
  });
})();
