(() => {
  "use strict";
  const root=document.getElementById("quiz-root");
  const source=document.getElementById("question-bank");
  if(!root || !source) return;
  let bank;
  try {bank=JSON.parse(source.textContent);} catch {bank=[];}
  if(!Array.isArray(bank)) bank=[];
  const course=root.dataset.course==="memory"?"memory":"whats-new";
  const oldDraftKey=course==="memory"?"dotnet-learning:quiz-drafts:memory":"dotnet-learning:quiz-drafts";
  const fsrsKey="dotnet-courses:fsrs-7:v1:"+course;
  const maxQuestions=5;
  const requested=new URLSearchParams(location.search).get("through");
  const n=requested!==null && /^\d+$/.test(requested)?Number(requested):null;
  const through=Number.isSafeInteger(n) && n>0?n:null;
  const ids=new Set(bank.map(q=>q.id));
  const gradeNames={wrong:"Неверно",partial:"Частично",correct:"Верно",easy:"Легко"};
  const count=document.getElementById("quiz-count");
  const context=document.getElementById("quiz-context");
  const feedback=document.getElementById("quiz-feedback");
  const allButton=document.getElementById("quiz-show-all");
  const nextButton=document.getElementById("quiz-next");
  const actions=document.getElementById("quiz-actions");
  const exportButton=document.getElementById("quiz-export-progress");
  const importButton=document.getElementById("quiz-import-progress");
  const importFile=document.getElementById("quiz-import-file");

  function read(key) {
    try {
      const value=JSON.parse(localStorage.getItem(key)||"null");
      return value && typeof value==="object" && !Array.isArray(value)?value:{};
    } catch {return {};}
  }
  let drafts=read(oldDraftKey);
  let records=read(fsrsKey);
  let displayed=[];
  let showAll=false;
  let answeredThisSession=new Set();
  let engine=null;

  function store(key,value) {
    try {
      localStorage.setItem(key,JSON.stringify(value));
      return true;
    } catch {
      feedback.textContent="Не удалось сохранить прогресс. Экспортируй данные или проверь настройки браузера.";
      return false;
    }
  }

  const currentTime=()=>new Date();
  const prettyDate=value=>{
    const d=new Date(value);
    return isNaN(d.valueOf())?"неизвестна":d.toLocaleString("ru-RU",{
      day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"
    });
  };

  function getEligible() {return engine.eligible(bank,currentTime(),through);}
  function choose() {
    return showAll?getEligible():engine.select(
      bank,records,currentTime(),through,maxQuestions,Math.random,[...answeredThisSession]);
  }
  function refresh() {displayed=choose();render();}

  function render() {
    const eligible=getEligible();
    root.replaceChildren();
    count.textContent=displayed.length+" из "+eligible.length+" доступных вопросов";
    allButton.textContent=showAll?"Короткая подборка":"Все вопросы";
    nextButton.disabled=showAll;
    actions.hidden=displayed.length===0;
    if(!displayed.length) {
      const empty=document.createElement("p");
      empty.className="notice";
      empty.textContent=eligible.length?
        "На данный момент нет вопросов к повторению. Даты следующих попыток можно посмотреть через «Все вопросы».":
        "Нет вопросов для выбранного урока.";
      root.append(empty);
      return;
    }
    displayed.forEach((q,i)=>{
      const record=records[q.id];
      const isDue=engine.due(record,currentTime());
      const box=document.createElement("article");
      box.className="question";
      const meta=document.createElement("div");
      meta.className="question-meta";
      meta.textContent="ВОПРОС "+(i+1)+" · УРОК №"+q.lesson_number+
        " · "+q.id+" · "+q.tag+" · "+q.type;
      const heading=document.createElement("h2");
      heading.textContent=q.prompt;
      const status=document.createElement("p");
      status.className="question-status";
      status.textContent=record?.card?
        ((isDue?"Пора повторить":"Следующее повторение: "+prettyDate(record.card.dueAt))+
          " · Попыток: "+(record.history?.length||0)):
        "Новый вопрос";
      const label=document.createElement("label");
      label.htmlFor="a-"+q.id;
      label.textContent="Твой ответ";
      const input=document.createElement("textarea");
      input.id="a-"+q.id;
      input.rows=4;
      input.value=drafts[q.id]||"";
      input.placeholder="Напиши свой ответ или пример C#…";
      input.addEventListener("input",()=>{
        drafts[q.id]=input.value;
        store(oldDraftKey,drafts);
      });
      const controls=document.createElement("div");
      controls.className="question-grade-actions";
      const message=document.createElement("span");
      message.className="practice-feedback";
      message.setAttribute("role","status");
      Object.entries(gradeNames).forEach(([grade,title])=>{
        const button=document.createElement("button");
        button.type="button";
        button.className="button";
        button.textContent=title;
        button.disabled=!isDue;
        button.title="Это твоя самооценка, а не автоматическая проверка";
        button.addEventListener("click",()=>{
          if(!input.value.trim()) {
            input.focus();
            message.textContent="Сначала напиши ответ.";
            return;
          }
          const prior=records[q.id];
          try {
            const updated=engine.evaluate(prior,q.id,grade,input.value,currentTime());
            records[q.id]=updated;
            if(!store(fsrsKey,records)) {
              if(prior)records[q.id]=prior;
              else delete records[q.id];
              message.textContent="Оценка не сохранена. Попробуй экспортировать ответы.";
              return;
            }
            answeredThisSession.add(q.id);
            status.textContent="Самооценка: "+title+
              " · Следующее повторение: "+prettyDate(updated.card.dueAt)+
              " · Попыток: "+updated.history.length;
            message.textContent="Оценка сохранена локально. Дату рассчитал FSRS-7.";
            controls.querySelectorAll("button").forEach(b=>b.disabled=true);
          } catch (error) {
            message.textContent="Не удалось оценить: "+error.message;
          }
        });
        controls.append(button);
      });
      box.append(meta,heading,status,label,input,controls,message);
      root.append(box);
    });
  }

  function exportAnswers() {
    const label=course==="memory"?"Память и аллокации":"C# 13–15 и .NET 9–11";
    return [".NET Courses — квиз: "+label,"Дата: "+currentTime().toLocaleString("ru-RU"),
      through?"Уроки №1–"+through:"Весь курс","",
      ...displayed.map(q=>q.id+" · Урок "+q.lesson_number+"\n"+
        ((drafts[q.id]||"").trim()||"(нет ответа)")+"\n"+
        (records[q.id]?.lastGrade?
          "Самооценка: "+gradeNames[records[q.id].lastGrade]:"Самооценка: нет")+"\n"),
      "Самооценка не является независимой проверкой правильности ответа."
    ].join("\n");
  }

  function saveProgress() {
    const payload={format:"dotnet-courses-fsrs-v1",algorithm:"FSRS-7",
      course,exportedAt:currentTime().toISOString(),progress:records,drafts};
    window.DotnetLearning.download("progress-"+course+".json",JSON.stringify(payload,null,2));
    feedback.textContent="Прогресс скачан. В JSON содержатся твои ответы — храни файл приватно.";
  }

  async function restore(file) {
    if(!file||file.size>10_000_000) {
      feedback.textContent="Нужен JSON-файл прогресса размером не более 10 МБ.";
      return;
    }
    try {
      const data=JSON.parse(await file.text());
      if(data.format!=="dotnet-courses-fsrs-v1"||data.course!==course||
         !data.progress||typeof data.progress!=="object"||Array.isArray(data.progress)||
         !data.drafts||typeof data.drafts!=="object"||Array.isArray(data.drafts)) {
        throw Error("Это не файл прогресса данного курса.");
      }
      for(const [id,record] of Object.entries(data.progress)) {
        if(!ids.has(id)||!record||!record.card||!Array.isArray(record.history)||
           !Number.isFinite(new Date(record.card.dueAt).getTime())) {
          throw Error("Некорректная карточка: "+id);
        }
      }
      if(!window.confirm("Заменить текущие локальные данные импортированными? Перед импортом лучше сохранить резервную копию."))return;
      const oldP=records,oldD=drafts;
      records=data.progress;
      drafts=data.drafts;
      if(!store(fsrsKey,records)||!store(oldDraftKey,drafts)) {
        records=oldP;drafts=oldD;
        store(fsrsKey,records);store(oldDraftKey,drafts);
        throw Error("Невозможно сохранить импорт в этом браузере.");
      }
      answeredThisSession=new Set();
      refresh();
      feedback.textContent="Прогресс импортирован.";
    } catch(error) {
      feedback.textContent="Ошибка импорта: "+error.message;
    } finally {
      importFile.value="";
    }
  }

  function init(srs) {
    engine=srs;
    context.textContent=through?
      "Случайные вопросы по урокам №1–"+through+
      ". Приоритет — трудным и просроченным карточкам; затем новым.":
      "Общее повторение всего курса: случайные просроченные и новые вопросы.";
    nextButton.addEventListener("click",()=>{showAll=false;refresh();});
    allButton.addEventListener("click",()=>{showAll=!showAll;refresh();});
    document.getElementById("quiz-copy").addEventListener("click",async()=>{
      try {
        await window.DotnetLearning.copy(exportAnswers());
        feedback.textContent="Ответы скопированы. Отправь в чат для проверки.";
      } catch {
        feedback.textContent="Скопировать не удалось — используй скачивание .txt.";
      }
    });
    document.getElementById("quiz-download").addEventListener("click",()=>{
      window.DotnetLearning.download("quiz-"+course+".txt",exportAnswers());
      feedback.textContent="Ответы сохранены в .txt.";
    });
    exportButton.addEventListener("click",saveProgress);
    importButton.addEventListener("click",()=>importFile.click());
    importFile.addEventListener("change",()=>restore(importFile.files?.[0]));
    refresh();
  }

  if(window.DotnetQuizSRSReady&&typeof window.DotnetQuizSRSReady.then==="function") {
    window.DotnetQuizSRSReady.then(init).catch(err=>{
      root.textContent="Не удалось включить интервальное повторение: "+err.message;
    });
  } else {
    root.textContent="Модуль FSRS-7 не загрузился. Попробуй обновить страницу.";
  }
})();
