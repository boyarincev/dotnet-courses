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
  const progressPrefix = "dotnet-courses:progress:";
  const progressKey = (kind, course, lesson) => progressPrefix + kind + ":" + course + ":" + lesson;
  const progress = {
    get(kind, course, lesson) {
      try {
        return localStorage.getItem(progressKey(kind, course, lesson)) === "1";
      } catch {
        return null;
      }
    },
    mark(kind, course, lesson) {
      try {
        localStorage.setItem(progressKey(kind, course, lesson), "1");
      } catch {
        return false;
      }
      refreshProgress();
      return true;
    }
  };

  const lessonStatus = document.getElementById("lesson-completion-status");
  const lessonBadges = document.querySelectorAll("[data-lesson-completion-badge]");
  const courseStart = document.querySelector("[data-course-start]");
  const previousQuiz = document.getElementById("previous-quiz-dialog");
  let quizReminderShown = false;

  function refreshProgress() {
    if (lessonStatus) {
      const completed = progress.get("lesson", lessonStatus.dataset.course, lessonStatus.dataset.lesson);
      const message = completed === null ? "Не удалось прочитать прогресс в этом браузере."
        : completed ? "Урок пройден." : "Урок ещё не пройден.";
      if (lessonStatus.textContent !== message) lessonStatus.textContent = message;
    }

    lessonBadges.forEach(badge => {
      badge.hidden = progress.get("lesson", badge.dataset.course, badge.dataset.lesson) !== true;
    });

    if (courseStart) {
      const courseBadges = [...lessonBadges].filter(badge => badge.dataset.course === courseStart.dataset.courseStart);
      const nextLesson = courseBadges.find(badge => badge.hidden);
      const hasProgress = courseBadges.some(badge => !badge.hidden);
      courseStart.setAttribute("href", nextLesson?.closest(".lesson-card").getAttribute("href") ?? "#course-lessons");
      courseStart.textContent = !hasProgress ? "Начать с первого урока"
        : nextLesson ? `Продолжить с урока ${nextLesson.dataset.lesson}` : "К списку уроков";
    }

    if (previousQuiz && typeof previousQuiz.showModal === "function") {
      const completed = progress.get("quiz", previousQuiz.dataset.course, previousQuiz.dataset.lesson);
      if (completed === false && !quizReminderShown) {
        previousQuiz.showModal();
        quizReminderShown = true;
      } else if (completed !== false && previousQuiz.open) {
        previousQuiz.close();
      }
    }
  }

  window.DotnetLearning = {copy, download, progress};
  if (lessonStatus || lessonBadges.length || previousQuiz) {
    refreshProgress();
    window.addEventListener("pageshow", refreshProgress);
    window.addEventListener("storage", event => {
      if (event.key === null || event.key.startsWith(progressPrefix)) refreshProgress();
    });
  }
})();
