---
lesson_number: 3
lesson_date: '24 ноября 2026'
title: 'Доступ по позиции: OrderedDictionary и расширяющие индексаторы'
summary: 'Сохраняем поиск по ключу и добавляем доступ к элементам упорядоченного словаря по позиции.'
csharp_feature: 'C# 15 · расширяющие индексаторы'
dotnet_feature: '.NET 9 · OrderedDictionary.GetAt'
series: 'Коллекции и LINQ'
code_framework: net11.0
browser_runtime: '11'
browser_start_snippet: full-program
---

## Зачем это нужно

На панели состояния сервисы показываются в заранее заданном порядке. В нашем примере сначала идёт `worker`, затем `gateway` и `metrics`. Счётчики ошибок собираются по интервалам. Для сводки сложим счётчики каждого сервиса за два интервала.

- По имени `gateway` получаем число ошибок этого сервиса — 5.
- По позиции первой строки получаем сразу имя и число ошибок — `worker` и 2.

`OrderedDictionary` позволяет выполнять оба запроса к одной коллекции. Если нужен только поиск по имени, достаточно обычного `Dictionary`.

## 1. .NET 9: ключ и позиция

`OrderedDictionary<TKey, TValue>` хранит пары в определённом порядке: `Add` добавляет пару в конец, а `Insert` помещает её на указанную позицию. Через `entries["gateway"]` получаем значение по ключу. `GetAt(int index)` принимает позицию с нуля и возвращает `KeyValuePair<TKey, TValue>`, из которой можно прочитать и ключ, и значение. Позиции относятся к текущему порядку коллекции. [Документация OrderedDictionary](https://learn.microsoft.com/dotnet/api/system.collections.generic.ordereddictionary-2?view=net-9.0), [документация GetAt](https://learn.microsoft.com/dotnet/api/system.collections.generic.ordereddictionary-2.getat?view=net-9.0)

```csharp
public KeyValuePair<TKey, TValue> GetAt(int index);
```

```csharp
var first = entries.GetAt(index: 0); // Первая пара в порядке словаря.
```

## 2. C# 14–15: блок `extension` и расширяющий индексатор

Блок `extension(OrderedDictionary<string, int> entries)` объявляем в статическом классе верхнего уровня без параметров типа. Блок задаёт расширяемый тип. `entries` обозначает словарь, с которым работают метод, свойство и индексатор. Оператор `+` получает оба словаря через параметры `left` и `right`.

В C# 14 в блоке `extension` можно объявлять методы, свойства и операторы расширения. В C# 15 добавились индексаторы. В программе ниже все четыре объявления работают с одним типом. [Справочник по блоку `extension`](https://learn.microsoft.com/dotnet/csharp/language-reference/keywords/extension)

| Член | Пример обращения | Результат |
| --- | --- | --- |
| Метод | `entries.ErrorsFor(service: "auth")` | Число ошибок сервиса `auth`. В первом интервале `auth` отсутствует, поэтому метод возвращает `0`. |
| Свойство | `entries.TotalErrors` | Сумма ошибок по всем сервисам за первый интервал — `8`. |
| Оператор | `entries + nextInterval` | Новый словарь со счётчиками за два интервала. Для `gateway` получаем `5 + 3 = 8`. |
| Индексатор | `entries[0]` | Первая пара словаря — `worker` и `2`. |

### Как работает доступ по позиции

Вызов `entries.GetAt(index: 0)` возвращает первую пару словаря. Расширяющий индексатор позволяет получить ту же пару через `entries[0]`. Параметр `position` в объявлении `this[int position]` получает число из квадратных скобок. Индексатор передаёт это число в `GetAt`.

Компилятор сначала ищет подходящий индексатор самого типа. Для `entries["gateway"]` подходит индексатор по строковому ключу, который возвращает `5`. Для `entries[0]` компилятор выбирает объявленный нами индексатор с параметром `int`. Если у словаря целочисленные ключи, индексатор самого словаря выбирается первым даже при наличии подходящего расширения. В таком случае `entries[0]` ищет ключ `0`, а `GetAt(index: 0)` возвращает первую пару. [Правила выбора индексатора](https://learn.microsoft.com/dotnet/csharp/language-reference/proposals/csharp-15.0/extension-indexers#indexer-access)

## Запусти пример

В браузере нажми «Запустить этот пример» под программой.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        var entries = new OrderedDictionary<string, int>
        {
            { "worker", 2 },
            { "gateway", 5 },
            { "metrics", 1 }
        };

        Console.WriteLine($"Ошибки gateway: {entries["gateway"]}");
        var first = entries[0];
        Console.WriteLine($"Первая строка: {first.Key} = {first.Value}");
        Console.WriteLine($"Ошибки auth за первый интервал: {entries.ErrorsFor(service: "auth")}");
        Console.WriteLine($"Всего ошибок за первый интервал: {entries.TotalErrors}");

        var nextInterval = new OrderedDictionary<string, int>
        {
            { "gateway", 3 },
            { "auth", 4 }
        };
        var combined = entries + nextInterval;
        Console.WriteLine($"За два интервала: gateway={combined["gateway"]}, auth={combined["auth"]}");
    }
}

public static class ServiceBoardExtensions
{
    extension(OrderedDictionary<string, int> entries)
    {
        // Для сервиса, которого нет в словаре, возвращаем ноль.
        public int ErrorsFor(string service) =>
            entries.TryGetValue(service, out var errors) ? errors : 0;

        public int TotalErrors => entries.Values.Sum();

        // position — номер строки с нуля в текущем порядке словаря.
        public KeyValuePair<string, int> this[int position] =>
            entries.GetAt(index: position);

