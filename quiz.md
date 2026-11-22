---
layout: default
title: Повторение
permalink: /courses/csharp-dotnet-9-11/quiz/
---
<div class="eyebrow"><a href="{{ '/courses/csharp-dotnet-9-11/' | relative_url }}">C# 13–15 и .NET 9–11</a> · интервальное повторение</div>
<h1>Вспоминай, а не перечитывай.</h1>
<p class="lead">Короткие вопросы по уже изученному. Каждый имеет собственный ID, поэтому сложный аспект можно повторять чаще, чем простые.</p>
<div class="notice"><strong>Ответы остаются у тебя.</strong> Черновики сохраняются только в браузере. Копируй или скачивай ответы для отправки в ChatGPT, где я их проверю и обновлю личный журнал.</div>
<p class="muted" id="quiz-context"></p>
<div id="quiz-lesson-progress" hidden>
  <p class="muted">Чтобы пройти квиз урока, ответь на все вопросы короткой подборки и поставь каждому ответу любую самооценку. Отметка хранится в этом браузере.</p>
  <p class="muted" role="status"></p>
</div>
<div class="quiz-toolbar"><strong id="quiz-count">Вопросы</strong><div><span id="quiz-next-control" hidden><button type="button" id="quiz-next" class="button">Другая подборка</button></span><button type="button" id="quiz-show-all" class="button">Все вопросы</button></div></div>
<section id="quiz-root" data-course="csharp-dotnet-9-11" data-lesson-numbers="{{ site.lessons | map: 'lesson_number' | join: ',' }}" aria-live="polite"></section>
<div id="quiz-actions" hidden class="quiz-actions"><button type="button" id="quiz-copy" class="button primary">Скопировать ответы</button><button type="button" id="quiz-download" class="button">Скачать .txt</button><span id="quiz-feedback" role="status"></span></div>
<p class="muted">Сайт не оценивает правильность самостоятельно. Пропущенный вопрос не считается неправильным.</p>
<script type="application/json" id="question-bank">{{ site.data.questions | jsonify }}</script>
<div class="quiz-progress-actions">
  <button type="button" id="quiz-export-progress" class="button">Экспорт прогресса (.json)</button>
  <button type="button" id="quiz-import-progress" class="button">Импорт прогресса</button>
  <input id="quiz-import-file" type="file" accept="application/json,.json" hidden>
</div>
<p class="muted">FSRS-7 рассчитывает интервалы по твоей самооценке. После ответа нажми «Неверно», «Частично», «Верно» или «Легко». Прогресс и ответы остаются только в этом браузере, не отправляются автоматически в Google Docs. При смене устройства используй экспорт и импорт.</p>
<script defer src="{{ '/assets/js/quiz-fsrs.js' | relative_url }}?v={{ site.data.build.revision | default: 'dev' }}"></script>
<script defer src="{{ '/assets/js/quiz.js' | relative_url }}?v={{ site.data.build.revision | default: 'dev' }}"></script>
