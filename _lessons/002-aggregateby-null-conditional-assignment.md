---
lesson_number: 2
lesson_date: '21 ноября 2026'
title: 'Сводка по маршрутам HTTP-запросов: AggregateBy и условное присваивание'
summary: 'Считаем число запросов и их суммарную длительность по маршрутам. Формируем текст отчёта, только если есть объект для записи.'
csharp_feature: 'C# 14 · условное присваивание через ?.'
dotnet_feature: '.NET 9 · AggregateBy'
series: 'Коллекции и LINQ'
code_framework: net10.0
browser_runtime: '10'
browser_snippets: browser-snippets-lesson002.js
browser_start_snippet: full-program
---
## Зачем это нужно

В отчёте по очередям обработки может понадобиться число завершённых операций и их суммарная длительность. `AggregateBy` накапливает оба показателя для каждой очереди за один обход входных записей. Из этих двух значений можно вычислить среднюю длительность.

При диагностике импорта подробный отчёт может понадобиться только для разбора сбоя. С присваиванием через `?.` текст будет сформирован и записан, только если вызывающий код передал объект отчёта.

## 1. .NET 9: Enumerable.AggregateBy

В [уроке №1]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы считали запросы по HTTP-методам. `CountBy(keySelector)` возвращает пары «ключ, количество элементов». Если выбрать маршрут в качестве ключа, два запроса к `/orders` и один к `/health` дадут пары `(/orders, 2)` и `(/health, 1)`. `AggregateBy` хранит одно накопленное значение для каждого ключа и обновляет его для каждой записи с этим ключом. В этой сводке для каждого маршрута накапливаем пару из числа запросов и суммы их длительностей. Маршруты сравниваем без учёта регистра.

