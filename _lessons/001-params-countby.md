---
lesson_number: 1
lesson_date: '20 ноября 2026'
title: 'Коллекции без лишней работы: params и CountBy'
summary: 'Принимаем произвольное число аргументов и считаем частоты элементов на одном практическом примере.'
csharp_feature: 'C# 13 · params collections'
dotnet_feature: '.NET 9 · CountBy'
series: 'Коллекции и LINQ'
browser_runtime: '9'
---
> **Браузерный запуск включён.** Под каждым C#-примером доступна кнопка запуска, а ниже находится общий редактор с Roslyn.

## Зачем это нужно
Посчитаем, сколько раз встречается каждый HTTP-метод в учебной выгрузке. Метки `GET` и `get` здесь считаем одной категорией.

## 1. C# 13: расширенный `params`
До C# 13 тип параметра `params` ограничивался [одномерным массивом `T[]`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/method-parameters#params-modifier).
```csharp
static int Sum(params int[] numbers) => numbers.Sum();
Console.WriteLine(Sum(10, 20, 30)); // 60. Три числа образуют один массив numbers.
```
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
Для вызова `Sum(10, 20, 30)` с `ReadOnlySpan<int>` компилятор из .NET 9 SDK [сохраняет константы в данных сборки](https://github.com/dotnet/roslyn/blob/f3348c2a2be16ec6525cb3df7be12952c3e2de9d/src/Compilers/CSharp/Portable/CodeGen/EmitArrayInitializer.cs#L606-L623). На .NET 9 x64 `ReadOnlySpan<int>` [ссылается на эти данные](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/RuntimeHelpers.cs#L148-L149), поэтому вызов обходится без выделения массива для аргументов. Элементы удобно обработать сразу в `foreach`. Сам параметр [нельзя захватить в лямбде](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/ref-struct).

Заголовок можно передать отдельным аргументом, а метки собрать в `IEnumerable<string>`.

```csharp
// "HTTP" — заголовок. Оставшиеся три аргумента образуют коллекцию methods.
Analyze("HTTP", "GET", "POST", "GET"); // HTTP: 3

static void Analyze(string title, params IEnumerable<string> methods)
{
    Console.WriteLine($"{title}: {methods.Count()}");
}
```

## 2. .NET 9: `Enumerable.CountBy()`
[`GroupBy`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.groupby?view=net-9.0) собирает строки с одинаковым ключом. Из каждой группы `Select` берёт ключ и число элементов.
```csharp
var counts = methods.GroupBy(keySelector: method => method)
    .Select(group => new { Method = group.Key, Count = group.Count() });
```
Если нужны **только счётчики**, [`CountBy` в .NET 9](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#linq) вычисляет их без промежуточных групп строк.
```csharp
var counts = methods.CountBy(
    // Используем само имя HTTP-метода как ключ подсчёта.
    keySelector: method => method);
foreach (var (method, count) in counts)
    Console.WriteLine($"{method}: {count}");
```
Вызов возвращает [`IEnumerable<KeyValuePair<TKey, int>>`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.countby?view=net-9.0#returns). Каждый элемент — пара из ключа и количества его вхождений. В .NET 9 [подсчёт начинается при перечислении](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Linq/src/System/Linq/CountBy.cs#L27-L62). Перед выдачей первой пары `CountBy` читает весь источник и накапливает счётчики по ключам.

При сравнении строк по умолчанию `"GET"` и `"get"` дают два ключа ([тесты `CountBy` в .NET 9](https://github.com/dotnet/runtime/blob/9d5a6a9aa463d6d10b0b0ba6d5982cc82f363dc3/src/libraries/System.Linq/tests/CountByTests.cs#L93-L113)). Для нашей выгрузки передадим [`StringComparer.OrdinalIgnoreCase`](https://learn.microsoft.com/en-us/dotnet/api/system.stringcomparer.ordinalignorecase?view=net-9.0), который сравнивает метки без учёта регистра.
```csharp
var counts = methods.CountBy(
    keySelector: method => method,
    // "GET" и "get" учитываются в одном счётчике.
    keyComparer: StringComparer.OrdinalIgnoreCase);
```
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

// Первый аргумент — заголовок, остальные образуют коллекцию HTTP-методов.
PrintCounts("HTTP methods", "GET", "POST", "get", "PUT", "post", "GET");
Console.WriteLine($"Sum = {Sum(10, 20, 30)}");

static void PrintCounts(string title, params IEnumerable<string> values)
{
    Console.WriteLine(title);
    var counts = values
        .CountBy(keySelector: method => method, keyComparer: StringComparer.OrdinalIgnoreCase)
        .OrderByDescending(keySelector: pair => pair.Value);
    foreach (var (method, count) in counts)
        Console.WriteLine($"{method}: {count}");
}

static int Sum(params ReadOnlySpan<int> values)
{
    int total = 0;
    foreach (int value in values) total += value;
    return total;
}
```
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

## 4. Напиши код сам · TASK-001
**Условие.** Реализуй `GetTopMethods`. Метод принимает последовательность меток из той же выгрузки и возвращает до трёх пар `(Method, Count)`. `Count` — число вхождений метки с учётом правила сравнения.

- Подсчитай вхождения через `CountBy` с `StringComparer.OrdinalIgnoreCase`.
- Отсортируй по убыванию `Count`. При равных частотах отсортируй `Method` по возрастанию с тем же `StringComparer.OrdinalIgnoreCase`.
- Верни первые три пары или все пары, если их меньше трёх. Для пустого входа верни пустую последовательность. Регистр букв в возвращаемых именах произвольный.

Для `["get", "POST", "GET", "put", "post", "DELETE", "delete", "GET"]` ожидаются `GET: 3`, `DELETE: 2`, `POST: 2` в этом порядке. Здесь имена записаны прописными буквами для наглядности.

<details><summary>Необязательная подсказка</summary><p>После CountBy подумай о двух ключах сортировки и Take(3).</p></details>

**Проверка решения:** открой `Program.cs` кнопкой «Открыть заготовку». Если черновик уже сохранён, кнопка называется «Открыть черновик». В файле есть метод, тестовые данные и видимые C#-проверки `Assert` на обычный, пустой и пограничный ввод. При ошибке в выводе будет указано нарушенное условие.

<script type="text/plain" id="practice-program-template">
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    // BEGIN TASK-001
    // INSERT_SOLUTION_HERE
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
</script>

<label for="solution-TASK-001" class="editor-label">Заготовка задания</label>
<textarea id="solution-TASK-001" class="code-editor" readonly spellcheck="false" rows="12">using System;
using System.Collections.Generic;
using System.Linq;

static IEnumerable&lt;(string Method, int Count)&gt; GetTopMethods(
    IEnumerable&lt;string&gt; methods)
{
    // Вход — последовательность меток HTTP-методов из выгрузки.
    // Используй CountBy с StringComparer.OrdinalIgnoreCase для подсчёта вхождений.
    // Верни до трёх пар (Method, Count) по убыванию Count.
    // При равных Count сортируй Method по возрастанию с StringComparer.OrdinalIgnoreCase.
    // Регистр имён произвольный. Пустой вход даёт пустой результат.

    throw new NotImplementedException();
}</textarea>
<div class="practice-actions" data-practice-actions="TASK-001"><span class="practice-feedback" role="status"></span></div>
<p class="muted">Кнопка открывает код в редакторе без запуска. Напиши решение в редакторе и нажми «Запустить текущий код». При переходе к примеру черновик сохраняется в этом браузере. После успешного запуска с исходными проверками твой код появится в блоке «Последнее успешное решение».</p>

## 5. Что запомнить
- C# 13 `params` может принимать коллекционные типы помимо массива, в том числе `ReadOnlySpan<T>`.
- `CountBy` в .NET 9 непосредственно считает частоты по ключу.
- `StringComparer.OrdinalIgnoreCase` позволяет игнорировать регистр.

В [уроке № 2]({{ '/courses/csharp-dotnet-9-11/lessons/002-aggregateby-null-conditional-assignment/' | relative_url }}) вместо одного счётчика накопим количество запросов и суммарное время по каждому маршруту. В [первом уроке курса по памяти]({{ '/courses/memory/lessons/001-allocations-copies-retention/' | relative_url }}) разберём, как отличать выделение памяти от копирования значений и удержания объектов.
