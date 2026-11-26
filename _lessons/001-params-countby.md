---
lesson_number: 1
lesson_date: '20 ноября 2026'
title: 'Коллекции без лишней работы: params и CountBy'
summary: 'Принимаем произвольное число аргументов и считаем частоты элементов на одном практическом примере.'
csharp_feature: 'C# 13 · params collections'
dotnet_feature: '.NET 9 · CountBy'
series: 'Коллекции и LINQ'
code_framework: net9.0
browser_runtime: '9'
browser_snippets: browser-snippets.js
browser_start_snippet: full-program
---
## Зачем это нужно

При анализе журнала событий часто нужно понять, какие категории встречаются чаще всего. `CountBy` ведёт по одному счётчику на категорию. Если для разбора нужны сами записи каждой категории, подойдёт `GroupBy`.

При экспорте отчёта `params` позволяет перечислить нужные колонки отдельными аргументами. В C# 13 метод с `params ReadOnlySpan<T>` может принять и отдельные аргументы, и готовый срез массива колонок. Для передачи среза не нужно копировать его в отдельный массив.

## 1. C# 13: расширенный `params`
До C# 13 тип параметра `params` ограничивался [одномерным массивом `T[]`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/method-parameters#params-modifier).
```csharp
static int Sum(params int[] numbers) => numbers.Sum();
Console.WriteLine(Sum(10, 20, 30)); // 60. Три числа образуют один массив numbers.
```
{: #snippet-params-array }

Вывод

~~~text
60
~~~
{: #output-params-array }

В C# 13 появились [коллекции `params`](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-13#params-collections), например `ReadOnlySpan<T>`, `Span<T>`, `IEnumerable<T>` или `List<T>`. При [развёрнутом вызове](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/classes#15624-parameter-collections) компилятор собирает отдельные элементы в одну коллекцию. Можно также передать готовую коллекцию подходящего типа.
```csharp
static int Sum(params ReadOnlySpan<int> values)
{
    int total = 0;
    foreach (int value in values) total += value;
    return total;
}
Console.WriteLine(Sum(10, 20, 30)); // 60. Три числа образуют один ReadOnlySpan<int>.
```
{: #snippet-params-span }

Вывод

~~~text
60
~~~
{: #output-params-span }

Для вызова `Sum(10, 20, 30)` с `ReadOnlySpan<int>` компилятор из .NET 9 SDK [сохраняет константы в данных сборки](https://github.com/dotnet/roslyn/blob/f3348c2a2be16ec6525cb3df7be12952c3e2de9d/src/Compilers/CSharp/Portable/CodeGen/EmitArrayInitializer.cs#L606-L623). На .NET 9 x64 `ReadOnlySpan<int>` [ссылается на эти данные](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/RuntimeHelpers.cs#L148-L149), поэтому вызов обходится без выделения массива для аргументов. Элементы удобно обработать сразу в `foreach`.

Заголовок можно передать отдельным аргументом, а метки собрать в `IEnumerable<string>`.

```csharp
// "HTTP" — заголовок. Оставшиеся три аргумента образуют коллекцию methods.
Analyze("HTTP", "GET", "POST", "GET"); // HTTP: 3

static void Analyze(string title, params IEnumerable<string> methods)
{
    Console.WriteLine($"{title}: {methods.Count()}");
}
```
{: #snippet-params-enumerable }

Вывод

~~~text
HTTP: 3
~~~
{: #output-params-enumerable }

## 2. .NET 9: `Enumerable.CountBy()`
[`GroupBy`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.groupby?view=net-9.0) собирает строки с одинаковым ключом. Из каждой группы `Select` берёт ключ и число элементов. Во всех трёх коротких примерах `methods` содержит `["GET", "POST", "GET", "get"]`.
```csharp
var counts = methods.GroupBy(keySelector: method => method)
    .Select(group => new { Method = group.Key, Count = group.Count() });
```
{: #snippet-groupby-count }

Вывод

~~~text
GET: 2
POST: 1
get: 1
~~~
{: #output-groupby-count }

Если нужны **только счётчики**, [`CountBy` в .NET 9](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#linq) вычисляет их без промежуточных групп строк. В .NET 9 у метода следующая сигнатура. [Справочник CountBy для .NET 9](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.countby?view=net-9.0#definition)

```csharp
public static IEnumerable<KeyValuePair<TKey, int>> CountBy<TSource, TKey>(
    this IEnumerable<TSource> source,
    Func<TSource, TKey> keySelector,
    IEqualityComparer<TKey>? keyComparer = null)
    where TKey : notnull;
```

- `source` — элементы для подсчёта. В вызове метода расширения последовательность `methods` стоит перед точкой.
- `keySelector` — функция, которая получает один элемент и возвращает ключ. Здесь `method => method` берёт саму метку.
- `keyComparer` — необязательный параметр, который определяет, какие ключи считать равными при подсчёте. Если его не передать, применяется `EqualityComparer<TKey>.Default`.

```csharp
var counts = methods.CountBy(
    // Используем само имя HTTP-метода как ключ подсчёта.
    keySelector: method => method);
foreach (var (method, count) in counts)
    Console.WriteLine($"{method}: {count}");
```
{: #snippet-countby }

Вывод

~~~text
GET: 2
POST: 1
get: 1
~~~
{: #output-countby }

Вызов возвращает [`IEnumerable<KeyValuePair<TKey, int>>`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.countby?view=net-9.0#returns). Каждый элемент — пара из ключа и количества его вхождений. В .NET 9 [подсчёт начинается при перечислении](https://github.com/dotnet/runtime/blob/v9.0.0/src/libraries/System.Linq/src/System/Linq/CountBy.cs#L27-L62). Перед выдачей первой пары `CountBy` читает весь источник и накапливает счётчики по ключам.

При сравнении строк по умолчанию `"GET"` и `"get"` дают два ключа ([правила сравнения строк](<https://learn.microsoft.com/en-us/dotnet/api/system.string.equals?view=net-9.0#system-string-equals(system-string)>)). Для нашей выгрузки передадим [`StringComparer.OrdinalIgnoreCase`](https://learn.microsoft.com/en-us/dotnet/api/system.stringcomparer.ordinalignorecase?view=net-9.0), который сравнивает метки без учёта регистра.
```csharp
var counts = methods.CountBy(
    keySelector: method => method,
    // "GET" и "get" учитываются в одном счётчике.
    keyComparer: StringComparer.OrdinalIgnoreCase);
```
{: #snippet-countby-comparer }

Вывод

~~~text
GET: 3
POST: 1
~~~
{: #output-countby-comparer }

Используй `GroupBy`, когда нужно обработать записи внутри каждой группы, например вывести все записи для отдельного метода.

## 3. Полностью запускаемый пример
Выполни команды с **.NET 9 SDK**. `dotnet --version` должен показать версию `9.0.x`. Если установлено несколько SDK, версию для рабочего каталога можно закрепить в [`global.json`](https://learn.microsoft.com/en-us/dotnet/core/tools/global-json#version). [Шаблон `console`](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-new-sdk-templates#console) создаст проект с целевым фреймворком `net9.0`, для которого по умолчанию используется [C# 13](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-versioning#defaults).

```bash
dotnet --version
dotnet new console -n FeatureLab -f net9.0
cd FeatureLab
```
Замени содержимое `Program.cs` этим примером.
```csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        // Первый аргумент — заголовок, остальные образуют коллекцию HTTP-методов.
        PrintCounts("HTTP methods", "GET", "POST", "get", "PUT", "post", "GET");
        Console.WriteLine($"Sum = {Sum(10, 20, 30)}");
    }

    private static void PrintCounts(string title, params IEnumerable<string> values)
    {
        Console.WriteLine(title);
        var counts = values
            .CountBy(keySelector: method => method, keyComparer: StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(keySelector: pair => pair.Value);
        foreach (var (method, count) in counts)
            Console.WriteLine($"{method}: {count}");
    }

    private static int Sum(params ReadOnlySpan<int> values)
    {
        int total = 0;
        foreach (int value in values)
            total += value;
        return total;
    }
}
```
{: #snippet-full-program }
Запусти проект.
```bash
dotnet run
```
Ожидаемый вывод:
```text
HTTP methods
GET: 3
POST: 2
PUT: 1
Sum = 60
```
{: #output-full-program }

`PrintCounts` получает метки HTTP-методов отдельными аргументами и выводит частоты по убыванию. В итог `GET: 3` вошли две метки `GET` и одна `get`.

## 4. Напиши код сам · TASK-001 {#lesson-task}
**Условие.** Метод `GetTopMethods` принимает последовательность строковых меток HTTP-методов из выгрузки. Верни до трёх самых частых методов. Каждая пара `(Method, Count)` содержит метку и число её появлений. Считай `GET` и `get` одной меткой.

- Начни с самых частых методов. При равной частоте упорядочи метки по возрастанию без учёта регистра.
- Если разных методов меньше трёх, верни все. Для пустого входа верни пустую последовательность. Регистр меток в результате произвольный.
- Посчитай частоты через `CountBy`. Сравнивай метки с помощью `StringComparer.OrdinalIgnoreCase` при подсчёте и сортировке.

Для `["get", "POST", "GET", "put", "post", "DELETE", "delete", "GET"]` ожидаются `GET: 3`, `DELETE: 2`, `POST: 2` в этом порядке. Здесь имена записаны прописными буквами для наглядности.

<details><summary>Необязательная подсказка</summary><p>После <code>CountBy</code> используй <a href="https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.orderbydescending?view=net-9.0#system-linq-enumerable-orderbydescending-2(system-collections-generic-ienumerable((-0))-system-func((-0-1)))"><code>OrderByDescending</code></a> для основной сортировки, <a href="https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.thenby?view=net-9.0#system-linq-enumerable-thenby-2(system-linq-iorderedenumerable((-0))-system-func((-0-1))-system-collections-generic-icomparer((-1)))"><code>ThenBy</code></a> с <code>StringComparer.OrdinalIgnoreCase</code> для сравнения названий методов при одинаковом числе запросов и <a href="https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.take?view=net-9.0#system-linq-enumerable-take-1(system-collections-generic-ienumerable((-0))-system-int32)"><code>Take(int count)</code></a> для ограничения числа пар.</p></details>

~~~csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    // BEGIN TASK-001
    static IEnumerable<(string Method, int Count)> GetTopMethods(
        IEnumerable<string> methods)
    {
        // Из последовательности строковых меток верни до трёх самых частых HTTP-методов.
        // Для каждого верни пару (Method, Count) с меткой и числом её появлений.
        // GET и get считай одной меткой. Регистр в результате произвольный.
        // Начни с самых частых методов. При равной частоте упорядочи метки
        // по возрастанию без учёта регистра. Если разных методов меньше трёх, верни все.
        // Для пустого входа верни пустой результат.
        // Частоты посчитай через CountBy. Метки сравнивай через StringComparer.OrdinalIgnoreCase.

        throw new NotImplementedException();
    }
    // END TASK-001

    public static void Main()
    {
        string[] methods = ["get", "POST", "GET", "put", "post", "DELETE", "delete", "GET"];
        var actual = GetTopMethods(methods).ToArray();

        Assert(actual.Length == 3 && actual[0].Count == 3
            && string.Equals(actual[0].Method, "get", StringComparison.OrdinalIgnoreCase),
            actual.Length == 3
                ? $"Первым должен быть GET с частотой 3. Получено «{actual[0]}»."
                : $"Ожидались три HTTP-метода. Получено элементов {actual.Length}.");
        Assert(actual[1].Count == 2 && actual[2].Count == 2
            && string.Equals(actual[1].Method, "DELETE", StringComparison.OrdinalIgnoreCase)
            && string.Equals(actual[2].Method, "POST", StringComparison.OrdinalIgnoreCase),
            $"На втором и третьем местах ожидались DELETE (2) и POST (2). Получены «{actual[1]}» и «{actual[2]}».");

        Assert(!GetTopMethods(Array.Empty<string>()).Any(),
            "Для пустого ввода ожидался пустой результат. Метод вернул как минимум один элемент.");

        var mixed = GetTopMethods(["X", "x", "y"]).ToArray();
        Assert(mixed.Length == 2 && mixed[0].Count == 2 && mixed[1].Count == 1
            && string.Equals(mixed[0].Method, "X", StringComparison.OrdinalIgnoreCase)
            && string.Equals(mixed[1].Method, "y", StringComparison.OrdinalIgnoreCase),
            $"Ожидались X (2) и y (1) в этом порядке. Получено «{string.Join(", ", mixed)}».");

        var cutoff = GetTopMethods(
            ["TRACE", "get", "put", "post", "GET", "trace", "POST", "get", "PUT", "POST"]).ToArray();
        Assert(cutoff.Length == 3
            && cutoff[0].Count == 3 && cutoff[1].Count == 3 && cutoff[2].Count == 2
            && string.Equals(cutoff[0].Method, "GET", StringComparison.OrdinalIgnoreCase)
            && string.Equals(cutoff[1].Method, "POST", StringComparison.OrdinalIgnoreCase)
            && string.Equals(cutoff[2].Method, "PUT", StringComparison.OrdinalIgnoreCase),
            "Ожидались GET (3), POST (3) и PUT (2). При равной частоте PUT идёт раньше TRACE. "
            + $"Получено «{string.Join(", ", cutoff)}».");

        Console.WriteLine("Все проверки пройдены");
    }

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition) throw new InvalidOperationException("❌ TASK-001: " + failureMessage);
    }
}
~~~
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return Array.Empty<(string, int)>();
</script>

## 5. Что запомнить
- В C# 13 для параметра с модификатором `params` доступны и другие типы коллекций помимо массива, например `ReadOnlySpan<T>`.
- `CountBy` в .NET 9 непосредственно считает частоты по ключу.
- `StringComparer.OrdinalIgnoreCase` позволяет игнорировать регистр.

В [уроке № 2]({{ '/courses/csharp-dotnet-9-11/lessons/002-aggregateby-null-conditional-assignment/' | relative_url }}) вместо одного счётчика накопим количество запросов и суммарное время по каждому маршруту. В [первом уроке курса по памяти]({{ '/courses/memory/lessons/001-allocations-copies-retention/' | relative_url }}) разберём, как отличать выделение памяти от копирования значений и удержания объектов.

В [уроке №5]({{ '/courses/csharp-dotnet-9-11/lessons/005-dictionary-alternate-lookup/' | relative_url }}) передадим символьный срез в обобщённый поиск по словарю.
