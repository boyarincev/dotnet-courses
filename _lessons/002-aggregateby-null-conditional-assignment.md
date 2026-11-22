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

**15–20 минут.** Реализуй `GetNoisiestClients` для записей HTTP-вызовов. Оставь ответы со статусом `400` и выше. Сгруппируй их через `AggregateBy` по имени клиента без учёта регистра.

- **Результат метода.** Верни до двух элементов `(Client, Count, TotalBytes)`. `Count` — число ошибочных ответов клиента. `TotalBytes` — сумма их полей `ResponseBytes` в байтах, тип суммы `long`. Сортируй по `TotalBytes` по убыванию, при равенстве — по имени клиента по возрастанию без учёта регистра.
- **Текст отчёта.** Если `audit` задан, через оператор `?.` запиши в `audit.Text` имя и сумму байтов для каждого клиента из результата в том же порядке. Формат записи — `клиент=сумма_байтов`, разделитель — `"; "`.

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
    new(Client: "api-b", StatusCode: 503, ResponseBytes: 390),
    new(Client: "api-b", StatusCode: 200, ResponseBytes: 900),
    new(Client: "api-c", StatusCode: 500, ResponseBytes: 400)
];
```

**Ожидаемый результат.** Сначала `api-c` с одной ошибкой на 400 байт, затем `api-b` с одной ошибкой на 390 байт. У `api-A` две ошибки на 200 байт суммарно. При наличии `audit` ожидается `api-c=400; api-b=390`.

**Критерии готовности:** фильтр статусов до агрегации; `long` для суммы; объединение `api-A` и `API-a`; максимум два результата и определённый порядок при равенстве; при `audit == null` не создавать текст отчёта. **Пограничный случай:** пустой вход возвращает пустую коллекцию. Если `audit` не равен `null`, в `audit.Text` записывается пустая строка.

При ревью метода отдельно проверь, когда вычисляется строка отчёта. При `audit == null` построение строки должно пропускаться, даже если сводка возвращается правильно.

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
            new(Client: "api-b", StatusCode: 503, ResponseBytes: 390),
            new(Client: "api-b", StatusCode: 200, ResponseBytes: 900),
            new(Client: "api-c", StatusCode: 500, ResponseBytes: 400)
        ];

        var audit = new AuditReport();
        var actual = GetNoisiestClients(calls, audit);

        Assert(actual.Count == 2 && actual[0].Count == 1 && actual[0].TotalBytes == 400
            && string.Equals(actual[0].Client, "api-c", StringComparison.OrdinalIgnoreCase),
            actual.Count == 2
                ? $"Первым ожидался api-c с одной ошибкой на 400 байт. Получено «{actual[0]}»."
                : $"Ожидались два клиента. Получено элементов {actual.Count}.");
        Assert(actual[1].Count == 1 && actual[1].TotalBytes == 390
            && string.Equals(actual[1].Client, "api-b", StringComparison.OrdinalIgnoreCase),
            $"Вторым ожидался api-b с одной ошибкой на 390 байт. Получено «{actual[1]}».");

        const string expectedReport = "api-c=400; api-b=390";
        Assert(audit.Text == expectedReport,
            string.IsNullOrEmpty(audit.Text)
                ? $"Отчёт не записан в audit.Text. Ожидалось «{expectedReport}»."
                : $"Неверный текст отчёта в audit.Text. Ожидалось «{expectedReport}», получено «{audit.Text}».");

        var emptyAudit = new AuditReport { Text = "старый отчёт" };
        var empty = GetNoisiestClients(Array.Empty<Failure>(), emptyAudit);
        var emptyReportText = emptyAudit.Text is null ? "null" : $"«{emptyAudit.Text}»";
        Assert(empty.Count == 0 && emptyAudit.Text == "",
            "Для пустого ввода ожидались 0 клиентов и пустая строка в audit.Text. "
            + $"Получено клиентов {empty.Count}, текст отчёта — {emptyReportText}.");

        Failure[] boundary =
        [
            new(Client: "Zed", StatusCode: 400, ResponseBytes: 2_200_000_000L),
            new(Client: "zed", StatusCode: 500, ResponseBytes: 200_000_000),
            new(Client: "alpha", StatusCode: 400, ResponseBytes: 1_200_000_000),
            new(Client: "ALPHA", StatusCode: 404, ResponseBytes: 1_200_000_000),
            new(Client: "ignored", StatusCode: 399, ResponseBytes: 3_000_000_000)
        ];
        // При audit == null нужна только сводка по клиентам.
        var withoutAudit = GetNoisiestClients(boundary, null);
        Assert(withoutAudit.Count == 2
            && withoutAudit[0].Count == 2 && withoutAudit[0].TotalBytes == 2_400_000_000L
            && withoutAudit[1].Count == 2 && withoutAudit[1].TotalBytes == 2_400_000_000L
            && string.Equals(withoutAudit[0].Client, "alpha", StringComparison.OrdinalIgnoreCase)
            && string.Equals(withoutAudit[1].Client, "Zed", StringComparison.OrdinalIgnoreCase),
            withoutAudit.Count == 2
                ? "Ожидались alpha и Zed в этом порядке, по две ошибки и 2 400 000 000 байт у каждого. "
                    + $"Получены «{withoutAudit[0]}» и «{withoutAudit[1]}». Учитывается 400, а 399 пропускается."
                : $"Для ответов со статусом от 400 ожидались два клиента. Получено элементов {withoutAudit.Count}.");

        Console.WriteLine("Все проверки пройдены");
    }

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition) throw new InvalidOperationException("❌ TASK-002: " + failureMessage);
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
    // Оставь ответы со StatusCode &gt;= 400 и сгруппируй их через AggregateBy
    // по имени клиента без учёта регистра. Count — число таких ответов.
    // TotalBytes (long) — сумма их ResponseBytes в байтах.
    // Верни до двух элементов (Client, Count, TotalBytes) по убыванию TotalBytes.
    // При равенстве сортируй по имени клиента по возрастанию без учёта регистра.
    // Если audit задан, через ?. запиши в audit.Text пары "клиент=сумма_байтов"
    // в порядке результата, разделяя пары через "; ". Пустой результат даёт пустой текст.

    throw new NotImplementedException();
}</textarea>
<div class="practice-actions"><button type="button" class="button" data-copy-practice="TASK-002">Скопировать код</button> <button type="button" class="button" data-download-practice="TASK-002">Скачать .cs</button> <span class="practice-feedback" role="status"></span></div>
<p class="muted">Черновик хранится только в браузере. Отправь код в ChatGPT для проверки. Браузерные Assert проверят корректность результата; оценка подхода и проверка кода остаются в чате.</p>

## 5. Повторение и официальные источники

[Квиз по этому и предыдущим урокам]({{ '/courses/csharp-dotnet-9-11/quiz/' | relative_url }}?through={{ page.lesson_number }}) подбирает вопросы с постоянными Q-ID. Ответы и самооценки сохраняются в браузере.

Microsoft Learn: [C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14), [null-conditional operators](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators#null-conditional-operators--and-), [`??` и `??=`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator), [Enumerable.AggregateBy](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.aggregateby?view=net-9.0), [.NET 9 LINQ](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#linq).

*Примеры этого урока проверяются на .NET 10 при сборке сайта; браузерный компилятор использует C# 14 и .NET 10.*
