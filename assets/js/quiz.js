(() => {
  "use strict";
  const root=document.getElementById("quiz-root");
  const courseReview=document.querySelector("[data-course-review]");
  const courseRoot=root??courseReview;
  const source=document.getElementById("question-bank");
  if(!courseRoot || !source) return;
  let bank;
  try {bank=JSON.parse(source.textContent);} catch {bank=[];}
  if(!Array.isArray(bank)) bank=[];
  const course=courseRoot.dataset.course;
  const draftKey="dotnet-courses:quiz-drafts:v1:"+course;
  const fsrsKey="dotnet-courses:fsrs-7:v1:"+course;
  const prefix="dotnet-courses:quiz:v2:"+course+":";
  const importKey=prefix+"import";
  const maxQuestions=5;
  const query=new URLSearchParams(location.search);
  const requested=query.getAll("through");
  const n=requested.length===1 && /^\d+$/.test(requested[0])?Number(requested[0]):null;
  const publishedLessons=(courseRoot.dataset.lessonNumbers||"").split(",").map(Number).filter(number=>number>0);
  const through=publishedLessons.includes(n)?n:null;
  const lessonQuiz=through!==null;
  const todayQuiz=!lessonQuiz && query.get("review")==="today";
  const selectionKey=prefix+"lesson:"+through;
  const ids=new Set(bank.map(q=>q.id));
  const gradeNames={wrong:"Неверно",partial:"Частично",correct:"Верно",easy:"Легко"};
  const count=document.getElementById("quiz-count");
  const context=document.getElementById("quiz-context");
  const lessonNotice=document.getElementById("quiz-lesson-progress");
  const lessonStatus=lessonNotice?.querySelector('[role="status"]');
  const feedback=document.getElementById("quiz-feedback");
  const allButton=document.getElementById("quiz-show-all");
  const allControl=document.getElementById("quiz-all-control");
  const nextButton=document.getElementById("quiz-next");
  const nextControl=document.getElementById("quiz-next-control");
  const actions=document.getElementById("quiz-actions");

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {return null;}
  }
  const isObject=value=>value!==null && typeof value==="object" && !Array.isArray(value);

  function loadSavedData() {
    const imported=read(importKey);
    if(typeof imported?.revision==="string" && isObject(imported.progress) && isObject(imported.drafts)) {
      return imported;
    }
    const progress=read(fsrsKey);
    const drafts=read(draftKey);
    return {revision:"initial",progress:isObject(progress)?progress:{},drafts:isObject(drafts)?drafts:{}};
  }

  let savedData=loadSavedData();
  const unsavedDrafts=new Map();
  let displayed=[];
  let showAll=false;
  let answeredThisSession=new Set();
  let lessonSelection=null;
  let selectionId=null;
  let lessonCompleted=false;
  let extraSelection=false;
  let engine=null;

  function store(key,value) {
    try {
      localStorage.setItem(key,JSON.stringify(value));
      return true;
    } catch {return false;}
  }

  // Keep writes for unrelated questions independent across tabs. An import
  // replaces the baseline in one write and invalidates overrides by revision.
  function readOverride(key, data=savedData) {
    const entry=read(key);
    return entry?.revision===data.revision?entry.value:undefined;
  }

  function writeOverride(key,value) {
    return store(key,{revision:savedData.revision,value});
  }

  function draftFor(id, data=savedData) {
    const draft=unsavedDrafts.get(id)??readOverride(prefix+"draft:"+id,data)??data.drafts[id];
    return typeof draft==="string"?draft:"";
  }

  function recordFor(id, data=savedData) {
    return readOverride(prefix+"card:"+id,data)??data.progress[id];
  }

  function assessmentFor(id) {
    const entry=readOverride(selectionKey+":assessment:"+id);
    return entry?.selectionId===selectionId?entry:undefined;
  }

  function saveAssessment(id,answer,grade) {
    return writeOverride(selectionKey+":assessment:"+id,{selectionId,answer,grade});
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

  function dueReviews(now,records) {
    return engine.eligible(bank,now,null).filter(question=>
      publishedLessons.includes(Number(question.lesson_number)) && records[question.id]?.card &&
      !answeredThisSession.has(question.id) && engine.due(records[question.id],now));
  }

  function currentRecords() {return Object.fromEntries(bank.map(q=>[q.id,recordFor(q.id)]));}
  function cardChanged(key) {return key!==null && (key===fsrsKey || key.startsWith(prefix+"card:"));}

  function updateCourseReview() {
    const remaining=dueReviews(currentTime(),currentRecords()).length;
    courseReview.querySelector("[data-course-review-status]").textContent=
      remaining?"Вопросов к повторению: "+remaining:"На сегодня повторений нет";
    courseReview.querySelector("[data-course-review-action]").hidden=remaining===0;
    courseReview.hidden=false;
  }

  function updateTodayStatus() {
    const remaining=dueReviews(currentTime(),currentRecords()).length;
    count.textContent=remaining?"Осталось повторить: "+remaining:"На сегодня повторений нет";
    nextButton.disabled=remaining===0;
  }

  function choose() {
    extraSelection=false;
    if(showAll)return getEligible();
    const now=currentTime();
    const records=currentRecords();
    const candidates=todayQuiz?dueReviews(now,records):bank;
    const scheduled=engine.select(candidates,records,now,through,maxQuestions,Math.random,[...answeredThisSession]);
    if(scheduled.length || !countsForLesson())return scheduled;

    // Offer a short assessment even when every available card was already reviewed.
    // These ratings belong to this selection and do not reschedule cards.
    const extra=engine.select(bank,{},now,through,maxQuestions);
    extraSelection=extra.length>0;
    return extra;
  }

  function loadLessonSelection() {
    if(lessonCompleted) return choose();
    const saved=readOverride(selectionKey);
    if(Array.isArray(saved?.ids)) {
      const eligible=new Map(getEligible().map(question=>[question.id,question]));
      const questions=saved.ids.map(id=>eligible.get(id)).filter(Boolean);
      if(questions.length) {
        selectionId=saved.id;
        extraSelection=saved.extra;
        return questions;
      }
    }

    const questions=choose();
    if(questions.length) {
      selectionId=crypto.randomUUID();
      if(!writeOverride(selectionKey,{id:selectionId,ids:questions.map(q=>q.id),extra:extraSelection})) {
        feedback.textContent="Не удалось сохранить подборку в этом браузере.";
      }
    }
    return questions;
  }

  function refresh() {
    lessonCompleted=lessonQuiz && window.DotnetLearning?.progress?.get("quiz",course,through)===true;
    if(!lessonQuiz)displayed=choose();
    else if(showAll)displayed=getEligible();
    else {
      lessonSelection??=loadLessonSelection();
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

    const assessed=displayed.filter(q=>assessmentFor(q.id)?.answer===draftFor(q.id).trim()).length;
    if(assessed===displayed.length) {
      lessonCompleted=window.DotnetLearning?.progress?.mark("quiz",course,through)===true;
      lessonStatus.textContent=lessonCompleted?
        "Квиз урока №"+through+" пройден. Отметка сохранена в этом браузере.":
        "Все ответы оценены. Не удалось сохранить отметку в этом браузере.";
      return;
    }

    lessonStatus.textContent="С самооценкой: "+assessed+" из "+displayed.length+"."+
      (extraSelection?" Самооценки в этой подборке сохраняют текущее расписание FSRS.":"");
  }

  function render() {
    const eligible=getEligible();
    root.replaceChildren();
    allButton.textContent=showAll?"Короткая подборка":"Все вопросы";
    if(todayQuiz)updateTodayStatus();
    else {
      count.textContent=displayed.length+" из "+eligible.length+" доступных вопросов";
      nextButton.disabled=showAll;
    }
    actions.hidden=displayed.length===0;
    updateLessonStatus();
    if(!displayed.length) {
      const empty=document.createElement("p");
      empty.className="notice";
      empty.textContent=todayQuiz?"Новые вопросы доступны в квизе курса.":eligible.length?
        "На данный момент нет вопросов к повторению. Даты следующих попыток можно посмотреть через «Все вопросы».":
        "Нет вопросов для выбранного урока.";
      root.append(empty);
      return;
    }
    displayed.forEach(q=>{
      const record=recordFor(q.id);
      const isDue=engine.due(record,currentTime());
      const box=document.createElement("article");
      box.className="question";
      const meta=document.createElement("div");
      meta.className="question-meta";
      meta.textContent="Урок №"+q.lesson_number+" · "+q.id+" · "+q.tag;
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
      input.value=draftFor(q.id);
      input.placeholder="Напиши свой ответ или пример C#…";
      const controls=document.createElement("div");
      controls.className="question-grade-actions";
      const answerHistory=document.createElement("details");
      answerHistory.className="question-answer-history";
      renderAnswerHistory(answerHistory,record?.history);
      const message=document.createElement("span");
      message.className="practice-feedback";
      message.setAttribute("role","status");
      const draftStatus=document.createElement("p");
      draftStatus.className="quiz-draft-status muted";
      draftStatus.setAttribute("role","status");
      if(unsavedDrafts.has(q.id))draftStatus.textContent="Черновик не сохранён. Скопируй ответ перед закрытием страницы.";
      else if(input.value)draftStatus.textContent="Черновик восстановлен";
      const previousAssessment=showAll?null:assessmentFor(q.id);
      const assessed=previousAssessment?.answer===input.value.trim();
      if(assessed)message.textContent="Самооценка «"+gradeNames[previousAssessment.grade]+"» учтена в подборке.";
      else if(previousAssessment && countsForLesson())message.textContent="Поставь самооценку изменённому ответу.";
      input.addEventListener("input",()=>{
        const saved=writeOverride(prefix+"draft:"+q.id,input.value);
        if(saved)unsavedDrafts.delete(q.id);
        else unsavedDrafts.set(q.id,input.value);
        const draftMessage=saved?"Черновик сохранён":"Черновик не сохранён. Скопируй ответ перед закрытием страницы.";
        if(draftStatus.textContent!==draftMessage)draftStatus.textContent=draftMessage;
        if(!countsForLesson())return;
        const assessment=assessmentFor(q.id);
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
          const prior=recordFor(q.id);
          const now=currentTime();
          if(forLesson && (extraSelection || answeredThisSession.has(q.id) || !engine.due(prior,now))) {
            if(!saveAssessment(q.id,answer,grade)) {
              message.textContent="Не удалось сохранить самооценку в этом браузере.";
              return;
            }
            message.textContent="Самооценка «"+title+"» учтена в подборке. Расписание FSRS сохранено.";
            controls.querySelectorAll("button").forEach(b=>b.disabled=true);
            updateLessonStatus();
            return;
          }
          try {
            const updated=engine.evaluate(prior,q.id,grade,input.value,now);
            if(!writeOverride(prefix+"card:"+q.id,updated)) {
              message.textContent="Оценка не сохранена. Попробуй экспортировать ответы.";
              return;
            }
            answeredThisSession.add(q.id);
            status.textContent="Самооценка: "+title+
              " · Следующее повторение: "+prettyDate(updated.card.dueAt)+
              " · Попыток: "+updated.history.length;
            renderAnswerHistory(answerHistory,updated.history);
            if(forLesson && !saveAssessment(q.id,answer,grade)) {
              message.textContent="Расписание FSRS сохранено. Не удалось учесть оценку в подборке. Повтори самооценку.";
              return;
            }
            message.textContent="Оценка сохранена локально. Дату рассчитал FSRS-7.";
            controls.querySelectorAll("button").forEach(b=>b.disabled=true);
            if(forLesson)updateLessonStatus();
            if(todayQuiz)updateTodayStatus();
          } catch (error) {
            message.textContent="Не удалось оценить: "+error.message;
          }
        });
        controls.append(button);
      });
      box.append(meta,heading,status,label,input,draftStatus,controls,message,answerHistory);
      root.append(box);
    });
  }

  function exportAnswers() {
    const label=course==="memory"?"Память и аллокации":"C# 13–15 и .NET 9–11";
    return [".NET Courses — квиз: "+label,
      "Проверь мои ответы, объясни ошибки и дай короткую подсказку для каждого вопроса без ответа.",
      "Дата: "+currentTime().toLocaleString("ru-RU"),
      through?"Уроки №1–"+through:todayQuiz?"Повторение на сегодня":"Весь курс","",
      ...displayed.map(q=>{
        const answer=draftFor(q.id).trim();
        return q.id+" · Урок "+q.lesson_number+"\nВопрос\n"+q.prompt+
          "\nМой ответ\n"+(answer||"(нет ответа)")+"\n";
      })
    ].join("\n");
  }

  function readQuizData() {
    const data=loadSavedData();
    const progress={};
    const drafts={};
    for(const id of ids) {
      const record=recordFor(id,data);
      if(record)progress[id]=record;
      const draft=draftFor(id,data);
      if(draft)drafts[id]=draft;
    }
    return {progress,drafts};
  }

  function resetSelection() {
    answeredThisSession.clear();
    lessonSelection=null;
    selectionId=null;
  }

  function init(srs) {
    engine=srs;
    if(courseReview) {
      const refreshReview=()=>{
        savedData=loadSavedData();
        updateCourseReview();
      };
      window.addEventListener("pageshow",refreshReview);
      window.addEventListener("focus",refreshReview);
      window.addEventListener("storage",event=>{
        if(event.key===null || event.key===importKey || cardChanged(event.key))refreshReview();
      });
      refreshReview();
      return;
    }
    if(lessonNotice)lessonNotice.hidden=!lessonQuiz;
    context.textContent=todayQuiz?"Повторение на сегодня. Ответь на каждый вопрос и поставь самооценку.":through?
      "Уроки №1–"+through+". Ответь на каждый вопрос подборки и поставь самооценку.":
      "Весь курс. Ответь на вопрос и поставь себе оценку, чтобы запланировать повторение.";
    if(nextControl)nextControl.hidden=lessonQuiz;
    if(todayQuiz) {
      allControl.hidden=true;
      nextButton.textContent="Следующая подборка";
      window.addEventListener("storage",event=>{
        if(!cardChanged(event.key))return;
        savedData=loadSavedData();
        updateTodayStatus();
      });
    }
    if(!lessonQuiz)nextButton.addEventListener("click",refresh);
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
    window.DotnetCourseBackup?.attach({
      course, ids, publishedLessons, importKey, readQuizData, reviveCard:engine.reviveCard,
      onImported(quizDataChanged) {
        if(quizDataChanged) {
          savedData=loadSavedData();
          unsavedDrafts.clear();
          resetSelection();
        }
        refresh();
      }
    });
    window.addEventListener("storage",event=>{
      if(event.key==="dotnet-courses:progress:quiz:"+course+":"+through) {
        refresh();
        return;
      }
      if(event.key!==null && event.key!==importKey)return;
      savedData=loadSavedData();
      resetSelection();
      refresh();
    });
    refresh();
  }

  function start() {
    if(window.DotnetQuizSRSReady&&typeof window.DotnetQuizSRSReady.then==="function") {
      window.DotnetQuizSRSReady.then(init).catch(err=>{
        if(root)root.textContent="Не удалось включить интервальное повторение: "+err.message;
      });
    } else if(root) {
      root.textContent="Модуль FSRS-7 не загрузился. Попробуй обновить страницу.";
    }
  }
  // The shared site script exposes local progress after this deferred script.
  if(document.readyState==="complete")start();
  else document.addEventListener("DOMContentLoaded",start,{once:true});
})();
