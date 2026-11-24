---
layout: default
title: Каталог курсов
permalink: /
---
<div class="hero">
  <h1>Практические курсы по .NET</h1>
  <p class="lead">Короткие уроки для опытных C#/.NET-разработчиков. Запускай примеры в браузере, решай задачи и повторяй изученное в квизах.</p>
</div>
<div class="course-grid">
  <a class="course-card" href="{{ '/courses/csharp-dotnet-9-11/' | relative_url }}">
    <h2>C# 13–15 и .NET 9–11</h2>
    <p>Полезные нововведения языка и библиотек, сгруппированные в связанные учебные цепочки.</p>
    <span class="course-meta">Доступно уроков: {{ site.lessons.size }}</span>
    <strong>Перейти к урокам ↗</strong>
  </a>
  <a class="course-card" href="{{ '/courses/memory/' | relative_url }}">
    <h2>Память и аллокации в .NET</h2>
    <p>Аллокации, копирование, GC, readonly, Span, временные буферы, пулы и производительные API.</p>
    <span class="course-meta">Доступно уроков: {{ site.memory_lessons.size }} · 45 тем в программе</span>
    <strong>Перейти к урокам ↗</strong>
  </a>
</div>
<p>Большинство занятий укладывается в 30 минут вместе с практикой и повторением. <a href="{{ '/about/' | relative_url }}">Как устроено обучение</a></p>
