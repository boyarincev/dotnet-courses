---
lesson_number: 6
lesson_date: '27 ноября 2026'
title: 'Сводка по всем HTTP-маршрутам: CountBy и LeftJoin'
summary: 'Закрепляем подсчёт по ключу и левое соединение. В отчёт попадают даже маршруты без запросов.'
dotnet_feature: '.NET 9–10 · CountBy и LeftJoin'
series: 'Коллекции и LINQ'
code_framework: net10.0
browser_runtime: '10'
browser_start_snippet: full-program
---

## Зачем это нужно

По журналу запусков проверок можно посчитать, сколько раз проверяли каждый компонент. Для отчёта о полноте проверок нужны и компоненты, для которых проверки ещё не запускали.

`CountBy` даёт счётчик событий по ключу. `LeftJoin` помогает сопоставить такие данные с полным каталогом. Каталог задаёт состав отчёта, а для отсутствующих совпадений можно явно указать нулевой счётчик или пометку об отсутствии данных.

## Что вспомнить

- В [уроке №1]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) считали частоты через `CountBy`. Метод возвращает пары `KeyValuePair<TKey, int>`. `Key` — ключ, `Value` — число вхождений. Ключа, которого нет во входной последовательности, среди этих пар не будет. [Сигнатура CountBy](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.countby?view=net-9.0#definition)
- В [уроке №4]({{ '/courses/csharp-dotnet-9-11/lessons/004-closed-hierarchies-leftjoin/' | relative_url }}) соединяли каталог с результатами проверок через `LeftJoin`. Селектор результата получает элемент слева и совпавший элемент справа. Если пары нет, второй аргумент получает `default(TInner)`. Порядок элементов слева сохраняется. [Документация LeftJoin](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.leftjoin?view=net-10.0) · [Порядок и результат без совпадения в .NET 10](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/System.Linq/src/System/Linq/LeftJoin.cs#L241-L266)

В примере ниже используем такие сигнатуры.

~~~csharp
public static IEnumerable<KeyValuePair<TKey, int>> CountBy<TSource, TKey>(
    this IEnumerable<TSource> source,
    Func<TSource, TKey> keySelector,
    IEqualityComparer<TKey>? keyComparer = null)
    where TKey : notnull;

public static IEnumerable<TResult> LeftJoin<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner?, TResult> resultSelector);
~~~

## Запусти пример

В журнале перезапусков `gateway` встречается дважды, а `worker` один раз. Отдельно есть каталог сервисов и список ответственных команд. У `worker` команда пока не назначена, но строка этого сервиса нужна в отчёте. Программа показывает оба приёма по отдельности, а в задании они пригодятся для одной сводки.

Нажми «Запустить этот пример» под программой. Для локального запуска используй SDK .NET 10. В проекте `net10.0` по умолчанию доступен C# 14. [Версии языка по умолчанию](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-versioning#defaults)

~~~sh
dotnet new console -f net10.0 -o RouteCounts
cd RouteCounts
~~~

Замени содержимое `Program.cs` кодом ниже и выполни `dotnet run`.

~~~csharp
using System;
using System.Linq;

public sealed record ServiceOwner(string Service, string Team);

public static class Program
{
    public static void Main()
    {
        string[] restarts = ["gateway", "worker", "gateway"];

        var counts = restarts
            .CountBy(keySelector: service => service) // Ключ — имя сервиса.
            .OrderBy(keySelector: pair => pair.Key, comparer: StringComparer.Ordinal);

        foreach (var (service, count) in counts)
            Console.WriteLine($"{service}: перезапусков {count}");

        string[] services = ["worker", "gateway"];
        ServiceOwner[] owners = [new(Service: "gateway", Team: "платформа")];

        var contacts = services.LeftJoin(
            inner: owners,                           // Справа — назначения команд.
            outerKeySelector: service => service,    // Имя сервиса из каталога.
            innerKeySelector: owner => owner.Service, // Имя из назначения команды.
            resultSelector: (service, owner) =>      // Для сервиса без команды owner равен null.
                $"{service}: {owner?.Team ?? "команда не назначена"}");

        foreach (string contact in contacts)
            Console.WriteLine(contact);
    }
}
~~~
{: #snippet-full-program }

Ожидаемый вывод

~~~text
gateway: перезапусков 2
worker: перезапусков 1
worker: команда не назначена
gateway: платформа
~~~
{: #output-full-program }

## Напиши код сам · TASK-006 {#lesson-task}

Реализуй `CountRequests` примерно за 10–12 минут. Метод получает каталог HTTP-маршрутов и журнал запросов за один интервал. В обоих массивах маршруты уже представлены строками вроде `/orders`. Верни массив пар `(Route, Count)`, по одной для каждого маршрута каталога в исходном порядке.

- `Count` — число вхождений маршрута в журнале. Повторные запросы учитываются отдельно. Если запросов по маршруту нет, верни для него `0`.
- Маршруты сравнивай с учётом регистра. Каталог содержит уникальные имена, например `/orders` и `/ORDERS` могут быть разными маршрутами. Запросы к маршрутам вне каталога в отчёт не попадают.
- При пустом каталоге верни пустой массив. При пустом журнале верни все маршруты каталога с нулевыми счётчиками.

В первом тесте журнал начинается с `/orders`. В отчёте ожидаются `("/users", 1)`, `("/health", 0)`, `("/orders", 3)` и `("/ORDERS", 1)` именно в порядке каталога.

Выбери, как посчитать запросы и сопоставить счётчики с каталогом. После запуска объясни в одном-двух предложениях, какая последовательность задаёт порядок отчёта и откуда берутся нули. Открой заготовку и нажми «Запустить текущий код» после правки. Для локальной проверки скопируй заготовку в `RouteCounts/Program.cs` и выполни `dotnet run` в каталоге проекта.

~~~csharp
using System;
using System.Linq;

public static class Program
{
    // BEGIN TASK-006
    static (string Route, int Count)[] CountRequests(string[] catalog, string[] requests)
    {
        // catalog — уникальные HTTP-маршруты в порядке строк отчёта.
        // requests — маршруты запросов за один интервал, возможны повторения.
        // Верни (Route, Count) по порядку каталога. Count — число вхождений
        // в журнале, в том числе 0. Сравнивай маршруты с учётом регистра.
        // Запросы к маршрутам вне каталога игнорируй.
        throw new NotImplementedException();
    }
    // END TASK-006

    public static void Main()
    {
        string[] catalog = ["/users", "/health", "/orders", "/ORDERS"];
        string[] requests = ["/orders", "/unknown", "/users", "/ORDERS", "/orders", "/orders"];

        Check(
            catalog,
            requests,
            expected: [("/users", 1), ("/health", 0), ("/orders", 3), ("/ORDERS", 1)],
            scenario: "состав отчёта, порядок каталога, регистр и повторные запросы");
        Check(
            catalog,
            requests: [],
            expected: [("/users", 0), ("/health", 0), ("/orders", 0), ("/ORDERS", 0)],
            scenario: "пустой журнал");
        Check(
            catalog: [],
            requests,
            expected: [],
            scenario: "пустой каталог");

        Console.WriteLine("Все проверки пройдены");
    }

    static void Check(
        string[] catalog, string[] requests, (string Route, int Count)[] expected,
        string scenario)
    {
        var actual = CountRequests(catalog, requests);
        Assert(actual.SequenceEqual(expected),
            $"Неверная сводка ({scenario}). Ожидалось [{string.Join(", ", expected)}], " +
            $"получено [{string.Join(", ", actual)}].");
    }

    static void Assert(bool condition, string failureMessage)
    {
        if (!condition)
            throw new InvalidOperationException("❌ TASK-006: " + failureMessage);
    }
}
~~~
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return requests.GroupBy(route => route)
    .Select(group => (group.Key, group.Count()))
    .ToArray();
</script>

<details>
<summary>Подсказка</summary>
<p>Сначала получи счётчики из журнала через <code>CountBy</code>. Затем используй показанную выше перегрузку <code>LeftJoin</code> с пятью параметрами. С какой стороны должен стоять каталог, чтобы маршруты без запросов остались в отчёте?</p>
</details>

<details>
<summary>Разбор после попытки</summary>
<p><code>CountBy</code> даёт одну пару на каждый маршрут из журнала. В <code>LeftJoin</code> каталог идёт слева, а эти пары справа. Ключ слева — сам маршрут, ключ справа — <code>Key</code> пары. Селектор результата берёт имя маршрута слева и счётчик справа.</p>
<p>Если совпадения нет, второй аргумент селектора получает <code>default(KeyValuePair&lt;string, int&gt;)</code>. Пара является структурой, и её <code>Value</code> в этом случае равен <code>0</code>. Для имени маршрута используй левый элемент, который присутствует в каждом результате. <a href="https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/default-values">Значения по умолчанию для типов C#</a></p>
</details>

После зачёта открой [квиз урока №6]({{ '/courses/csharp-dotnet-9-11/quiz/' | relative_url }}?through=6). На повторении объясни, почему соединение каталога с отдельными записями журнала может дать несколько строк для одного маршрута.
