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

В .NET 10 появился метод `Enumerable.LeftJoin`. Раньше левое соединение записывали через `join … into` и `from … in …DefaultIfEmpty()`. В синтаксисе методов для этого сочетали `GroupJoin`, `SelectMany` и `DefaultIfEmpty()`. [Левое соединение в LINQ до .NET 10](https://learn.microsoft.com/en-us/dotnet/csharp/linq/standard-query-operators/join-operations#emulate-a-left-outer-join)

Ниже сигнатура перегрузки с пятью параметрами, которую используем в уроке. `outer` и `inner` — левая и правая последовательности. Две функции `outerKeySelector` и `innerKeySelector` определяют, по каким ключам искать совпадения. Перегрузка использует компаратор по умолчанию. [Документация Enumerable.LeftJoin](https://learn.microsoft.com/dotnet/api/system.linq.enumerable.leftjoin?view=net-10.0#overloads)

```csharp
public static IEnumerable<TResult> LeftJoin<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner?, TResult> resultSelector);
```
{: #leftjoin-signature }

`resultSelector` формирует элемент результата из совпавшей пары. `LeftJoin` сохраняет каждый левый элемент. Если справа совпадений несколько, селектор вызывается для каждой пары. Если совпадений нет, он вызывается один раз с левым элементом и `default(TInner)` справа. Внутреннее соединение `Join` возвращает только пары с совпадающими ключами.

## 2. C# 15 · Закрытая иерархия

Модификатор `closed` делает базовый класс абстрактным и требует объявлять его прямых наследников в той же сборке и в том же модуле. Компилятор видит набор прямых наследников и может проверить, обрабатывает ли выражение `switch` каждый из них. Если вход допускает `null`, нужно обработать и это значение. [Модификатор closed](https://learn.microsoft.com/dotnet/csharp/language-reference/keywords/closed) В [полном примере](#snippet-full-program) найди объявление `closed Check` в конце файла и метод `Describe`.

## Запусти пример

В примере ниже `services` — каталог имён сервисов, а `checks` — результаты проведённых проверок. Программа выводит результат каждой проверки. Для сервиса без проверок она выводит строку «нет проверки». Нажми «Запустить этот пример» под программой.

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

Ожидаемый вывод

```text
api: тайм-аут
api: в норме
auth: в норме
worker: нет проверки
```
{: #output-full-program }

### Как получились строки отчёта

В методе [`Main` из примера](#snippet-full-program) вызов `services.LeftJoin(...)` сопоставляет имя из каталога со свойством `Check.Service`. Компаратор по умолчанию для строк учитывает регистр. `resultSelector` формирует строку из имени и результата `Describe(check)`. [Сравнение строк на равенство](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/equality-operators#string-equality)

`api` идёт первым в каталоге. У него две проверки, поэтому получаем две строки в порядке записей в `checks`. У `worker` совпадений нет, и вторым аргументом в `resultSelector` приходит `null`, значение по умолчанию для ссылочного типа `Check`. Поэтому `Describe` возвращает «нет проверки». [Порядок обхода в LeftJoin для .NET 10](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/System.Linq/src/System/Linq/LeftJoin.cs#L241-L265)

Как и в [уроке №3]({{ '/courses/csharp-dotnet-9-11/lessons/003-ordered-dictionary-extension-indexers/' | relative_url }}), исходная коллекция задаёт порядок строк. Здесь это каталог `services`. Соединение выполняется, когда `foreach` перечисляет `lines`. [Отложенное выполнение LeftJoin](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.leftjoin?view=net-10.0#remarks)

### Как `closed` помогает проверить `switch`

`Check` — общий тип для `Healthy` и `Issue`. В методе [`Describe` из примера](#snippet-full-program) шаблон `Healthy` выбирает строку «в норме». Шаблон `Issue issue` связывает найденный объект с переменной `issue`, чтобы прочитать его сообщение. Ветка `null` описывает отсутствие проверки. [Выражение switch](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/switch-expression)

`Check` объявлен с `closed`. Если добавить ещё одного прямого наследника, текущий `switch` перестанет покрывать все варианты и компилятор предупредит о пропущенном случае. Общая ветвь `_` подошла бы и для нового типа. [Проверка полноты switch для closed](https://learn.microsoft.com/dotnet/csharp/language-reference/keywords/closed#exhaustive-switch-expressions)

Нажми «Запустить этот пример» под [программой](#snippet-full-program). В редакторе после объявления `Issue` добавь `public sealed record class Skipped(string Service) : Check(Service);`. Добавь ветвь для `Skipped` в методе `Describe`, а в массив `checks` внутри `Main` добавь `new Skipped("worker")`. Нажми «Запустить текущий код» и проверь, что для `worker` появилась строка с твоим описанием.

### Локальный запуск

Для запуска локально нужен SDK .NET 11 (11.0.100 или новее). В проекте `net11.0` по умолчанию используется C# 15. Создай проект, замени `Program.cs` [полным примером](#snippet-full-program) и выполни `dotnet run`. [Что нового в C# 15](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-15#closed-hierarchies)

```sh
dotnet new console -f net11.0 -o ServiceChecks
cd ServiceChecks
```

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
<p>В <code>BuildRows</code> селектор результата можно оформить локальной функцией <code>static ClientRow Project(string client, ClientSummary? summary)</code>. В <code>client</code> поступает имя из <code>clients</code>, в <code>summary</code> — найденная по этому имени сводка или <code>null</code>. Явный тип результата <code>ClientRow</code> позволяет вернуть из <code>Project</code> любой из двух вариантов строки, <code>WithSummary</code> или <code>WithoutSummary</code>. Передай <code>Project</code> в параметр <code>resultSelector</code> в <a href="#leftjoin-signature">показанной перегрузке <code>LeftJoin</code></a>.</p>
</details>

На повторении вернись к [программе](#snippet-full-program). В `Main` найди `resultSelector` и объясни, откуда берётся строка для сервиса без проверок. Затем посмотри на `switch` в `Describe`. О чём предупредит компилятор, если у `Check` появится ещё один прямой наследник без подходящей ветви?

В [уроке №6]({{ '/courses/csharp-dotnet-9-11/lessons/006-http-route-counts/' | relative_url }}) используем `LeftJoin` для сводки по всем HTTP-маршрутам, включая маршруты без запросов.
