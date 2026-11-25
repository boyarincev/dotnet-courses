---
lesson_number: 4
lesson_date: '25 ноября 2026'
title: 'Сводка по каталогу: LeftJoin и закрытые иерархии'
summary: 'Сохраняем строки без совпадения и явно описываем каждый результат соединения.'
csharp_feature: 'C# 15 · закрытые иерархии'
dotnet_feature: '.NET 10 · Enumerable.LeftJoin'
series: 'Коллекции и LINQ'
code_framework: net11.0
browser_runtime: '11'
browser_start_snippet: full-program
---

## Зачем это нужно

В [уроке №3]({{ '/courses/csharp-dotnet-9-11/lessons/003-ordered-dictionary-extension-indexers/' | relative_url }}) мы выводили сервисы в заданном порядке. Теперь к каталогу нужно присоединить результаты проверок. Новый сервис должен попасть в отчёт, даже если его ещё ни разу не проверяли. Для уже проверенных сервисов нужно различать успешную проверку и обнаруженную ошибку.

## 1. .NET 10 · Соединение с LeftJoin

В примере и задании используем перегрузку с пятью параметрами. [Документация Enumerable.LeftJoin](https://learn.microsoft.com/dotnet/api/system.linq.enumerable.leftjoin?view=net-10.0)

```csharp
public static IEnumerable<TResult> LeftJoin<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner?, TResult> resultSelector);
```

`outer` — каталог перед точкой, а `inner` — его проверки. Два селектора ключа указывают, по каким значениям искать совпадения. `resultSelector` формирует строку отчёта.

Левая последовательность определяет, какие строки попадут в отчёт. Для каждого сервиса `LeftJoin` вызывает селектор результата по одному разу для каждой совпавшей проверки справа. Если проверок нет, он всё равно вызывает селектор один раз, передавая `default` для правого элемента. В нашем примере проверки — ссылочные типы, поэтому это `null`. Обычный `Join` выдаёт только совпавшие пары и подходит, если строки без пары можно пропустить.

Порядок строк определяется левой последовательностью. Несколько совпадений для одного ключа выходят в порядке правой последовательности. Если нужна ровно одна строка на сервис, сначала выбери одну проверку для каждого ключа. В примере ниже соединение выполняется, когда `foreach` перечисляет `lines`. [Порядок обхода в реализации LeftJoin для .NET 10](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/System.Linq/src/System/Linq/LeftJoin.cs#L241-L265)

## 2. C# 15 · Закрытая иерархия и switch

`switch`-выражение проверяет ветки сверху вниз и возвращает значение справа от `=>` в первой подходящей ветке. Шаблон `Healthy` сопоставляется по типу, `Issue issue` также даёт переменную `issue` с полями результата, а `null` означает, что совпадение справа не найдено.

```csharp
static string Describe(Check? check) => check switch
{
    Healthy => "в норме",
    Issue issue => issue.Message,
    null => "нет проверки"
};
```

`closed record class Check` объявляет абстрактный базовый тип. Его прямых наследников можно объявить только в той же сборке. Компилятор знает эти варианты и видит, что `switch` покрывает оба типа и `null`. Если добавить новый прямой тип проверки и забыть обработать его, компилятор предупредит о неполном `switch`. Ветка `_` приняла бы новый тип автоматически, поэтому здесь её нет. В примере оба наследника помечены `sealed`, чтобы у них не было своих наследников. Используй `closed`, когда набор вариантов контролируется приложением. [Модификатор closed](https://learn.microsoft.com/dotnet/csharp/language-reference/keywords/closed), [выражение switch](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/switch-expression)

## Запусти пример

Нажми «Запустить этот пример» под программой. Для запуска локально нужен SDK .NET 11 (11.0.100 или новее). Создай проект командами ниже, замени его `Program.cs` кодом примера и выполни `dotnet run`. API `LeftJoin` появился в .NET 10, а `net11.0` выбирает C# 15 для синтаксиса `closed`. [Что нового в C# 15](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-15#closed-hierarchies)

```sh
dotnet new console -f net11.0 -o ServiceChecks
cd ServiceChecks
```

```csharp
using System;
using System.Linq;

#nullable enable

public static class Program
{
    public static void Main()
    {
        string[] services = ["api", "auth", "worker"];
        Check[] checks =
        [
            new Healthy("auth"),
            new Issue("api", "тайм-аут"),
            new Healthy("api")
        ];

        var lines = services.LeftJoin(
            inner: checks,                               // Проверки справа от каталога.
            outerKeySelector: service => service,         // Имя из каталога.
            innerKeySelector: check => check.Service,     // Имя, указанное в проверке.
            resultSelector: (service, check) =>           // check равен null, если пары нет.
                $"{service}: {Describe(check)}");

        foreach (var line in lines)
            Console.WriteLine(line);
    }

    private static string Describe(Check? check) => check switch
    {
        Healthy => "в норме",
        Issue issue => issue.Message,
        null => "нет проверки"
    };
}

public closed record class Check(string Service);
public sealed record class Healthy(string Service) : Check(Service);
public sealed record class Issue(string Service, string Message) : Check(Service);
```
{: #snippet-full-program }

```text
api: тайм-аут
api: в норме
auth: в норме
worker: нет проверки
```
{: #output-full-program }

У `api` две проверки, поэтому он занимает две строки. У `worker` проверок нет, поэтому его строка описывает отсутствие данных.

## Напиши код сам · TASK-004 {#lesson-task}

Реализуй `BuildRows` для отчёта по клиентам. Массив `clients` задаёт порядок строк, а в `summaries` хранятся имена клиентов и количество запросов. Соедини их по имени через `LeftJoin`. Сравнение строк по умолчанию учитывает регистр. Верни массив `ClientRow[]` с готовыми типами строк:

- Для каждой совпавшей сводки верни `WithSummary` с именем клиента и количеством запросов. Ноль запросов — тоже найденная сводка.
- Для клиента без пары верни одну строку `WithoutSummary` с его именем.
- Сохрани порядок каталога, а в пределах одного клиента — порядок совпавших сводок. Для пустого каталога верни пустой массив.

Открой заготовку, заполни тело метода и нажми «Запустить текущий код». Для локальной практики скопируй заготовку в `ServiceChecks/Program.cs` и запусти `dotnet run` в каталоге проекта.

```csharp
using System;
using System.Linq;

#nullable enable

public static class Program
{
    // BEGIN TASK-004
    static ClientRow[] BuildRows(string[] clients, ClientSummary[] summaries)
    {
        // Соедини имена клиентов и сводки по имени через LeftJoin с учётом регистра.
        // Верни WithSummary с именем и числом запросов для каждой пары.
        // Если сводки нет, верни одну строку WithoutSummary с именем клиента.
        // Сохрани порядок каталога и порядок совпавших сводок каждого клиента.
        // Для пустого каталога верни пустой массив.
        throw new NotImplementedException();
    }
    // END TASK-004

    public static void Main()
    {
        string[] clients = ["north", "south", "east"];
        ClientSummary[] summaries =
        [
            new("east", 0),
            new("south", 9),
            new("NORTH", 99),
            new("south", 3)
        ];
        ClientRow[] expected =
        [
            new WithoutSummary("north"),
            new WithSummary("south", 9),
            new WithSummary("south", 3),
            new WithSummary("east", 0)
        ];

        var rows = BuildRows(clients, summaries);
        Assert(rows.Any(row => row is WithoutSummary { Client: "north" }),
            "Для клиента north отсутствует строка WithoutSummary.");
        Assert(rows.SequenceEqual(expected),
            $"Строки отчёта или их порядок неверны. Ожидалось: {DescribeRows(expected)}. " +
            $"Получено: {DescribeRows(rows)}.");

        var noSummaries = BuildRows(["east"], []);
        Assert(noSummaries is [WithoutSummary { Client: "east" }],
            $"При пустом списке сводок ожидалась строка east без сводки. Получено: {DescribeRows(noSummaries)}.");

        var noClients = BuildRows([], summaries);
        Assert(noClients.Length == 0,
            $"При пустом каталоге ожидалось 0 строк, получено {noClients.Length}.");

        Console.WriteLine("Все проверки пройдены");
    }

    private static string DescribeRows(ClientRow[] rows) =>
        string.Join(", ", rows.Select(row => row switch
        {
            WithSummary found => $"{found.Client}={found.Requests}",
            WithoutSummary missing => $"{missing.Client} без сводки"
        }));

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition)
            throw new InvalidOperationException("❌ TASK-004: " + failureMessage);
    }
}

public sealed record class ClientSummary(string Client, int Requests);
public closed record class ClientRow(string Client);
public sealed record class WithSummary(string Client, int Requests) : ClientRow(Client);
public sealed record class WithoutSummary(string Client) : ClientRow(Client);
```
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return clients.Select(client => (ClientRow)new WithoutSummary(client)).ToArray();
</script>

<details>
<summary>Подсказка</summary>
<p>Начни с сигнатуры проекции <code>static ClientRow Project(string client, ClientSummary? summary)</code>. Когда определишь, какой тип возвращать для каждого значения summary, передай Project как селектор результата.</p>
</details>

На повторении объясни, зачем соединение сохраняет строку без пары и как закрытая иерархия помогает проверить обработку всех известных вариантов.
