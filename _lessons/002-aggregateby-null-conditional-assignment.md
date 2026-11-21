---
lesson_number: 2
lesson_date: '21 ноября 2026'
title: 'Агрегация HTTP-запросов: AggregateBy и null-conditional assignment'
summary: 'Агрегируем HTTP-метрики по маршрутам и создаём отчёт только при наличии получателя.'
csharp_feature: 'C# 14 · null-conditional assignment'
dotnet_feature: '.NET 9 · AggregateBy'
series: 'Коллекции и LINQ'
browser_runtime: '10'
---
> **Браузерный запуск включён.** Все C#-примеры можно открывать в редакторе на .NET 10 и проверять без локальной установки SDK.

## Зачем это нужно

В [уроке №1]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы использовали `CountBy` для подсчёта HTTP-методов. Теперь нужна сводка по маршрутам: **количество запросов и общее время**. Кроме того, диагностический отчёт нужно формировать лишь при наличии объекта, в который его записывать.

## 1. .NET 9: Enumerable.AggregateBy

`CountBy(keySelector)` считает элементы по ключу. `AggregateBy(keySelector, seed, func, comparer)` накапливает **произвольное состояние для каждого ключа**. Например, одновременно счётчик и сумму:

```csharp
var stats = calls.AggregateBy(
    x => x.Route,
    (Count: 0, TotalMs: 0),
    (acc, x) => (acc.Count + 1, acc.TotalMs + x.DurationMs),
    StringComparer.OrdinalIgnoreCase);
```

`seed` — начальное состояние **каждого** ключа, `func` получает прежнее состояние и очередной элемент. Необязательный `comparer` задаёт сравнение ключей. Есть и перегрузка с `seedSelector`, когда стартовое состояние зависит от ключа.

Возвращается **`IEnumerable<KeyValuePair<TKey,TAccumulate>>`**, а не словарь. Как и `CountBy`, это отложенное вычисление: повторное перечисление заново агрегирует исходные данные. `ToArray()` материализует снимок. `AggregateBy` не создаёт промежуточные группы `GroupBy`, но хранит состояние по каждому уникальному ключу и не гарантирует отсутствия аллокаций.

**Когда не использовать:** если нужны сами элементы групп, выбирай `GroupBy`. В EF Core `IQueryable` не рассчитывай на автоматическую трансляцию `Enumerable.AggregateBy` в SQL: для серверной агрегации обычно применяют поддерживаемые `GroupBy`, `Count`, `Sum` и проверяют сгенерированный SQL. Для идентификаторов с чувствительным к регистру сравнением не используй `OrdinalIgnoreCase` механически.

## 2. C# 14: null-conditional assignment

Раньше:

```csharp
if (audit is not null)
    audit.Text = BuildSummary();
```

Теперь:

```csharp
audit?.Text = BuildSummary();
```

При `audit == null` **правая часть вообще не вычисляется**: `BuildSummary()` не вызывается. Это особенно полезно, когда создание необязательного отчёта дорого.

Также допустимо `audit?.Counter += 1` и `array?[0] = value`. Но `audit?.Counter++` недопустимо. `?.` не заменяет синхронизацию потоков: между проверкой и использованием состояние других объектов может меняться. Если нужно несколько действий, обычный `if` часто понятнее.

**Не путай с `??=`:** `obj?.Property = value` присваивает, если **объект существует**; `variable ??= value` присваивает, если **сама переменная равна null**.

## 3. Полностью запускаемый пример

Нужен **.NET 10 SDK**: `AggregateBy` доступен с .NET 9, а C# 14 используется по умолчанию при `net10.0`.

```bash
dotnet --version
dotnet new console -n HttpStatsLab -f net10.0
cd HttpStatsLab
```

Замени `Program.cs` целиком:

```csharp
using System;
using System.Linq;

HttpCall[] calls =
[
    new("/orders", 200, 40),
    new("/orders", 201, 90),
    new("/orders", 503, 250),
    new("/ORDERS", 200, 60),
    new("/health", 200, 5),
    new("/orders", 201, 30)
];

var stats = calls
    .Where(x => x.StatusCode is >= 200 and < 300)
    .AggregateBy(
        x => x.Route,
        (Count: 0, TotalMs: 0),
        (acc, x) => (
            Count: acc.Count + 1,
            TotalMs: acc.TotalMs + x.DurationMs
        ),
        StringComparer.OrdinalIgnoreCase)
    .OrderBy(x => x.Key, StringComparer.Ordinal)
    .ToArray();

foreach (var x in stats)
    Console.WriteLine($"{x.Key}: Count={x.Value.Count}, TotalMs={x.Value.TotalMs}");

int builds = 0;
Audit? audit = null;
audit?.Text = BuildSummary();
Console.WriteLine($"Builds when null: {builds}");

audit = new Audit();
audit?.Text = BuildSummary();
Console.WriteLine($"Builds when present: {builds}");
Console.WriteLine($"Audit: {audit.Text}");

string BuildSummary()
{
    builds++;
    return string.Join("; ", stats.Select(
        x => $"{x.Key}={x.Value.Count}/{x.Value.TotalMs}"));
}

sealed record HttpCall(string Route, int StatusCode, int DurationMs);
sealed class Audit
{
    public string Text { get; set; } = "";
}
```

