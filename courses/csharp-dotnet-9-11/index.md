---
layout: default
title: C# 13–15 и .NET 9–11
permalink: /courses/csharp-dotnet-9-11/
---
<div class="eyebrow"><a href="{{ '/' | relative_url }}">Все курсы</a> / Курс 01</div>
<h1>Новое в C# и .NET</h1>
<p class="lead">C# 13–15 и .NET 9–11. Выбираем полезные нововведения для реальной работы и объединяем связанные темы в небольшие занятия.</p>
<div class="course-nav">
<a class="button primary" href="{{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}">Начать с первого урока</a>
<a class="button" href="{{ '/courses/csharp-dotnet-9-11/quiz/' | relative_url }}">Квиз и повторение</a>
<a class="button" href="{{ '/courses/memory/' | relative_url }}">Связанный курс: память</a>
</div>
<section class="prose" aria-labelledby="ai-agent-skills">
<h2 id="ai-agent-skills">Как курс помогает работать с ИИ-агентом</h2>
<p>ИИ-агент может быстро предложить несколько реализаций. Знание C# и .NET помогает понять, как они работают, выбрать подходящую для проекта и проверить совместимость с его версией языка и платформы.</p>
<p>На курсе ты будешь применять возможности языка и библиотек в небольших задачах, сравнивать варианты и проверять их на разных входных данных. Эти навыки помогут точнее описывать требования агенту и замечать ошибки в сгенерированном коде.</p>
<p>В эксперименте Anthropic 52 разработчика осваивали незнакомую им библиотеку Trio для Python. Сразу после задания группа с ИИ-помощником набрала в среднем 50% баллов, а группа без него — 67%. Самая большая разница была в вопросах на поиск и объяснение ошибок. Среди тех, кто работал с ИИ, более высокие баллы наблюдали у участников, которые обращались к нему за объяснениями, чтобы самим разобраться в коде. <a href="https://www.anthropic.com/research/AI-assistance-coding-skills">Исследование Anthropic</a>.</p>
</section>
<h2>Уроки · {{ site.lessons.size }}</h2>
<div class="lessons">
{% assign sorted = site.lessons | sort: 'lesson_number' | reverse %}
{% for lesson in sorted %}
<a class="lesson-card" href="{{ lesson.url | relative_url }}"><small>Урок {{ lesson.lesson_number }} · {{ lesson.lesson_date }} · {{ lesson.series }}</small><span class="lesson-completion-badge" data-lesson-completion-badge data-course="csharp-dotnet-9-11" data-lesson="{{ lesson.lesson_number }}" hidden>Пройден</span><h3>{{ lesson.title | escape }}</h3><p>{{ lesson.summary | escape }}</p><span>{{ lesson.csharp_feature }} · {{ lesson.dotnet_feature }}</span><strong>↗</strong></a>
{% endfor %}
</div>