В примере используем перегрузку с параметром `seed`, который задаёт одно начальное значение для всех ключей. [Перегрузка AggregateBy с параметром seed в справочнике .NET 9](<https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.aggregateby?view=net-9.0#system-linq-enumerable-aggregateby-3(system-collections-generic-ienumerable((-0))-system-func((-0-1))-2-system-func((-2-0-2))-system-collections-generic-iequalitycomparer((-1)))>)

```csharp
public static IEnumerable<KeyValuePair<TKey, TAccumulate>> AggregateBy<TSource, TKey, TAccumulate>(
    this IEnumerable<TSource> source,
    Func<TSource, TKey> keySelector,
    TAccumulate seed,
    Func<TAccumulate, TSource, TAccumulate> func,
    IEqualityComparer<TKey>? keyComparer = null)
    where TKey : notnull;
```

В вызове ниже `source` — это `calls` перед точкой, а `TAccumulate` — `(int Count, int TotalMs)`, тип кортежа с числом запросов и суммой их длительностей в миллисекундах.

```csharp
var stats = calls.AggregateBy(
    // Используем маршрут запроса как ключ сводки.
    keySelector: call => call.Route,

    // Для каждого нового маршрута счётчик и сумма начинаются с нуля.
    seed: (Count: 0, TotalMs: 0),

    // Увеличиваем счётчик на один и прибавляем длительность текущего запроса к сумме.
    func: (acc, call) => (acc.Count + 1, acc.TotalMs + call.DurationMs),

    // Для "/orders" и "/ORDERS" ведём общий счётчик и общую сумму.
    keyComparer: StringComparer.OrdinalIgnoreCase);
```
{: #snippet-aggregateby }

На входе три запроса к `/orders` и `/ORDERS` длительностью 40, 90 и 60 мс. В выводе `3` — число запросов, а `190` — сумма их длительностей в миллисекундах.

~~~text
/orders: 3/190
~~~
{: #output-aggregateby }

Если опустить `keyComparer`, для определения равенства ключей применяется [компаратор по умолчанию для их типа](<https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.-ctor?view=net-9.0#system-collections-generic-dictionary-2-ctor(system-collections-generic-iequalitycomparer((-0)))>). Когда начальное значение зависит от ключа, используй [перегрузку с `seedSelector`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.aggregateby?view=net-9.0#overloads).

Метод возвращает **`IEnumerable<KeyValuePair<TKey, TAccumulate>>`**. Как и в `CountBy`, вычисление отложено. Реализация .NET 9 для непустого входа читает весь источник и сохраняет в словаре одно накопленное значение на ключ перед выдачей первой пары. При повторном перечислении метод заново читает источник. [Итератор AggregateBy в .NET 9](https://github.com/dotnet/runtime/blob/v9.0.0/src/libraries/System.Linq/src/System/Linq/AggregateBy.cs#L66-L99)

В полном примере ниже [`ToArray()` вычисляет сводку сразу и сохраняет её в массиве](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.toarray?view=net-10.0#remarks). И вывод в консоль, и отчёт читают этот массив.

**Когда пригодится `GroupBy`.** Если нужно перечислить отдельные запросы по маршруту, например посмотреть статус и длительность каждого запроса к `/orders`, используй `GroupBy`. В результате `GroupBy` для каждого маршрута доступны ключ группы и входящие в неё записи `HttpCall`. В результате этого вызова `AggregateBy` для каждого маршрута доступны ключ и накопленный итог `(Count, TotalMs)`.

## 2. C# 14: присваивание через `?.`

**Как читать `Audit?`.** [Аннотация `?` после имени ссылочного типа](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-reference-types) означает, что ссылка может иметь значение `null`. Например, переменная `audit` типа `Audit?` может содержать ссылку на объект `Audit` или значение `null`. В задании `AuditReport?` означает то же для ссылок на объект `AuditReport`. При включённом анализе nullable-ссылок компилятор использует аннотацию, чтобы предупреждать о возможном обращении к члену объекта через ссылку со значением `null`. Оператор `?.` проверяет значение ссылки во время выполнения.

Раньше:

```csharp
if (audit is not null)
    audit.Text = BuildSummary();
```
{: #snippet-explicit-null-check }

Вывод, когда `audit` указывает на объект `Audit`

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

При `audit == null` **[правая часть не вычисляется](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14#null-conditional-assignment)**. В этом примере вызов `BuildSummary()` и построение строки отчёта пропускаются.

**Что проверяют `?.` и `??=`.** Сравним два присваивания в свойство `Text`.

- `audit?.Text = BuildSummary()` проверяет ссылку `audit`. Если объект есть, выражение вызывает `BuildSummary()` и заменяет `Text` при любом исходном значении свойства.
- [`audit.Text ??= BuildSummary()`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator) читает `Text` у уже созданного объекта. Выражение вызывает `BuildSummary()` и записывает результат только при `Text == null`. Если `audit` равен `null`, обращение к `Text` приводит к `NullReferenceException`.

`new Audit()` в полном примере задаёт `Text = ""`. Если выполнить каждую строку отдельно для нового объекта, первая сформирует отчёт, а вторая пропустит `BuildSummary()` и оставит пустую строку.

Оператор `??=` появился в C# 8, который вышел вместе с .NET Core 3.0. [История C# 8](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-version-history#c-version-80)

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

В сводку вошли только запросы с кодами ответа 2xx. Запросы к `/orders` и `/ORDERS` попали в одну строку с четырьмя запросами общей длительностью 220 мс. В выводе остался ключ `/orders`, который встретился первым.

Сводка готова до присваиваний через `?.`. Счётчик `builds` показывает, что `BuildSummary()` сформировал строку для `audit.Text` один раз, когда `audit` указывал на объект `Audit`.

Попробуй убрать `StringComparer.OrdinalIgnoreCase` и предскажи, сколько ключей получится.

## 4. Напиши код сам · TASK-002 {#lesson-task}

**15–20 минут.** Реализуй `GetNoisiestClients` для записей HTTP-запросов. Учитывай только записи с кодом ответа `400` и выше. С помощью `AggregateBy` посчитай для каждого клиента число таких ответов и их суммарный размер. Имена клиентов сравнивай с помощью `StringComparer.OrdinalIgnoreCase`.

- **Результат метода.** Верни до двух клиентов с наибольшим суммарным размером ответов. Каждый элемент результата — кортеж `(Client, Count, TotalBytes)`. `Count` — число ответов с кодом `400` и выше. `TotalBytes` — сумма значений `ResponseBytes` для этих ответов в байтах, тип суммы `long`. Отсортируй результат по убыванию `TotalBytes`. При равных суммах порядок клиентов произвольный. Для `Client` допустим любой регистр.
- **Текст отчёта.** Если `audit` указывает на объект, сформируй текст из `Client` и `TotalBytes` и запиши его в `audit.Text`. Выполни обе операции одним присваиванием через `?.`. Порядок записей в отчёте должен совпадать с порядком в результате. Формат записи — `клиент=сумма_байтов`, разделитель — `"; "`.

Кнопка «Открыть заготовку» загрузит в редактор полный `Program.cs` с типами `Failure` и `AuditReport`, сигнатурой `GetNoisiestClients` и примером входа в `Main`.

**Ожидаемый результат.** В результате первым идёт `api-c` (`Count = 2`, `TotalBytes = 400`), затем `api-b` (`Count = 1`, `TotalBytes = 390`). Регистр имён может отличаться. Если метод вернул имена `API-c` и `api-b`, в `audit.Text` должна быть строка `API-c=400; api-b=390`.

**Критерии готовности.** Отбери записи по коду ответа перед вызовом `AggregateBy`. Сумму размеров считай в `long`. Ответы для `Api-C` и `API-c` учитывай в одном итоге. Верни до двух клиентов с наибольшим суммарным размером ответов. При `audit == null` пропусти построение текста отчёта. **Пограничный случай.** Для пустого входа верни пустой результат. Если `audit` указывает на объект, запиши в `audit.Text` пустую строку.

При ревью метода отдельно проверь, когда вычисляется строка отчёта. При `audit == null` построение строки должно пропускаться, даже если сводка возвращается правильно.

<details><summary>Необязательная подсказка</summary><p>После <code>AggregateBy</code> используй <a href="https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.orderbydescending?view=net-10.0#system-linq-enumerable-orderbydescending-2(system-collections-generic-ienumerable((-0))-system-func((-0-1)))"><code>OrderByDescending</code></a> по сумме байтов и <a href="https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.take?view=net-10.0#system-linq-enumerable-take-1(system-collections-generic-ienumerable((-0))-system-int32)"><code>Take(int count)</code></a>, чтобы оставить до двух клиентов. Сначала сохрани результат через <a href="https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.toarray?view=net-10.0"><code>ToArray</code></a>, затем вычисляй текст отчёта в правой части присваивания через <code>?.</code>.</p></details>

~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

sealed record Failure(string Client, int StatusCode, long ResponseBytes);
sealed class AuditReport
{
    public string Text { get; set; } = "";
}

public static class Program
{
    // BEGIN TASK-002
    static IReadOnlyList<(string Client, int Count, long TotalBytes)> GetNoisiestClients(
        IEnumerable<Failure> calls, AuditReport? audit)
    {
        // На входе записи HTTP-запросов. Учитывай только записи со StatusCode >= 400.
        // Через AggregateBy посчитай для каждого клиента число таких ответов (Count)
        // и сумму их размеров ResponseBytes в байтах (TotalBytes, тип long).
        // Сравнивай имена клиентов через StringComparer.OrdinalIgnoreCase.
        // Верни до двух клиентов с наибольшим TotalBytes в виде кортежей
        // (Client, Count, TotalBytes) по убыванию TotalBytes.
        // При равных суммах порядок любой. Для Client допустим любой регистр.
        // Присваиванием через ?. запиши в audit.Text пары "клиент=сумма_байтов"
        // из результата в том же порядке с разделителем "; ". Для пустого результата
        // запиши пустую строку. При audit == null пропусти форматирование и запись.

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
~~~
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
if (audit is not null) audit.Text = "";
return Array.Empty<(string, int, long)>();
</script>

## 5. Повторение и официальные источники

После зачёта практики нажми «Пройти квиз урока» рядом с редактором. Квиз по одному покажет вопросы этого урока, на которые ещё нет оценённого ответа. Самооценка сохраняет ответ в истории карточки.

Microsoft Learn: [присваивание через `?.` в C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14#null-conditional-assignment).

*Примеры этого урока проверяются на .NET 10 при сборке сайта; браузерный компилятор использует C# 14 и .NET 10.*