Запуск:

```bash
dotnet run
```

Ожидаемый вывод:

```text
/health: Count=1, TotalMs=5
/orders: Count=4, TotalMs=220
Builds when null: 0
Builds when present: 1
Audit: /health=1/5; /orders=4/220
```

Статус `503` исключён, разные регистры `/orders` объединены. `BuildSummary` вызывается только после появления объекта `Audit`. Попробуй убрать `StringComparer.OrdinalIgnoreCase` и предскажи, сколько ключей получится.

## 4. Напиши код сам · TASK-002

**15–20 минут.** Реализуй `GetNoisiestClients`: по записям HTTP-вызовов верни **двух клиентов с наибольшей суммой байтов ошибочных ответов** (`StatusCode >= 400`). Используй `AggregateBy` для накопления `(Count, TotalBytes)`, сравнивай имена клиентов без учёта регистра. Сортируй по `TotalBytes` убыванию, при равенстве — по имени без учёта регистра по возрастанию. При ненулевом `audit` запиши в `audit.Text` строку вида `client=400; client=400` через `?.`.

Объявления типов для `Program.cs`:

```csharp
sealed record Failure(string Client, int StatusCode, long ResponseBytes);
sealed class AuditReport
{
    public string Text { get; set; } = "";
}
```

**Сигнатура без реализации:**

```csharp
static IReadOnlyList<(string Client, int Count, long TotalBytes)> GetNoisiestClients(
    IEnumerable<Failure> calls, AuditReport? audit)
```

**Пример входа:**

```csharp
Failure[] calls =
[
    new("api-A", 500, 150),
    new("API-a", 404, 50),
    new("api-b", 503, 400),
    new("api-b", 200, 900),
    new("api-c", 500, 400)
];
```

**Ожидаемый результат:** `api-b: Count=1, TotalBytes=400`; `api-c: Count=1, TotalBytes=400`. `api-A` имеет две ошибки, но всего 200 байт. При наличии `audit`: `api-b=400; api-c=400`.

**Критерии готовности:** фильтр статусов до агрегации; `long` для суммы; объединение `api-A` и `API-a`; максимум два результата и определённый порядок при равенстве; при `audit == null` не создавать текст отчёта. **Пограничный случай:** пустой вход возвращает пустую коллекцию, а ненулевой `audit.Text` становится пустой строкой.

<details><summary>Необязательная подсказка</summary><p>После AggregateBy используй OrderByDescending, ThenBy и Take(2). Сначала материализуй результат, затем формируй строку только внутри условного присваивания.</p></details>

<label for="solution-TASK-002" class="editor-label">Твой код:</label>
<textarea id="solution-TASK-002" class="code-editor" data-practice-id="TASK-002" spellcheck="false" rows="13">static IReadOnlyList&lt;(string Client, int Count, long TotalBytes)&gt; GetNoisiestClients(
    IEnumerable&lt;Failure&gt; calls, AuditReport? audit)
{
    // Напиши реализацию самостоятельно
    throw new NotImplementedException();
}</textarea>
<div class="practice-actions"><button type="button" class="button" data-copy-practice="TASK-002">Скопировать код</button> <button type="button" class="button" data-download-practice="TASK-002">Скачать .cs</button> <span class="practice-feedback" role="status"></span></div>
<p class="muted">Черновик хранится только в браузере. Отправь код в ChatGPT для проверки. Решение можно запустить в браузерном компиляторе ниже, но автоматической оценки нет.</p>

## 5. Повторение и официальные источники

[Квиз по предыдущим темам]({{ '/quiz/' | relative_url }}) содержит вопросы с постоянными Q-ID. Отправка и оценка ответов происходят только в чате.

Microsoft Learn: [C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14), [null-conditional operators](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators#null-conditional-operators--and-), [Enumerable.AggregateBy](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.aggregateby?view=net-9.0), [.NET 9 LINQ](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#linq).

*Примеры этого урока проверяются на .NET 10 при сборке сайта; браузерный компилятор использует C# 14 и .NET 10.*
