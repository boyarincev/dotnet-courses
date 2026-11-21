---
layout: default
title: Главная
permalink: /
---
<div class="hero"><div class="eyebrow">Практический курс · C# 13–15 и .NET 9–11</div><h1>Новые возможности.<br><em>Реальные навыки.</em></h1>
<p class="lead">Только полезные изменения: понятное объяснение, запускаемый код, самостоятельная задача и интервальное повторение.</p>
<a class="button primary" href="{{ '/lessons/001-params-countby/' | relative_url }}">Начать обучение →</a><a class="button" href="{{ '/quiz/' | relative_url }}">Квиз</a></div>
<p><a class="button" href="{{ '/labs/001-browser/' | relative_url }}">Урок №1 · Запустить C# в браузере (экспериментальная лаборатория)</a></p>
<div class="features"><div><b>01 · Разобрать</b><p>Зачем нужна фича и когда её применять.</p></div><div><b>02 · Запустить</b><p>Проверенный пример C# и команды запуска.</p></div><div><b>03 · Написать</b><p>Небольшая самостоятельная задача.</p></div><div><b>04 · Повторить</b><p>Вопросы с отдельными ID.</p></div></div>
<h2>Библиотека уроков</h2>
<div class="lessons">{% assign lessons_sorted = site.lessons | sort: 'lesson_number' | reverse %}{% for lesson in lessons_sorted %}
<a class="lesson-card" href="{{ lesson.url | relative_url }}"><small>Урок {{ lesson.lesson_number }} · {{ lesson.lesson_date }} · {{ lesson.series }}</small><h3>{{ lesson.title | escape }}</h3><p>{{ lesson.summary | escape }}</p><span>{{ lesson.csharp_feature }} · {{ lesson.dotnet_feature }}</span><strong>↗</strong></a>{% endfor %}</div>