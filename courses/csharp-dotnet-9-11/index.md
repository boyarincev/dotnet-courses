---
layout: default
title: C# 13–15 и .NET 9–11
permalink: /courses/csharp-dotnet-9-11/
---
<div class="eyebrow"><a href="{{ '/' | relative_url }}">Все курсы</a> / Курс 01</div>
<h1>Новое в C# и .NET</h1>
<p class="lead">C# 13–15 и .NET 9–11. Выбираем полезные нововведения для реальной работы и объединяем связанные темы в небольшие занятия.</p>
{% capture course_overview %}
<div class="course-overview">
  <details class="page-disclosure">
    <summary><h2>Как курс помогает работать с ИИ-агентом</h2></summary>
    <div class="page-disclosure-body prose" id="ai-agent-skills">
      <p>ИИ-агент может быстро предложить несколько реализаций. Знание C# и .NET помогает понять, как они работают, выбрать подходящую для проекта и проверить совместимость с его версией языка и платформы.</p>
      <p>На курсе ты будешь применять возможности языка и библиотек в небольших задачах, сравнивать варианты и проверять их на разных входных данных. Эти навыки помогут точнее описывать требования агенту и замечать ошибки в сгенерированном коде.</p>
      <p>В эксперименте Anthropic 52 разработчика осваивали незнакомую им библиотеку Trio для Python. Сразу после задания группа с ИИ-помощником набрала в среднем 50% баллов, а группа без него — 67%. Самая большая разница была в вопросах на поиск и объяснение ошибок. Среди тех, кто работал с ИИ, более высокие баллы наблюдали у участников, которые обращались к нему за объяснениями, чтобы самим разобраться в коде. <a href="https://www.anthropic.com/research/AI-assistance-coding-skills">Исследование Anthropic</a>.</p>
    </div>
  </details>
  <details class="page-disclosure">
    <summary><h2>Как курс помогает на собеседованиях</h2></summary>
    <div class="page-disclosure-body prose">
      <p>В задачах курса ты тренируешься сравнивать подходы и выбирать решение с учётом требований проекта и версии платформы. На собеседовании это помогает объяснить свой выбор, назвать ограничения решения и рассказать, как ты проверяешь корректность кода.</p>
    </div>
  </details>
</div>
{% endcapture %}
{% include course-lessons.html lessons=site.lessons questions=site.data.questions course="csharp-dotnet-9-11" quiz="/courses/csharp-dotnet-9-11/quiz/" related="/courses/memory/" related_label="Связанный курс: память" overview=course_overview %}
{% include course-backup.html lessons=site.lessons %}
