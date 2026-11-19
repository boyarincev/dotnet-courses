(() => {
 "use strict";
 const root=document.getElementById("quiz-root"), source=document.getElementById("question-bank");
 if(!root||!source) return;
 let bank;try{bank=JSON.parse(source.textContent)}catch{bank=[]}
 if(!Array.isArray(bank)) bank=[];
 let drafts={};try{drafts=JSON.parse(localStorage.getItem("dotnet-learning:quiz-drafts")||"{}")}catch{}
 const today=new Date().toLocaleDateString("sv-SE");
 const available=bank.filter(q=>!q.available_from || q.available_from<=today);
 const first=["CS13-P-01","N9-CB-01","N9-CB-02","CS13-P-02"];
 let short=[...available.filter(q=>first.includes(q.id)),...available.filter(q=>!first.includes(q.id))].slice(0,4);
 let displayed=short,all=false;
 const toolbar=document.getElementById("quiz-show-all"),count=document.getElementById("quiz-count"),actions=document.getElementById("quiz-actions"),feedback=document.getElementById("quiz-feedback");
 function draw(){
   root.replaceChildren();
   count.textContent=displayed.length+" из "+available.length+" вопросов";
   toolbar.hidden=available.length<=4;
   toolbar.textContent=all?"Короткий квиз":"Все вопросы";
   actions.hidden=!displayed.length;
   if(!displayed.length){root.textContent="Вопросы откроются с 20 ноября.";return;}
   displayed.forEach((q,i)=>{
     const card=document.createElement("article");card.className="question";
     const meta=document.createElement("div");meta.className="question-meta";meta.textContent="ВОПРОС "+(i+1)+" · "+q.id+" · "+q.tag+" · "+q.type;
     const title=document.createElement("h2");title.textContent=q.prompt;
     const label=document.createElement("label");label.textContent="Твой ответ";label.htmlFor="a-"+q.id;
     const field=document.createElement("textarea");field.id="a-"+q.id;field.rows=4;field.value=drafts[q.id]||"";field.placeholder="Напиши ответ или фрагмент C#…";
     field.addEventListener("input",()=>{drafts[q.id]=field.value;try{localStorage.setItem("dotnet-learning:quiz-drafts",JSON.stringify(drafts))}catch{}});
     card.append(meta,title,label,field);root.appendChild(card);
   });
 }
 toolbar.addEventListener("click",()=>{all=!all;displayed=all?available:short;draw()});
 const exportText=()=>[".NET Learning Lab — квиз", "Дата: "+today,"",...displayed.map(q=>q.id+"\n"+((drafts[q.id]||"").trim()||"(нет ответа)")+"\n"),"Проверь каждый Q-ID и обнови журнал интервальных повторений."].join("\n");
 document.getElementById("quiz-copy").addEventListener("click",async()=>{
  try{await window.DotnetLearning.copy(exportText());feedback.textContent="Ответы скопированы — вставь их в чат.";}
  catch{feedback.textContent="Используй скачивание .txt.";}
 });
 document.getElementById("quiz-download").addEventListener("click",()=>{window.DotnetLearning.download("quiz-"+today+".txt",exportText());feedback.textContent="Файл сохранён."});
 draw();
})();