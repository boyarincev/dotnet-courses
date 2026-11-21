---
layout: default
title: Повторение
permalink: /courses/whats-new/quiz/
---
<div class="eyebrow"><a href="{{ '/courses/whats-new/' | relative_url }}">C# 13–15 и .NET 9–11</a> · интервальное повторение</div>
<h1>Вспоминай, а не перечитывай.</h1>
<p class="lead">Короткие вопросы по уже изученному. Каждый имеет собственный ID, поэтому сложный аспект можно повторять чаще, чем простые.</p>
<div class="notice"><strong>Ответы остаются у тебя.</strong> Черновики сохраняются только в браузере. Копируй или скачивай ответы для отправки в ChatGPT, где я их проверю и обновлю личный журнал.</div>
<div class="quiz-toolbar"><strong id="quiz-count">Вопросы</strong> <button type="button" id="quiz-show-all" class="button">Все вопросы</button></div>
<section id="quiz-root" data-course="whats-new" aria-live="polite"></section>
<div id="quiz-actions" hidden class="quiz-actions"><button type="button" id="quiz-copy" class="button primary">Скопировать ответы</button><button type="button" id="quiz-download" class="button">Скачать .txt</button><span id="quiz-feedback" role="status"></span></div>
<p class="muted">Сайт не оценивает правильность самостоятельно. Пропущенный вопрос не считается неправильным.</p>
<script type="application/json" id="question-bank">{{ site.data.questions | jsonify }}</script>
<script defer src="{{ '/assets/js/quiz.js' | relative_url }}"></script>