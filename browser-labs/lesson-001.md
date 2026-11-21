---
layout: default
title: 'Лаборатория 001 — запускаем C# в браузере'
permalink: /labs/001-browser/
---
<div class="eyebrow">Экспериментальная версия · урок №1 · 20 ноября 2026</div>

# C# 13 params collections + .NET 9 CountBy — с запуском кода

Это **дополнительная лаборатория к [первому уроку]({{ '/lessons/001-params-countby/' | relative_url }})**, а не новый учебный день. Материал, практическое задание TASK-001 и [квиз]({{ '/quiz/' | relative_url }}) остались теми же; изменился способ практики: теперь можно редактировать, компилировать и выполнять настоящий C# непосредственно в браузере.

## Что будем проверять

Представь журнал HTTP-методов. В C# 13 параметр params можно использовать не только с массивами, но и с IEnumerable и ReadOnlySpan. Последний иногда позволяет избежать выделения массива, но **не гарантирует** отсутствие аллокаций.

В .NET 9 CountBy сразу выдаёт частоты по ключам вместо групп GroupBy, возвращая последовательность пар KeyValuePair, а не словарь. С StringComparer.OrdinalIgnoreCase методы GET и get считаются одинаковыми. При повторном перечислении CountBy выполняется заново.

**Попробуй изменить пример:** добавь ещё один POST, затем убери StringComparer.OrdinalIgnoreCase и сравни вывод.

## 1. Готовая программа — воспроизведи результат

Программа использует **C# 13 и .NET 9**, а не JavaScript-имитацию. Нажми «Загрузить пример в компилятор»; затем во встроенном редакторе — **Compile & Run** (либо Ctrl+Enter).

<label for="browser-lab-demo" class="editor-label">Program.cs — исходный пример</label>
<textarea id="browser-lab-demo" class="code-editor" spellcheck="false" rows="22">using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        PrintCounts("HTTP methods", "GET", "POST", "get", "PUT", "post", "GET");
        Console.WriteLine($"Sum = {Sum(10, 20, 30)}");
    }

    private static void PrintCounts(string title, params IEnumerable&lt;string&gt; values)
    {
        Console.WriteLine(title);
        var counts = values.CountBy(x =&gt; x, StringComparer.OrdinalIgnoreCase)
                           .OrderByDescending(x =&gt; x.Value);
        foreach (var (method, count) in counts)
            Console.WriteLine($"{method}: {count}");
    }

    private static int Sum(params ReadOnlySpan&lt;int&gt; values)
    {
        int total = 0;
        foreach (int value in values) total += value;
        return total;
    }
}</textarea>
<div class="practice-actions"><button type="button" class="button primary" data-load-compiler="browser-lab-demo">Загрузить пример в компилятор</button><span class="practice-feedback" role="status"></span></div>

Ожидаемый вывод:

    HTTP methods
    GET: 3
    POST: 2
    PUT: 1
    Sum = 60

## 2. Настоящий C#-компилятор прямо на странице

<div class="notice"><strong>Как это устроено:</strong> ниже встроен <a href="https://github.com/MicrosoftLearning/c-sharp-minor">C# minor от Microsoft Learning</a> — Blazor WebAssembly с Roslyn, собранный GitHub Actions для этого сайта. C# выполняется на устройстве, внутри браузера; собственного сервера для выполнения нет. Первая загрузка может быть заметно дольше последующих. Компилятор рассчитан на учебные консольные программы, а не на произвольные серверные библиотеки или полный SDK. Не запускай чужой недоверенный код: бесконечный цикл может подвесить вкладку.</div>

<iframe id="browser-lab-compiler" title="C# minor — компилятор и запуск C# в WebAssembly" src="{{ '/browser-compiler/' | relative_url }}" loading="eager" style="display:block;width:100%;min-height:900px;border:1px solid var(--border);border-radius:14px;background:white" referrerpolicy="strict-origin-when-cross-origin"></iframe>

