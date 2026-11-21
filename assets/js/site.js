(() => {
  "use strict";
  const copy = async text => {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const el=document.createElement("textarea"); el.value=text; el.style.position="fixed"; el.style.left="-9999px";
    document.body.appendChild(el); el.select(); const ok=document.execCommand("copy"); el.remove();
    if(!ok) throw Error("Copy failed");
  };
  const download=(name,text)=> {
    const blob=new Blob([text],{type:"text/plain;charset=utf-8"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  document.querySelectorAll("pre").forEach(pre=>{
    const div=document.createElement("div"); div.className="code-wrap"; pre.parentNode.insertBefore(div,pre); div.appendChild(pre);
    const b=document.createElement("button");b.type="button";b.className="copy-code";b.textContent="Копировать";div.appendChild(b);
    b.addEventListener("click",async()=>{try{await copy(pre.textContent.replace(/\n$/,""));b.textContent="Готово ✓";}catch{b.textContent="Выдели код вручную";}setTimeout(()=>b.textContent="Копировать",2300);});
  });
  document.querySelectorAll("[data-practice-id]").forEach(editor=>{
    const key="dotnet-learning:practice:"+editor.dataset.practiceId;
    const note=document.createElement("p");
    note.className="draft-status";
    note.setAttribute("role","status");
    note.textContent="Автосохранение включено: черновик остаётся в браузере на этом устройстве.";
    editor.insertAdjacentElement("afterend",note);
    try {
      const saved=localStorage.getItem(key);
      if(saved!==null){
        editor.value=saved;
        note.textContent="✓ Черновик восстановлен из локального хранилища этого браузера.";
      }
    } catch {
      note.textContent="⚠ Локальное сохранение недоступно. Скачай код в .cs.";
    }
    editor.addEventListener("input",()=>{
      try {
        localStorage.setItem(key,editor.value);
        note.textContent="✓ Черновик автоматически сохранён в этом браузере.";
      } catch {
        note.textContent="⚠ Черновик не сохранён. Скачай .cs, чтобы не потерять код.";
      }
    });
  });
  document.querySelectorAll("[data-copy-practice], [data-download-practice]").forEach(btn=>{
    const id=btn.dataset.copyPractice||btn.dataset.downloadPractice;
    const editor=document.querySelector('[data-practice-id="'+id+'"]');
    btn.addEventListener("click",async()=>{
      const feedback=btn.parentNode.querySelector(".practice-feedback");
      if(btn.dataset.downloadPractice){download(id+".cs",editor.value);feedback.textContent="Файл сохранён";return;}
      try{await copy(editor.value);feedback.textContent="Код скопирован";}catch{feedback.textContent="Выдели код вручную";}
    });
  });
  window.DotnetLearning={copy,download};
})();