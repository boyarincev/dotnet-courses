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

`CountBy(keySelector)` считает элементы по ключу. `AggregateBy` накапливает **произвольное состояние для каждого ключа**. Например, одновременно счётчик и сумму:

```csharp
var stats = calls.AggregateBy(
    // Ключ группы — маршрут запроса.
    keySelector: call => call.Route,

    // Для каждого нового маршрута счётчик и сумма начинаются с нуля.
    seed: (Count: 0, TotalMs: 0),

    // Берём накопленный итог и добавляем к нему текущий запрос.
    func: (acc, call) => (acc.Count + 1, acc.TotalMs + call.DurationMs),

    // "/orders" и "/ORDERS" попадут в одну группу.
    keyComparer: StringComparer.OrdinalIgnoreCase);
```

Сравнение ключей можно оставить по умолчанию, опустив `keyComparer`. Если стартовое состояние зависит от ключа, используй перегрузку с `seedSelector`. Она принимает функцию, которая вычисляет начальное значение по ключу.

Возвращается **`IEnumerable<KeyValuePair<TKey,TAccumulate>>`**, а не словарь. Как и `CountBy`, это отложенное вычисление: повторное перечисление заново агрегирует исходные данные. `ToArray()` материализует снимок. `AggregateBy` не создаёт промежуточные группы `GroupBy`, но хранит состояние по каждому уникальному ключу и не гарантирует отсутствия аллокаций.

**Когда пригодится `GroupBy`.** Если нужно перечислить отдельные запросы по маршруту, например посмотреть статус и длительность каждого запроса к `/orders`, используй `GroupBy`. В результате `GroupBy` для каждого маршрута доступны ключ группы и входящие в неё записи `HttpCall`. В результате этого вызова `AggregateBy` для каждого маршрута доступны ключ и накопленный итог `(Count, TotalMs)`.

В EF Core `IQueryable` не рассчитывай на автоматическую трансляцию `Enumerable.AggregateBy` в SQL: для серверной агрегации обычно применяют поддерживаемые `GroupBy`, `Count`, `Sum` и проверяют сгенерированный SQL. Для идентификаторов с чувствительным к регистру сравнением не используй `OrdinalIgnoreCase` механически.

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

**Обновить текст или создать объект отчёта?** Рассмотрим два отдельных варианта для переменной `audit` типа `Audit?`.

- `audit?.Text = BuildSummary()` проверяет ссылку в `audit`. Если объект есть, результат `BuildSummary()` записывается в его свойство `Text`, заменяя любой прежний текст. При `audit == null` значение `audit` остаётся `null`, а вызов `BuildSummary()` пропускается.
- `audit ??= new Audit()` проверяет текущее значение переменной `audit`. При `audit == null` новый объект с пустым `Text` записывается в саму переменную `audit`. Если объект уже есть, `audit` сохраняет ссылку на него, `Text` сохраняет своё значение, а выражение `new Audit()` пропускается.

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
    new(Route: "/orders", StatusCode: 200, DurationMs: 40),
    new(Route: "/orders", StatusCode: 201, DurationMs: 90),
    new(Route: "/orders", StatusCode: 503, DurationMs: 250),
    new(Route: "/ORDERS", StatusCode: 200, DurationMs: 60),
    new(Route: "/health", StatusCode: 200, DurationMs: 5),
    new(Route: "/orders", StatusCode: 201, DurationMs: 30)
];