Если удобнее большой редактор, <a href="{{ '/browser-compiler/' | relative_url }}" target="_blank" rel="noopener">открой компилятор в отдельной вкладке</a>. При открытии в отдельной вкладке пример можно перенести копированием вручную.

## 3. Напиши код сам — TASK-001 (10–20 минут)

Напиши **свою** реализацию GetTopMethods: верни не более трёх наиболее частых HTTP-методов с их количествами. Сравнение без учёта регистра; сортировка сначала по частоте убыванию, затем по имени по возрастанию без учёта регистра. При пустом входе результат пустой. Не копируй готовый пример: в нём нет сортировки с разрешением ничьей и ограничения топ-3.

**Вход:** GET, POST, GET, PUT, POST, DELETE, DELETE, GET (в оригинале разные регистры).

**Ожидаемые частоты:** get: 3, DELETE: 2, POST: 2 (регистр имени может соответствовать первому встретившемуся варианту).

**Пограничный случай:** пустой массив → ни одной строки.

<details><summary>Необязательная подсказка</summary><p>После CountBy попробуй OrderByDescending, ThenBy и Take(3).</p></details>

Заготовка ниже — **полноценная консольная программа** со стартовой сигнатурой и вызовами для проверки. Сейчас метод специально выбрасывает NotImplementedException: замени его самостоятельно, затем загрузи код в компилятор и запусти. Решение заранее не опубликовано.

<label for="solution-TASK-001-browser" class="editor-label">Твоя программа для TASK-001:</label>
<textarea id="solution-TASK-001-browser" class="code-editor" data-practice-id="TASK-001-browser" spellcheck="false" rows="24">using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        string[] methods = ["get", "POST", "GET", "put", "post", "DELETE", "delete", "GET"];
        foreach (var (method, count) in GetTopMethods(methods))
            Console.WriteLine($"{method}: {count}");

        Console.WriteLine($"Empty: {GetTopMethods(Array.Empty&lt;string&gt;()).Count()}");
    }

    public static IEnumerable&lt;(string Method, int Count)&gt; GetTopMethods(
        IEnumerable&lt;string&gt; methods)
    {
        // Напиши код сам
        throw new NotImplementedException();
    }
}</textarea>
<div class="practice-actions">
<button type="button" class="button primary" data-load-compiler="solution-TASK-001-browser">Загрузить задание в компилятор</button>
<button type="button" class="button" id="browser-lab-import">Перенести мой код из компилятора сюда</button>
<button type="button" class="button" data-copy-practice="TASK-001-browser">Скопировать код</button>
<button type="button" class="button" data-download-practice="TASK-001-browser">Скачать .cs</button>
<span class="practice-feedback" role="status"></span>
</div>
<p class="muted">Черновик задания хранится только в localStorage этого браузера. Ни компилятор, ни сайт не отправляют решения в личный журнал автоматически. После проверки пришли свой код в ChatGPT. Не вставляй сюда секреты или рабочие токены.</p>

## 4. Как проверить себя

Убедись, что получаются три строки с ожидаемыми частотами и Empty: 0. Попробуй отдельно регистр, ничью, один уникальный метод и пустой массив. Сверь объяснения с [основным уроком]({{ '/lessons/001-params-countby/' | relative_url }}), затем выполни [квиз по ранее опубликованным темам]({{ '/quiz/' | relative_url }}). Это **не** отдельный урок №2 и не подтверждение прохождения первого.

Если хочешь запустить этот же код локально, требуется **.NET 9 SDK** (либо совместимый более новый):

    dotnet new console -n FeatureLab -f net9.0
    cd FeatureLab
    # замени Program.cs кодом из редактора
    dotnet run

**Microsoft Learn:** [C# 13 params collections](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-13#params-collections) · [LINQ в .NET 9](https://learn.microsoft.com/dotnet/core/whats-new/dotnet-9/libraries#linq).

<script defer src="{{ '/assets/js/browser-lab.js' | relative_url }}"></script>
