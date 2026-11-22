(() => {
  "use strict";
  const root=document.getElementById("quiz-root");
  const source=document.getElementById("question-bank");
  if(!root || !source) return;
  let bank;
  try {bank=JSON.parse(source.textContent);} catch {bank=[];}
  if(!Array.isArray(bank)) bank=[];
  const course=root.dataset.course;
  const draftKey="dotnet-courses:quiz-drafts:v1:"+course;
  const fsrsKey="dotnet-courses:fsrs-7:v1:"+course;
  const maxQuestions=5;
  const requested=new URLSearchParams(location.search).getAll("through");
  const courseWide=requested.length===0;
  const n=requested.length===1 && /^\d+$/.test(requested[0])?Number(requested[0]):null;
  const through=Number.isSafeInteger(n) && n>0?n:null;
  const publishedLessons=(root.dataset.lessonNumbers||"").split(",").map(Number);
  const lessonQuiz=through!==null && publishedLessons.includes(through);
  const ids=new Set(bank.map(q=>q.id));
  const gradeNames={wrong:"Неверно",partial:"Частично",correct:"Верно",easy:"Легко"};
  const count=document.getElementById("quiz-count");
  const context=document.getElementById("quiz-context");
  const lessonNotice=document.getElementById("quiz-lesson-progress");
  const lessonStatus=lessonNotice?.querySelector('[role="status"]');
  const feedback=document.getElementById("quiz-feedback");
  const allButton=document.getElementById("quiz-show-all");
  const nextButton=document.getElementById("quiz-next");
  const nextControl=document.getElementById("quiz-next-control");
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
  let drafts=read(draftKey);
  let records=read(fsrsKey);
  let displayed=[];
  let showAll=false;
  let answeredThisSession=new Set();
  const selectionAssessments=new Map();
  let lessonSelection=null;
  let lessonCompleted=false;
  let extraSelection=false;
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
  const prettyDate=(value,options={})=>{
    const d=new Date(value);
    return isNaN(d.valueOf())?"неизвестна":d.toLocaleString("ru-RU",{
      day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",...options
    });
  };

  function renderAnswerHistory(details,attempts) {
    const answers=Array.isArray(attempts)?attempts.filter(attempt=>
      typeof attempt?.answer==="string" && attempt.answer.trim()):[];
    details.hidden=answers.length===0;
    if(details.hidden)return;

    const summary=document.createElement("summary");
    summary.textContent="История ответов";
    const list=document.createElement("ol");
    list.reversed=true;
    for(const attempt of answers.reverse()) {
      const item=document.createElement("li");
      const date=document.createElement("span");
      date.className="muted";
      const timestamp=typeof attempt.at==="string"?attempt.at:undefined;
      date.textContent="Дата попытки · "+prettyDate(timestamp,{year:"numeric"});
      const answer=document.createElement("pre");
      answer.textContent=attempt.answer;
      item.append(date,answer);
      list.append(item);
    }
    details.replaceChildren(summary,list);
  }

  function getEligible() {return engine.eligible(bank,currentTime(),through);}
  function countsForLesson() {return lessonQuiz && !showAll && !lessonCompleted;}

  function choose() {
    extraSelection=false;
    if(showAll)return getEligible();
    const now=currentTime();
    const scheduled=engine.select(bank,records,now,through,maxQuestions,Math.random,[...answeredThisSession]);
    if(scheduled.length || !countsForLesson())return scheduled;

    // Offer a short assessment even when every available card was already reviewed.
    // These ratings belong to this selection and do not reschedule cards.
    const extra=engine.select(bank,{},now,through,maxQuestions);
    extraSelection=extra.length>0;
    return extra;
  }

  function refresh() {
    lessonCompleted=lessonQuiz && window.DotnetLearning?.progress?.get("quiz",course,through)===true;
    if(!lessonQuiz)displayed=choose();
    else if(showAll)displayed=getEligible();
    else {
      lessonSelection??=choose();
      displayed=lessonSelection;
    }
    render();
  }

  function updateLessonStatus() {
    if(!lessonQuiz || !lessonStatus)return;
    if(lessonCompleted) {
      lessonStatus.textContent="Квиз урока №"+through+" пройден.";
      return;
    }
    if(showAll) {
      lessonStatus.textContent="Вернись в короткую подборку, чтобы продолжить квиз урока.";
      return;
    }
    if(!displayed.length) {
      lessonStatus.textContent="Для квиза урока пока нет доступных вопросов.";
      return;
    }

    const assessed=displayed.filter(q=>
      selectionAssessments.get(q.id)?.answer===String(drafts[q.id]??"").trim()).length;
    if(assessed===displayed.length) {
      lessonCompleted=window.DotnetLearning?.progress?.mark("quiz",course,through)===true;
      lessonStatus.textContent=lessonCompleted?
        "Квиз урока №"+through+" пройден. Отметка сохранена в этом браузере.":
        "Все ответы оценены. Не удалось сохранить отметку в этом браузере.";
      return;
    }

    lessonStatus.textContent="Ответы с самооценкой в этой подборке: "+assessed+" из "+displayed.length+"."+
      (extraSelection?" Самооценки в этой подборке сохраняют текущее расписание FSRS.":"");
  }

  function render() {
    const eligible=getEligible();
    root.replaceChildren();
    count.textContent=displayed.length+" из "+eligible.length+" доступных вопросов";
    allButton.textContent=showAll?"Короткая подборка":"Все вопросы";
    nextButton.disabled=showAll;
    actions.hidden=displayed.length===0;
    updateLessonStatus();
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
      const controls=document.createElement("div");
      controls.className="question-grade-actions";
      const answerHistory=document.createElement("details");
      answerHistory.className="question-answer-history";
      renderAnswerHistory(answerHistory,record?.history);
      const message=document.createElement("span");
      message.className="practice-feedback";
      message.setAttribute("role","status");
      const previousAssessment=showAll?null:selectionAssessments.get(q.id);
      const assessed=previousAssessment?.answer===input.value.trim();
      if(assessed)message.textContent="Самооценка «"+gradeNames[previousAssessment.grade]+"» учтена в подборке.";
      else if(previousAssessment && countsForLesson())message.textContent="Поставь самооценку изменённому ответу.";
      input.addEventListener("input",()=>{
        drafts[q.id]=input.value;
        store(draftKey,drafts);
        if(!countsForLesson())return;
        const assessment=selectionAssessments.get(q.id);
        if(assessment) {
          const matches=assessment.answer===input.value.trim();
          controls.querySelectorAll("button").forEach(b=>b.disabled=matches);
          message.textContent=matches?"Ответ учтён в подборке.":"Поставь самооценку изменённому ответу.";
        }
        updateLessonStatus();
      });
      Object.entries(gradeNames).forEach(([grade,title])=>{
        const button=document.createElement("button");
        button.type="button";
        button.className="button";
        button.textContent=title;
        button.disabled=assessed || (!isDue && !countsForLesson());
        button.title="Это твоя самооценка, а не автоматическая проверка";
        button.addEventListener("click",()=>{
          const answer=input.value.trim();
          if(!answer) {
            input.focus();
            message.textContent="Сначала напиши ответ.";
            return;
          }
          const forLesson=countsForLesson();
          const prior=records[q.id];
          const now=currentTime();
          if(forLesson && (extraSelection || answeredThisSession.has(q.id) || !engine.due(prior,now))) {
            selectionAssessments.set(q.id,{answer,grade});
            message.textContent="Самооценка «"+title+"» учтена в подборке. Расписание FSRS сохранено.";
            controls.querySelectorAll("button").forEach(b=>b.disabled=true);
            updateLessonStatus();
            return;
          }
          try {
            const updated=engine.evaluate(prior,q.id,grade,input.value,now);
            records[q.id]=updated;
            if(!store(fsrsKey,records)) {
              if(prior)records[q.id]=prior;
              else delete records[q.id];
              message.textContent="Оценка не сохранена. Попробуй экспортировать ответы.";
              return;
            }
            answeredThisSession.add(q.id);
            if(forLesson)selectionAssessments.set(q.id,{answer,grade});
            status.textContent="Самооценка: "+title+
              " · Следующее повторение: "+prettyDate(updated.card.dueAt)+
              " · Попыток: "+updated.history.length;
            message.textContent="Оценка сохранена локально. Дату рассчитал FSRS-7.";
            controls.querySelectorAll("button").forEach(b=>b.disabled=true);
            renderAnswerHistory(answerHistory,updated.history);
            if(forLesson)updateLessonStatus();
          } catch (error) {
            message.textContent="Не удалось оценить: "+error.message;
          }
        });
        controls.append(button);
      });
      box.append(meta,heading,status,label,input,controls,message,answerHistory);
      root.append(box);
    });
  }

  function exportAnswers() {
    const label=course==="memory"?"Память и аллокации":"C# 13–15 и .NET 9–11";
    return [".NET Courses — квиз: "+label,
      "Проверь мои ответы, объясни ошибки и дай короткую подсказку для каждого вопроса без ответа.",
      "Дата: "+currentTime().toLocaleString("ru-RU"),
      through?"Уроки №1–"+through:"Весь курс","",
      ...displayed.map(q=>{
        const answer=String(drafts[q.id]??"").trim();
        return q.id+" · Урок "+q.lesson_number+"\nВопрос\n"+q.prompt+
          "\nМой ответ\n"+(answer||"(нет ответа)")+"\n";
      })
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
      if(!store(fsrsKey,records)||!store(draftKey,drafts)) {
        records=oldP;drafts=oldD;
        store(fsrsKey,records);store(draftKey,drafts);
        throw Error("Невозможно сохранить импорт в этом браузере.");
      }
      answeredThisSession=new Set();
      selectionAssessments.clear();
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
    if(lessonNotice)lessonNotice.hidden=!lessonQuiz;
    context.textContent=through?
      "Случайные вопросы по урокам №1–"+through+
      ". Приоритет — трудным и просроченным карточкам; затем новым.":
      "Общее повторение всего курса: случайные просроченные и новые вопросы.";
    if(nextControl)nextControl.hidden=!courseWide;
    if(courseWide)nextButton.addEventListener("click",refresh);
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

  function start() {
    if(window.DotnetQuizSRSReady&&typeof window.DotnetQuizSRSReady.then==="function") {
      window.DotnetQuizSRSReady.then(init).catch(err=>{
        root.textContent="Не удалось включить интервальное повторение: "+err.message;
      });
    } else {
      root.textContent="Модуль FSRS-7 не загрузился. Попробуй обновить страницу.";
    }
  }
  // The shared site script exposes local progress after this deferred script.
  if(document.readyState==="complete")start();
  else document.addEventListener("DOMContentLoaded",start,{once:true});
})();