var stats = calls
    .Where(call => call.StatusCode is >= 200 and < 300)
    .AggregateBy(
        keySelector: call => call.Route,
        seed: (Count: 0, TotalMs: 0),
        func: (acc, call) => (
            Count: acc.Count + 1,
            TotalMs: acc.TotalMs + call.DurationMs
        ),
        keyComparer: StringComparer.OrdinalIgnoreCase)
    .OrderBy(keySelector: pair => pair.Key, comparer: StringComparer.Ordinal)
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
    new(Client: "api-A", StatusCode: 500, ResponseBytes: 150),
    new(Client: "API-a", StatusCode: 404, ResponseBytes: 50),
    new(Client: "api-b", StatusCode: 503, ResponseBytes: 400),
    new(Client: "api-b", StatusCode: 200, ResponseBytes: 900),
    new(Client: "api-c", StatusCode: 500, ResponseBytes: 400)
];
```

**Ожидаемый результат:** `api-b: Count=1, TotalBytes=400`; `api-c: Count=1, TotalBytes=400`. `api-A` имеет две ошибки, но всего 200 байт. При наличии `audit`: `api-b=400; api-c=400`.

**Критерии готовности:** фильтр статусов до агрегации; `long` для суммы; объединение `api-A` и `API-a`; максимум два результата и определённый порядок при равенстве; при `audit == null` не создавать текст отчёта. **Пограничный случай:** пустой вход возвращает пустую коллекцию. Если `audit` не равен `null`, в `audit.Text` записывается пустая строка.

<details><summary>Необязательная подсказка</summary><p>После AggregateBy используй OrderByDescending, ThenBy и Take(2). Сначала материализуй результат, затем формируй строку только внутри условного присваивания.</p></details>

**Проверка решения:** кнопка «Запустить и проверить Assert» откроет в браузерном редакторе полный `Program.cs`: твой метод, тестовые данные и видимые C#-проверки `Assert` на обычный, пустой и пограничный ввод. При ошибке увидишь нарушенное условие; готовое решение не показывается.

<script type="text/plain" id="practice-program-template">
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        Failure[] calls =
        [
            new(Client: "api-A", StatusCode: 500, ResponseBytes: 150),
            new(Client: "API-a", StatusCode: 404, ResponseBytes: 50),
            new(Client: "api-b", StatusCode: 503, ResponseBytes: 400),
            new(Client: "api-b", StatusCode: 200, ResponseBytes: 900),
            new(Client: "api-c", StatusCode: 500, ResponseBytes: 400)
        ];

        var audit = new AuditReport();
        var actual = GetNoisiestClients(calls, audit);

        Assert(actual.Count == 2, "Вернуть двух клиентов");
        Assert(actual[0].Count == 1 && actual[0].TotalBytes == 400
            && string.Equals(actual[0].Client, "api-b", StringComparison.OrdinalIgnoreCase),
            "Первый клиент — api-b с одной ошибкой и 400 байтами");
        Assert(actual[1].Count == 1 && actual[1].TotalBytes == 400
            && string.Equals(actual[1].Client, "api-c", StringComparison.OrdinalIgnoreCase),
            "При равной сумме api-b идёт перед api-c");
        Assert(audit.Text == "api-b=400; api-c=400",
            "Отчёт записан в audit.Text");

        var emptyAudit = new AuditReport { Text = "старый отчёт" };
        Assert(GetNoisiestClients(Array.Empty<Failure>(), emptyAudit).Count == 0
            && emptyAudit.Text == "",
            "Пустой ввод возвращает пустой результат и очищает отчёт");

        Failure[] mixed =
        [
            new(Client: "Api-X", StatusCode: 500, ResponseBytes: 300),
            new(Client: "API-x", StatusCode: 404, ResponseBytes: 50),
            new(Client: "small", StatusCode: 500, ResponseBytes: 10),
            new(Client: "ignored", StatusCode: 200, ResponseBytes: 9000)
        ];
        // null означает, что отчёт не нужен.
        var withoutAudit = GetNoisiestClients(mixed, null);
        Assert(withoutAudit.Count == 2 && withoutAudit[0].Count == 2
            && withoutAudit[0].TotalBytes == 350
            && string.Equals(withoutAudit[0].Client, "Api-X", StringComparison.OrdinalIgnoreCase),
            "Склеить Api-X и API-x, поддержать audit=null");
        Assert(withoutAudit[1].TotalBytes == 10
            && string.Equals(withoutAudit[1].Client, "small", StringComparison.OrdinalIgnoreCase),
            "Ответ 200 не учитывается при агрегации ошибок");

        Console.WriteLine("Все проверки пройдены");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException("❌ TASK-002: " + message);
        Console.WriteLine("✓ " + message);
    }

    // BEGIN TASK-002
    // INSERT_SOLUTION_HERE
    // END TASK-002
}

sealed record Failure(string Client, int StatusCode, long ResponseBytes);
sealed class AuditReport
{
    public string Text { get; set; } = "";
}
</script>

<label for="solution-TASK-002" class="editor-label">Твой код:</label>
<textarea id="solution-TASK-002" class="code-editor" data-practice-id="TASK-002" spellcheck="false" rows="13">static IReadOnlyList&lt;(string Client, int Count, long TotalBytes)&gt; GetNoisiestClients(
    IEnumerable&lt;Failure&gt; calls, AuditReport? audit)
{
    // Реализуй GetNoisiestClients для записей HTTP-вызовов.
    // Оставь ответы со StatusCode &gt;= 400 и накопи (Count, TotalBytes) через AggregateBy.
    // Группируй по имени клиента без учёта регистра. Для суммы байтов используй long.
    // Верни до двух клиентов, отсортированных по TotalBytes по убыванию.
    // При равенстве сортируй по имени клиента по возрастанию без учёта регистра.
    // Если audit задан, через оператор ?. запиши в audit.Text имена и суммы
    // из результата в том же порядке. Формат пары — "клиент=сумма", разделитель — "; ".

    throw new NotImplementedException();
}</textarea>
<div class="practice-actions"><button type="button" class="button" data-copy-practice="TASK-002">Скопировать код</button> <button type="button" class="button" data-download-practice="TASK-002">Скачать .cs</button> <span class="practice-feedback" role="status"></span></div>
<p class="muted">Черновик хранится только в браузере. Отправь код в ChatGPT для проверки. Браузерные Assert проверят корректность результата; оценка подхода и проверка кода остаются в чате.</p>

## 5. Повторение и официальные источники

[Квиз по предыдущим темам]({{ '/quiz/' | relative_url }}) содержит вопросы с постоянными Q-ID. Отправка и оценка ответов происходят только в чате.

Microsoft Learn: [C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14), [null-conditional operators](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators#null-conditional-operators--and-), [`??` и `??=`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator), [Enumerable.AggregateBy](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.aggregateby?view=net-9.0), [.NET 9 LINQ](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#linq).

*Примеры этого урока проверяются на .NET 10 при сборке сайта; браузерный компилятор использует C# 14 и .NET 10.*