        public static OrderedDictionary<string, int> operator +(
            OrderedDictionary<string, int> left,
            OrderedDictionary<string, int> right)
        {
            // Начинаем с копии первого словаря и используем то же сравнение ключей.
            var combined = new OrderedDictionary<string, int>(
                dictionary: left,
                comparer: left.Comparer);

            foreach (var (service, errors) in right)
            {
                // Для нового сервиса ErrorsFor возвращает ноль.
                combined[service] = combined.ErrorsFor(service) + errors;
            }

            return combined;
        }
    }
}
```
{: #snippet-full-program }

Ожидаемый вывод:

```text
Ошибки gateway: 5
Первая строка: worker = 2
Ошибки auth за первый интервал: 0
Всего ошибок за первый интервал: 8
За два интервала: gateway=8, auth=4
```
{: #output-full-program }

Для локального запуска используй [.NET 11 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/11.0) версии `11.0.100` или новее. Проект с `net11.0` [по умолчанию использует C# 15](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-15).

```sh
dotnet new console -f net11.0 -o ServiceBoard
cd ServiceBoard
```

Замени содержимое `Program.cs` примером и выполни `dotnet run`.

## Напиши код сам · TASK-003 {#lesson-task}

Параметр индексатора в этом задании имеет тип `Index`. Для непустого словаря `^1` указывает на последнюю пару, а `^0` — на позицию сразу за ней. `Index middle = 1` задаёт позицию 1 с начала, то есть вторую пару, если в словаре есть хотя бы две пары. [Спецификация System.Index](https://learn.microsoft.com/dotnet/csharp/language-reference/language-specification/ranges#182-the-index-type)

Реализуй расширяющий индексатор с параметром `Index` для `OrderedDictionary<string, int>`. Он должен вернуть пару «имя сервиса, число ошибок» на указанной позиции. Поддержи позиции с начала и с конца и получай пару через `GetAt`. Сохрани обычный поиск по строковому ключу. При недопустимой позиции, в том числе при `^0` и при `^1` на пустом словаре, ожидается `ArgumentOutOfRangeException`.

В браузере нажми «Открыть заготовку», допиши тело индексатора и нажми «Запустить текущий код». Для локальной проверки скопируй заготовку в `Program.cs` проекта `ServiceBoard`, внеси правку и выполни `dotnet run`. После прохождения всех `Assert` программа выведет «Все проверки пройдены».

```csharp
using System;
using System.Collections.Generic;

public static class ServiceBoardExtensions
{
    extension(OrderedDictionary<string, int> entries)
    {
        // BEGIN TASK-003
        public KeyValuePair<string, int> this[Index position]
        {
            get
            {
                // Для словаря с именами сервисов и числом ошибок верни пару
                // на position через GetAt. Поддержи индексы с начала и с конца.
                // Недопустимая позиция должна приводить к ArgumentOutOfRangeException.
                throw new NotImplementedException();
            }
        }
        // END TASK-003
    }
}

public static class Program
{
    public static void Main()
    {
        var entries = new OrderedDictionary<string, int>
        {
            { "worker", 2 },
            { "gateway", 5 },
            { "auth", 7 }
        };

        var gatewayErrors = entries["gateway"];
        Assert(gatewayErrors == 5,
            $"Неверное значение по ключу gateway. Ожидалось 5, получено {gatewayErrors}.");

        Index middle = 1;
        var second = entries[middle];
        Assert(second is { Key: "gateway", Value: 5 },
            $"Неверная пара на позиции 1. Ожидалось gateway=5, получено {second.Key}={second.Value}.");

        var last = entries[^1];
        Assert(last is { Key: "auth", Value: 7 },
            $"Неверная последняя пара. Ожидалось auth=7, получено {last.Key}={last.Value}.");

        var penultimate = entries[^2];
        Assert(penultimate is { Key: "gateway", Value: 5 },
            $"Неверная предпоследняя пара. Ожидалось gateway=5, получено {penultimate.Key}={penultimate.Value}.");

        Assert(ThrowsOutOfRange(() => { _ = entries[^0]; }),
            "Индекс ^0 на заполненном словаре не вызвал ArgumentOutOfRangeException.");

        var empty = new OrderedDictionary<string, int>();
        Assert(ThrowsOutOfRange(() => { _ = empty[^1]; }),
            "Индекс ^1 на пустом словаре не вызвал ArgumentOutOfRangeException.");

        Console.WriteLine("Все проверки пройдены");
    }

    private static bool ThrowsOutOfRange(Action read)
    {
        try
        {
            read();
            return false;
        }
        catch (ArgumentOutOfRangeException)
        {
            return true;
        }
    }

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition)
            throw new InvalidOperationException("❌ TASK-003: " + failureMessage);
    }
}
```
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return entries.GetAt(index: position.Value);
</script>

<details>
<summary>Подсказка</summary>
<p><code>GetAt</code> принимает позицию с начала. Посмотри, как <a href="https://learn.microsoft.com/dotnet/api/system.index.getoffset?view=net-9.0"><code>Index.GetOffset(int length)</code></a> переводит индекс с конца в позицию с начала. Подумай, какую длину передать методу.</p>
</details>

На повторении раздели три случая: доступ по строковому ключу, доступ по позиции с начала и доступ относительно конца. Для каждого назови тип результата.

В [уроке №4]({{ '/courses/csharp-dotnet-9-11/lessons/004-closed-hierarchies-leftjoin/' | relative_url }}) сохраним порядок каталога сервисов, когда добавим к нему результаты проверок.
