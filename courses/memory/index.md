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
<div class="features"><div><b>До 30 минут</b><p>Одна идея на занятие вместе с практикой и повторением.</p></div><div><b>Свой код</b><p>Небольшая задача на реальном примере.</p></div><div><b>Цепочки тем</b><p>Возвращаемся к знакомому коду в новых условиях.</p></div><div><b>Измерения</b><p>Проверяем, что оптимизация действительно полезна.</p></div></div>
<h2>Опубликованные уроки · {{ site.memory_lessons.size }}</h2>
<div class="lessons">
{% assign sorted = site.memory_lessons | sort: 'lesson_number' | reverse %}
{% for lesson in sorted %}
<a class="lesson-card" href="{{ lesson.url | relative_url }}"><small>Урок {{ lesson.lesson_number }} · {{ lesson.lesson_date }} · {{ lesson.series }}</small><h3>{{ lesson.title | escape }}</h3><p>{{ lesson.summary | escape }}</p><span>{{ lesson.topic_id }} · {{ lesson.dotnet_feature }}</span><strong>↗</strong></a>
{% endfor %}
</div>
<h2>Что будет дальше</h2>
<p>Следующие темы: измерение аллокаций в BenchmarkDotNet, работа GC, Span и ReadOnlySpan, затем отдельная большая цепочка из девяти занятий по readonly. Полная программа и персональные результаты хранятся отдельно от публичного сайта.</p>
