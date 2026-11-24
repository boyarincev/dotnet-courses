---
lesson_number: 2
lesson_date: '21 ноября 2026'
title: 'Агрегация HTTP-запросов: AggregateBy и null-conditional assignment'
summary: 'Агрегируем HTTP-метрики по маршрутам и создаём отчёт только при наличии получателя.'
csharp_feature: 'C# 14 · null-conditional assignment'
dotnet_feature: '.NET 9 · AggregateBy'
series: 'Коллекции и LINQ'
code_framework: net10.0
browser_runtime: '10'
browser_snippets: browser-snippets-lesson002.js
browser_start_snippet: full-program
---
## Зачем это нужно

В [уроке №1]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы использовали `CountBy` для подсчёта HTTP-методов. Теперь нужна сводка по маршрутам: **количество запросов и общее время**. Кроме того, диагностический отчёт нужно формировать лишь при наличии объекта, в который его записывать.

## 1. .NET 9: Enumerable.AggregateBy

`CountBy(keySelector)` возвращает пары «ключ, количество элементов». Если выбрать маршрут в качестве ключа, два запроса к `/orders` и один к `/health` дадут пары `(/orders, 2)` и `(/health, 1)`. `AggregateBy` накапливает **произвольное состояние для каждого ключа**. В этой сводке сравниваем маршруты без учёта регистра и накапливаем для каждого счётчик и сумму длительностей.

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
{: #snippet-aggregateby }

На входе три запроса к `/orders` и `/ORDERS` длительностью 40, 90 и 60 мс. Вывод показывает число запросов и суммарное время в миллисекундах.

~~~text
/orders: 3/190
~~~
{: #output-aggregateby }

Если опустить `keyComparer`, применяется [сравнение по умолчанию для типа ключа](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Private.CoreLib/src/System/Collections/Generic/Dictionary.cs#L58-L82). Когда начальное значение зависит от ключа, используй [перегрузку с `seedSelector`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.aggregateby?view=net-9.0#overloads). Функция типа `Func<TKey, TAccumulate>` вычисляет начальное значение [при первой встрече ключа в очередном перечислении](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Linq/src/System/Linq/AggregateBy.cs#L103-L131).

Метод возвращает **`IEnumerable<KeyValuePair<TKey, TAccumulate>>`**. Как и в [`CountBy`](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Linq/src/System/Linq/CountBy.cs#L22-L42), вычисление отложено. При перечислении `AggregateBy` [полностью читает вход до выдачи первой пары](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Linq/src/System/Linq/AggregateBy.cs#L71-L99), а при повторном перечислении заново читает источник. Реализация .NET 9 для непустого входа [создаёт словарь с одним накопленным значением на ключ](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Linq/src/System/Linq/AggregateBy.cs#L85-L99).

В полном примере ниже [`ToArray()` вычисляет сводку сразу и сохраняет её в массиве](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.toarray?view=net-10.0#remarks). И вывод в консоль, и отчёт читают этот массив.

**Когда пригодится `GroupBy`.** Если нужно перечислить отдельные запросы по маршруту, например посмотреть статус и длительность каждого запроса к `/orders`, используй `GroupBy`. В результате `GroupBy` для каждого маршрута доступны ключ группы и входящие в неё записи `HttpCall`. В результате этого вызова `AggregateBy` для каждого маршрута доступны ключ и накопленный итог `(Count, TotalMs)`.

## 2. C# 14: null-conditional assignment

**Как читать `Audit?`.** [Знак `?` после имени ссылочного типа](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-reference-types) отмечает, что переменная может содержать ссылку на объект или `null`. В примере `Audit? audit` может содержать объект `Audit` или `null`. В задании `AuditReport?` означает то же самое для типа `AuditReport`. При включённом nullable-анализе компилятор использует аннотацию, чтобы предупреждать о возможном обращении к `null`. Оператор `?.` проверяет значение ссылки во время выполнения.

Раньше:

```csharp
if (audit is not null)
    audit.Text = BuildSummary();
```
{: #snippet-explicit-null-check }

Вывод при заданном `audit`

~~~text
Audit: ready
~~~
{: #output-explicit-null-check }

Теперь:

```csharp
audit?.Text = BuildSummary();
```
{: #snippet-conditional-assignment }

В запускаемом примере этот фрагмент выполняется дважды. Сначала `audit` равен `null`, затем указывает на объект `Audit`.

~~~text
Builds when null: 0
Builds when present: 1
Audit: ready
~~~
{: #output-conditional-assignment }

При `audit == null` **[правая часть не вычисляется](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/proposals/csharp-14.0/null-conditional-assignment#specification)**. В этом примере вызов `BuildSummary()` и построение строки отчёта пропускаются.

Условный доступ поддерживает составное присваивание, например `audit?.Text += " (проверено)"`, и присваивание элементу массива, например `array?[0] = value`. Инкремент `++` и декремент `--` с условным доступом недопустимы ([правила условного присваивания](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators#null-conditional-operators--and-)). Для нескольких действий подходит один блок `if`.

**Обновить текст или создать объект отчёта?** Рассмотрим два отдельных варианта для переменной `audit` типа `Audit?`.

- `audit?.Text = BuildSummary()` проверяет ссылку в `audit`. Если объект есть, результат `BuildSummary()` записывается в его свойство `Text`, заменяя любой прежний текст. При `audit == null` значение `audit` остаётся `null`, а вызов `BuildSummary()` пропускается.
- [`audit ??= new Audit()`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator) проверяет текущее значение переменной `audit`. При `audit == null` новый объект с пустым `Text` записывается в саму переменную `audit`. Если объект уже есть, `audit` сохраняет ссылку на него, `Text` сохраняет своё значение, а выражение `new Audit()` пропускается.

## 3. Полностью запускаемый пример

Для полного примера используй **.NET 10 SDK** и проект с целевой платформой `net10.0`. В таком проекте [версия языка по умолчанию — C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-versioning#defaults). Сам API [`AggregateBy` появился в .NET 9](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#linq).

```bash
dotnet --version
dotnet new console -n HttpStatsLab -f net10.0
cd HttpStatsLab
```

Замени `Program.cs` целиком:

```csharp
using System;
using System.Linq;

public static class Program
{
    public static void Main()
    {
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
    }
}

sealed record HttpCall(string Route, int StatusCode, int DurationMs);
sealed class Audit
{
    public string Text { get; set; } = "";
}
```
{: #snippet-full-program }

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
{: #output-full-program }

Фильтр пропустил только ответы со статусами 2xx. Запросы к `/orders` и `/ORDERS` вошли в один итог с [написанием первого встреченного ключа](https://github.com/dotnet/runtime/blob/60629d14374c56f1cb51819049ad1fa529307f8d/src/libraries/System.Private.CoreLib/src/System/Collections/Generic/Dictionary.cs#L1124-L1132) `/orders`.

`BuildSummary` вызван один раз, когда появился объект `Audit`. Попробуй убрать `StringComparer.OrdinalIgnoreCase` и предскажи, сколько ключей получится.

## 4. Напиши код сам · TASK-002 {#lesson-task}

**15–20 минут.** Реализуй `GetNoisiestClients` для записей HTTP-вызовов. Оставь ответы со статусом `400` и выше. Сгруппируй их через `AggregateBy` по имени клиента с `StringComparer.OrdinalIgnoreCase`.

- **Результат метода.** Верни до двух клиентов с наибольшей суммой байтов в виде `(Client, Count, TotalBytes)`. `Count` — число ошибочных ответов клиента. `TotalBytes` — сумма их полей `ResponseBytes` в байтах, тип суммы `long`. Сортируй по `TotalBytes` по убыванию. При равной сумме порядок клиентов свободный. Для `Client` допустим любой регистр.
- **Текст отчёта.** Если `audit` задан, через `?.` запиши в `audit.Text` значения `Client` и `TotalBytes` из результата в том же порядке. Формат записи — `клиент=сумма_байтов`, разделитель — `"; "`.

Кнопка «Открыть заготовку» загрузит в редактор полный `Program.cs` с типами `Failure` и `AuditReport`, сигнатурой `GetNoisiestClients` и примером входа в `Main`.

**Ожидаемый результат.** Сначала клиент `api-c` с двумя ошибками на 400 байт суммарно, затем клиент `api-b` с одной ошибкой на 390 байт. Регистр имён может отличаться. Если метод вернул имена `API-c` и `api-b`, в `audit.Text` должна быть строка `API-c=400; api-b=390`.

**Критерии готовности:** фильтр статусов до агрегации; `long` для суммы; объединение `Api-C` и `API-c` в одну группу; выбор двух клиентов с наибольшей суммой байтов; при `audit == null` не создавать текст отчёта. **Пограничный случай:** пустой вход возвращает пустую коллекцию. Если `audit` не равен `null`, в `audit.Text` записывается пустая строка.

При ревью метода отдельно проверь, когда вычисляется строка отчёта. При `audit == null` построение строки должно пропускаться, даже если сводка возвращается правильно.

<details><summary>Необязательная подсказка</summary><p>После AggregateBy используй OrderByDescending по сумме байтов и Take(2). Сначала материализуй результат, затем формируй строку только внутри условного присваивания.</p></details>

~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    // BEGIN TASK-002
    static IReadOnlyList<(string Client, int Count, long TotalBytes)> GetNoisiestClients(
        IEnumerable<Failure> calls, AuditReport? audit)
    {
        // Реализуй GetNoisiestClients для записей HTTP-вызовов.
        // Оставь ответы со StatusCode >= 400 и сгруппируй их через AggregateBy
        // по имени клиента с StringComparer.OrdinalIgnoreCase. Count — число таких ответов.
        // TotalBytes (long) — сумма их ResponseBytes в байтах.
        // Верни до двух клиентов с наибольшей суммой байтов по убыванию TotalBytes.
        // При равных суммах порядок любой. Для Client допустим любой регистр.
        // Если audit задан, через ?. запиши в audit.Text пары "клиент=сумма_байтов"
        // из результата в том же порядке, разделяя пары через "; ". Для пустого
        // результата запиши пустую строку. При audit == null отчёт не формируй.

        throw new NotImplementedException();
    }
    // END TASK-002

    public static void Main()
    {
        Failure[] calls =
        [
            new(Client: "api-a", StatusCode: 500, ResponseBytes: 100),
            new(Client: "API-A", StatusCode: 404, ResponseBytes: 60),
            new(Client: "api-a", StatusCode: 502, ResponseBytes: 40),
            new(Client: "API-B", StatusCode: 200, ResponseBytes: 900),
            new(Client: "api-b", StatusCode: 503, ResponseBytes: 390),
            new(Client: "Api-C", StatusCode: 500, ResponseBytes: 350),
            new(Client: "API-c", StatusCode: 404, ResponseBytes: 50)
        ];

        var audit = new AuditReport();
        var actual = GetNoisiestClients(calls, audit);

        Assert(actual.Count == 2
            && string.Equals(actual[0].Client, "api-c", StringComparison.OrdinalIgnoreCase)
            && actual[0].Count == 2 && actual[0].TotalBytes == 400
            && string.Equals(actual[1].Client, "api-b", StringComparison.OrdinalIgnoreCase)
            && actual[1].Count == 1 && actual[1].TotalBytes == 390,
            "Ожидались клиенты по убыванию суммы байтов: api-c (2 ошибки, 400 байт), api-b (1 ошибка, 390 байт). "
            + $"Получено [{string.Join(", ", actual)}].");

        string expectedReport = $"{actual[0].Client}=400; {actual[1].Client}=390";
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
        var expectedClients = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "alpha", "Zed" };
        Assert(withoutAudit.Count == 2
            && expectedClients.SetEquals(withoutAudit.Select(client => client.Client))
            && withoutAudit.All(client => client.Count == 2 && client.TotalBytes == 2_400_000_000L),
            "Ожидались клиенты alpha и Zed в любом порядке, по две ошибки и 2 400 000 000 байт у каждого. "
            + $"Получено [{string.Join(", ", withoutAudit)}]. Учитывается 400, а 399 пропускается.");

        var tiedAudit = new AuditReport();
        var tied = GetNoisiestClients(boundary, tiedAudit);
        string expectedTiedReport = string.Join("; ", tied.Select(client => $"{client.Client}={client.TotalBytes}"));
        Assert(tied.Count == 2
            && expectedClients.SetEquals(tied.Select(client => client.Client))
            && tied.All(client => client.Count == 2 && client.TotalBytes == 2_400_000_000L)
            && tiedAudit.Text == expectedTiedReport,
            "При равных суммах ожидались alpha и Zed по две ошибки на 2 400 000 000 байт у каждого. "
            + "В отчёте должны быть те же имена и тот же порядок, что в результате. "
            + $"Получено [{string.Join(", ", tied)}], отчёт «{tiedAudit.Text}», ожидался «{expectedTiedReport}».");

        Console.WriteLine("Все проверки пройдены");
    }

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition) throw new InvalidOperationException("❌ TASK-002: " + failureMessage);
    }
}

sealed record Failure(string Client, int StatusCode, long ResponseBytes);
sealed class AuditReport
{
    public string Text { get; set; } = "";
}
~~~
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
if (audit is not null) audit.Text = "";
return Array.Empty<(string, int, long)>();
</script>

## 5. Повторение и официальные источники

[Квиз по этому и предыдущим урокам]({{ '/courses/csharp-dotnet-9-11/quiz/' | relative_url }}?through={{ page.lesson_number }}) подбирает вопросы с постоянными Q-ID. Ответы и самооценки сохраняются в браузере.

Microsoft Learn: [условное присваивание в C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14#null-conditional-assignment).

*Примеры этого урока проверяются на .NET 10 при сборке сайта; браузерный компилятор использует C# 14 и .NET 10.*
