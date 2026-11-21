---
layout: default
title: C# 13–15 и .NET 9–11
permalink: /courses/whats-new/
---
<div class="eyebrow"><a href="{{ '/' | relative_url }}">Все курсы</a> / Курс 01</div>
<h1>Новое в C# и .NET</h1>
<p class="lead">C# 13–15 и .NET 9–11. Выбираем полезные нововведения для реальной работы и объединяем связанные темы в небольшие занятия.</p>
<div class="course-nav">
<a class="button primary" href="{{ '/courses/whats-new/lessons/001-params-countby/' | relative_url }}">Начать с первого урока</a>
<a class="button" href="{{ '/courses/whats-new/quiz/' | relative_url }}">Квиз и повторение</a>
<a class="button" href="{{ '/courses/memory/' | relative_url }}">Связанный курс: память</a>
</div>
<h2>Уроки · {{ site.lessons.size }}</h2>
<div class="lessons">
{% assign sorted = site.lessons | sort: 'lesson_number' | reverse %}
{% for lesson in sorted %}
<a class="lesson-card" href="{{ lesson.url | relative_url }}"><small>Урок {{ lesson.lesson_number }} · {{ lesson.lesson_date }} · {{ lesson.series }}</small><h3>{{ lesson.title | escape }}</h3><p>{{ lesson.summary | escape }}</p><span>{{ lesson.csharp_feature }} · {{ lesson.dotnet_feature }}</span><strong>↗</strong></a>
{% endfor %}
</div>
