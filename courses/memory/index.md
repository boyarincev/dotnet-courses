---
layout: default
title: Память и аллокации в .NET
permalink: /courses/memory/
---
<div class="eyebrow"><a href="{{ '/' | relative_url }}">Все курсы</a> / Курс 02</div>
<h1>Память и аллокации в .NET</h1>
<p class="lead">Как уменьшать лишние выделения памяти, копирование и удержание данных в реальном C#-коде. Изучаем GC, Span, readonly, буферы, пулы, строки, коллекции и асинхронность.</p>
<div class="course-nav">
<a class="button primary" href="{{ '/courses/memory/lessons/001-allocations-copies-retention/' | relative_url }}">Начать с первого урока</a>
<a class="button" href="{{ '/courses/memory/quiz/' | relative_url }}">Квиз и повторение</a>
<a class="button" href="{{ '/courses/csharp-dotnet-9-11/' | relative_url }}">Связанный курс: новинки .NET</a>
</div>
<section class="prose" aria-labelledby="ai-agent-skills">
<h2 id="ai-agent-skills">Как курс помогает работать с ИИ-агентом</h2>
<p>Когда ИИ-агент предлагает оптимизацию, ты сможешь проверить, какие объекты создаёт код, где копируются данные и что удерживает объекты в памяти. Это поможет понять, уменьшает ли предложенная правка выделения памяти и какие издержки остаются.</p>
<p>В практических задачах ты сначала определишь, какое поведение нужно сохранить. Затем научишься сравнивать исходный и новый варианты на одинаковых данных и проверять по измерениям, изменились ли время выполнения и объём выделенной памяти.</p>
<p>В эксперименте Anthropic 52 разработчика осваивали незнакомую им библиотеку Trio для Python. Сразу после задания группа с ИИ-помощником набрала в среднем 50% баллов, а группа без него — 67%. Самая большая разница была в вопросах на поиск и объяснение ошибок. Среди тех, кто работал с ИИ, более высокие баллы наблюдали у участников, которые обращались к нему за объяснениями, чтобы самим разобраться в коде. <a href="https://www.anthropic.com/research/AI-assistance-coding-skills">Исследование Anthropic</a>.</p>
</section>
<div class="features"><div><b>До 30 минут</b><p>Одна идея на занятие вместе с практикой и повторением.</p></div><div><b>Свой код</b><p>Небольшая задача на реальном примере.</p></div><div><b>Цепочки тем</b><p>Возвращаемся к знакомому коду в новых условиях.</p></div><div><b>Измерения</b><p>Проверяем, что оптимизация действительно полезна.</p></div></div>
<h2>Опубликованные уроки · {{ site.memory_lessons.size }}</h2>
<div class="lessons">
{% assign sorted = site.memory_lessons | sort: 'lesson_number' | reverse %}
{% for lesson in sorted %}
<a class="lesson-card" href="{{ lesson.url | relative_url }}"><small>Урок {{ lesson.lesson_number }} · {{ lesson.lesson_date }} · {{ lesson.series }}</small><span class="lesson-completion-badge" data-lesson-completion-badge data-course="memory" data-lesson="{{ lesson.lesson_number }}" hidden>Пройден</span><h3>{{ lesson.title | escape }}</h3><p>{{ lesson.summary | escape }}</p><span>{{ lesson.topic_id }} · {{ lesson.dotnet_feature }}</span><strong>↗</strong></a>
{% endfor %}
</div>
<h2>Что будет дальше</h2>
<p>Следующие темы: измерение аллокаций в BenchmarkDotNet, работа GC, Span и ReadOnlySpan, затем отдельная большая цепочка из девяти занятий по readonly. Полная программа и персональные результаты хранятся отдельно от публичного сайта.</p>
