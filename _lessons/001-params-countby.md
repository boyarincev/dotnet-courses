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
Допустим, мы хотим анализировать HTTP-методы: удобно передавать их в метод и считать количество каждого значения, не создавая лишних групп.

## 1. C# 13: расширенный `params`
До C# 13 `params` поддерживал только одномерные массивы.
```csharp
static int Sum(params int[] numbers) => numbers.Sum();
Console.WriteLine(Sum(10, 20, 30)); // 60. Три числа образуют один массив numbers.
```
В C# 13 появились *params collections*: поддерживаются, в частности, `ReadOnlySpan<T>`, `Span<T>`, `IEnumerable<T>`, `List<T>` и другие коллекционные типы.
```csharp
static int Sum(params ReadOnlySpan<int> values)
{
    int total = 0;
    foreach (int value in values) total += value;
    return total;
}
Console.WriteLine(Sum(10, 20, 30)); // 60. Три числа образуют один ReadOnlySpan<int>.
```
**Почему полезно:** `ReadOnlySpan<T>` может избежать выделения отдельного массива в куче при некоторых вызовах. Однако не гарантирует нулевые аллокации во всех сценариях, а также имеет ограничения по времени жизни данных.

Новый `params` делает проще и такой API:
```csharp
static void Analyze(string title, params IEnumerable<string> methods)
{
    // В вызове Analyze("HTTP", "GET", "POST", "GET") "HTTP" — это title.
    // Три оставшихся аргумента образуют коллекцию methods.
}
```
## 2. .NET 9: `Enumerable.CountBy()`
Раньше для подсчёта частот часто использовали `GroupBy`:
```csharp
var counts = methods.GroupBy(keySelector: method => method)
    .Select(group => new { Method = group.Key, Count = group.Count() });
```
Теперь, если нужны **только счётчики**, можно написать:
```csharp
var counts = methods.CountBy(
    // Используем само имя HTTP-метода как ключ подсчёта.
    keySelector: method => method);
foreach (var (method, count) in counts)
    Console.WriteLine($"{method}: {count}");
```
Результат перечисления имеет тип `IEnumerable<KeyValuePair<TKey, int>>`, это **не** `Dictionary<TKey, int>`. Вычисление выполняется при перечислении.

По умолчанию `"GET"` и `"get"` различаются. Для объединения регистров:
```csharp
var counts = methods.CountBy(
    keySelector: method => method,
    // "GET" и "get" учитываются в одном счётчике.
    keyComparer: StringComparer.OrdinalIgnoreCase);
```
Если нужны сами группы элементов, `GroupBy` по-прежнему подходит лучше.

## 3. Полностью запускаемый пример
Для сборки нужен .NET 9 SDK или более новый SDK с поддержкой `net9.0`. Для запуска требуется среда выполнения .NET 9.
```bash
dotnet new console -n FeatureLab -f net9.0
cd FeatureLab
```
Содержимое `Program.cs`:
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
Запуск:
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
**Условие:** реализуй `GetTopMethods`, который принимает последовательность HTTP-методов и возвращает **три самых частых** с количествами. Сравнение без учёта регистра, при равной частоте сортировка по имени без учёта регистра.

**Критерии:** максимум три результата; пустая последовательность — пустой результат; `"GET"` и `"get"` считаются одним методом; при равных частотах порядок устойчивый и предсказуемый. Используй `CountBy`.

Проверка: `["get", "POST", "GET", "put", "post", "DELETE", "delete", "GET"]` → частоты `get: 3`, `DELETE: 2`, `POST: 2` (первое встретившееся написание ключа может сохраниться).

<details><summary>Необязательная подсказка</summary><p>После CountBy подумай о двух ключах сортировки и Take(3).</p></details>

**Проверка решения:** кнопка «Запустить и проверить Assert» откроет в браузерном редакторе полный `Program.cs`: твой метод, тестовые данные и видимые C#-проверки `Assert` на обычный, пустой и пограничный ввод. При ошибке увидишь нарушенное условие; готовое решение не показывается.

<script type="text/plain" id="practice-program-template">
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        string[] methods = ["get", "POST", "GET", "put", "post", "DELETE", "delete", "GET"];
        var actual = GetTopMethods(methods).ToArray();

        Assert(actual.Length == 3, "Вернуть три самых частых метода");
        Assert(actual[0].Count == 3
            && string.Equals(actual[0].Method, "get", StringComparison.OrdinalIgnoreCase),
            "Объединить GET и get: 3 обращения");
        Assert(actual[1].Count == 2 && actual[2].Count == 2
            && string.Equals(actual[1].Method, "DELETE", StringComparison.OrdinalIgnoreCase)
            && string.Equals(actual[2].Method, "POST", StringComparison.OrdinalIgnoreCase),
            "При равной частоте отсортировать методы по имени");

        Assert(!GetTopMethods(Array.Empty<string>()).Any(),
            "Пустой ввод возвращает пустой результат");

        var mixed = GetTopMethods(["X", "x", "y"]).ToArray();
        Assert(mixed.Length == 2 && mixed[0].Count == 2
            && string.Equals(mixed[0].Method, "x", StringComparison.OrdinalIgnoreCase),
            "Имена X и x считаются одним методом");

        var tie = GetTopMethods(["z", "A", "Z", "a"]).ToArray();
        Assert(tie.Length == 2 && tie[0].Count == 2 && tie[1].Count == 2
            && string.Equals(tie[0].Method, "a", StringComparison.OrdinalIgnoreCase),
            "При равной частоте имя A идёт перед Z");

        Console.WriteLine("Все проверки пройдены");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException("❌ TASK-001: " + message);
        Console.WriteLine("✓ " + message);
    }

    // BEGIN TASK-001
    // INSERT_SOLUTION_HERE
    // END TASK-001
}
</script>

<label for="solution-TASK-001" class="editor-label">Твой код:</label>
<textarea id="solution-TASK-001" class="code-editor" data-practice-id="TASK-001" spellcheck="false" rows="12">using System;
using System.Collections.Generic;
using System.Linq;

static IEnumerable&lt;(string Method, int Count)&gt; GetTopMethods(
    IEnumerable&lt;string&gt; methods)
{
    // Реализуй GetTopMethods для последовательности HTTP-методов.
    // Используй CountBy и считай частоты без учёта регистра.
    // Верни до трёх пар (Method, Count), отсортированных по частоте по убыванию.
    // При равной частоте сортируй по имени по возрастанию без учёта регистра.

    throw new NotImplementedException();
}</textarea>
<div class="practice-actions"><button type="button" class="button" data-copy-practice="TASK-001">Скопировать код</button> <button type="button" class="button" data-download-practice="TASK-001">Скачать .cs</button> <span class="practice-feedback" role="status"></span></div>
<p class="muted">Черновик сохраняется только в этом браузере. Для проверки пришли код в ChatGPT. Код запускается в браузерном компиляторе вместе с Assert. Прохождение тестов не заменяет проверку твоего решения в чате.</p>

## 5. Что запомнить
- C# 13 `params` может принимать коллекционные типы помимо массива, в том числе `ReadOnlySpan<T>`.
- `CountBy` в .NET 9 непосредственно считает частоты по ключу.
- `StringComparer.OrdinalIgnoreCase` позволяет игнорировать регистр.
- Выбирай нововведение по пользе, а не ради нового синтаксиса.

**Официально:** [C# 13: params collections](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-13#params-collections), [.NET 9: LINQ](https://learn.microsoft.com/dotnet/core/whats-new/dotnet-9/libraries#linq).
