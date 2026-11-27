---
lesson_number: 4
lesson_date: '25 ноября 2026'
title: 'Сводка по каталогу: LeftJoin и закрытые иерархии'
summary: 'Строим отчёт по каталогу сервисов и включаем в него сервисы без записей о проверках.'
csharp_feature: 'C# 15 · закрытые иерархии'
dotnet_feature: '.NET 10 · Enumerable.LeftJoin'
series: 'Коллекции и LINQ'
code_framework: net11.0
browser_runtime: '11'
browser_start_snippet: full-program
---

## Зачем это нужно

В отчёт по каталогу часто нужно включать объекты, по которым ещё нет данных. `LeftJoin` сохраняет все элементы каталога и присоединяет к ним записи с совпадающим ключом.

Когда результаты одной операции бывают разных видов, каждый вариант может хранить свои данные. Закрытая иерархия позволяет описать варианты отдельными типами. Компилятор может предупредить, если в выражении `switch` пропущен один из них.

## 1. .NET 10 · Соединение с LeftJoin

В примере `services` — каталог имён сервисов, а `checks` — записи о проведённых проверках. У каждой записи есть имя сервиса, и по нему соединяем две последовательности. `Check` — общий тип записей. `Healthy` обозначает успешную проверку, а `Issue` хранит сообщение об ошибке. В примере и задании используем перегрузку с пятью параметрами. Она применяет компаратор по умолчанию, который для строк сравнивает ключи с учётом регистра. [Документация Enumerable.LeftJoin](https://learn.microsoft.com/dotnet/api/system.linq.enumerable.leftjoin?view=net-10.0)

```csharp
public static IEnumerable<TResult> LeftJoin<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner?, TResult> resultSelector);
```

`outer` — левая последовательность `services`, `inner` — правая последовательность `checks`. Функции `outerKeySelector` и `innerKeySelector` выбирают ключи для сравнения. Первая возвращает имя сервиса из каталога, вторая — имя из свойства `Check.Service`. Функция `resultSelector` получает имя сервиса и результат проверки и формирует строку отчёта.

Для каждого элемента `services` в отчёте будет хотя бы одна строка. `LeftJoin` вызывает `resultSelector` для каждого результата проверки с тем же именем сервиса. Если совпадений нет, он вызывает `resultSelector` один раз и передаёт `default(TInner)` вторым аргументом. В примере `TInner` — ссылочный тип `Check`, поэтому это `null`. Внутреннее соединение `Join` возвращает только пары с совпадающими ключами.

Сервисы идут в порядке `services`, а совпавшие результаты проверок для каждого элемента каталога — в порядке `checks`. Если нужна ровно одна строка на сервис, сначала оставь не больше одной записи о проверке для каждого имени сервиса ([порядок обхода в реализации LeftJoin для .NET 10](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/System.Linq/src/System/Linq/LeftJoin.cs#L241-L265)).

В примере ниже соединение выполняется, когда `foreach` перечисляет `lines` ([отложенное выполнение LeftJoin](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.leftjoin?view=net-10.0#remarks)).

## 2. C# 15 · Закрытая иерархия и switch

Чтобы получить строку отчёта, `resultSelector` передаёт результат проверки в функцию `Describe`. Функция `Describe` обрабатывает `Healthy` для успешной проверки и `Issue` для ошибки. Если `LeftJoin` не нашёл запись по имени сервиса, `Describe` получает `null`.

Выражение `switch` выбирает первую подходящую ветвь. Шаблон `Healthy` проверяет тип объекта. Шаблон `Issue issue` также связывает объект с переменной `issue`, через которую можно прочитать свойство `Message`.

```csharp
static string Describe(Check? check) => check switch
{
    Healthy => "в норме",
    Issue issue => issue.Message,
    null => "нет проверки"
};
```

Модификатор `closed` делает `Check` абстрактным и требует объявлять прямых наследников в той же сборке и модуле, что и `Check`. Компилятор видит, что выражение `switch` обрабатывает оба типа наследников и допустимое для `Check?` значение `null`. Если объявить ещё одного прямого наследника `Check` и оставить его без подходящей ветви, компилятор предупредит, что выражение `switch` обрабатывает не все варианты. Шаблон `_` подошёл бы и для нового типа. В примере `Healthy` и `Issue` помечены `sealed`, поэтому у них не может быть наследников. [Модификатор closed](https://learn.microsoft.com/dotnet/csharp/language-reference/keywords/closed), [выражение switch](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/switch-expression)

## Запусти пример

В [уроке №3]({{ '/courses/csharp-dotnet-9-11/lessons/003-ordered-dictionary-extension-indexers/' | relative_url }}) порядок сервисов на панели задавал `OrderedDictionary`. Здесь порядок строк отчёта задаёт каталог `services`.

Нажми «Запустить этот пример» под программой. Для запуска локально нужен SDK .NET 11 (11.0.100 или новее). Создай проект командами ниже, замени его `Program.cs` кодом примера и выполни `dotnet run`. Метод `LeftJoin` появился в .NET 10. Для проектов с целевой платформой `net11.0` SDK .NET 11 по умолчанию использует C# 15, в котором появился модификатор `closed`. [Что нового в C# 15](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-15#closed-hierarchies)

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
            inner: checks,                               // Результаты проверок.
            outerKeySelector: service => service,         // Ключ — имя сервиса из каталога.
            innerKeySelector: check => check.Service,     // Ключ — имя сервиса из результата проверки.
            resultSelector: (service, check) =>           // check равен null, если у сервиса нет проверок.
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

Для `api` есть два результата проверки, поэтому в отчёте две строки. Для `worker` результатов нет, поэтому отчёт содержит одну строку «нет проверки».

Для короткой проверки открой пример в редакторе и добавь новый вариант результата `public sealed record class Skipped(string Service) : Check(Service);`. Какой ветви теперь не хватает в `Describe`? Добавь эту ветвь и запись `new Skipped("worker")` в `checks`. Запусти программу и проверь, что для `worker` появилась строка с твоим описанием.

## Напиши код сам · TASK-004 {#lesson-task}

Реализуй `BuildRows`, который возвращает строки отчёта по клиентам в массиве `ClientRow[]`. Сопоставь каждое имя из `clients` со свойством `Client` у записей из `summaries` через `LeftJoin`. Сравнивай имена с учётом регистра.

- Для каждой найденной по имени сводки добавь в результат `WithSummary` с именем клиента и количеством запросов из `Requests`. Ноль запросов — допустимое значение найденной сводки.
- Если для имени клиента сводок нет, добавь один `WithoutSummary` с этим именем.
- Сохрани порядок имён в `clients`. Для каждого элемента `clients` сохрани порядок совпавших сводок в `summaries`. Если `clients` пуст, верни пустой массив.

Открой заготовку, заполни тело метода и нажми «Запустить текущий код». Для локальной проверки нажми «Скачать Program.cs» под редактором, замени файл в проекте `ServiceChecks` и выполни `dotnet run` в каталоге проекта.

```csharp
using System;
using System.Linq;

#nullable enable

public sealed record class ClientSummary(string Client, int Requests);
public closed record class ClientRow(string Client);
public sealed record class WithSummary(string Client, int Requests) : ClientRow(Client);
public sealed record class WithoutSummary(string Client) : ClientRow(Client);

public static class Program
{
    // BEGIN TASK-004
    static ClientRow[] BuildRows(string[] clients, ClientSummary[] summaries)
    {
        // Сопоставь каждое имя из clients со свойством Client у записей из summaries.
        // Используй LeftJoin и сравнивай имена с учётом регистра.
        // Для каждой найденной сводки добавь в результат WithSummary с именем
        // клиента и количеством запросов из Requests. Ноль запросов допустим.
        // Если для имени сводок нет, добавь один WithoutSummary с этим именем.
        // Сохрани порядок clients и порядок совпадений в summaries для каждого элемента clients.
        // Если clients пуст, верни пустой массив.
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
```
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return clients.Select(client => (ClientRow)new WithoutSummary(client)).ToArray();
</script>

<details>
<summary>Подсказка</summary>
<p>Селектор результата можно оформить методом <code>static ClientRow Project(string client, ClientSummary? summary)</code>. В <code>client</code> поступает имя из <code>clients</code>, в <code>summary</code> — найденная по этому имени сводка или <code>null</code>. Явный тип результата <code>ClientRow</code> позволяет вернуть из <code>Project</code> любой из двух вариантов строки, <code>WithSummary</code> или <code>WithoutSummary</code>. Передай <code>Project</code> в параметр <code>resultSelector</code>.</p>
</details>

На повторении объясни, какую строку создаёт `LeftJoin` для сервиса без проверок и о чём предупредит компилятор, если у `Check` появится ещё один прямой наследник, для которого в выражении `switch` нет подходящей ветви.

В [уроке №6]({{ '/courses/csharp-dotnet-9-11/lessons/006-http-route-counts/' | relative_url }}) используем `LeftJoin` для сводки по всем HTTP-маршрутам, включая маршруты без запросов.
