---
layout: default
title: Повторение · память и аллокации
permalink: /courses/memory/quiz/
---
<div class="eyebrow"><a href="{{ '/courses/memory/' | relative_url }}">Память и аллокации .NET</a> · интервальное повторение</div>
<h1>Помни причины, а не только синтаксис.</h1>
<p class="lead">Короткие вопросы по урокам курса памяти. У каждого вопроса свой постоянный ID; сначала вспоминаем, потом сверяем объяснение.</p>
<div class="notice"><strong>Ответы остаются у тебя.</strong> Черновики хранятся в браузере отдельно от другого курса. Экспортируй ответы и пришли мне на проверку; персональную историю не публикуем.</div>
<div class="quiz-toolbar"><strong id="quiz-count">Вопросы</strong> <button type="button" id="quiz-show-all" class="button">Все вопросы</button></div>
<section id="quiz-root" data-course="memory" aria-live="polite"></section>
<div id="quiz-actions" hidden class="quiz-actions"><button type="button" id="quiz-copy" class="button primary">Скопировать ответы</button><button type="button" id="quiz-download" class="button">Скачать .txt</button><span id="quiz-feedback" role="status"></span></div>
<p class="muted">Сайт не выставляет оценок автоматически. Пропущенный вопрос не означает ошибку.</p>
<script type="application/json" id="question-bank">{{ site.data.memory_questions | jsonify }}</script>
<script defer src="{{ '/assets/js/quiz.js' | relative_url }}"></script>
