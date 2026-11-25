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

На панели состояния сервисы показываются в заранее заданном порядке. В нашем примере сначала идёт `worker`, затем `gateway` и `metrics`.

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

## 2. C# 15: расширяющий индексатор

Расширяющий индексатор добавляет возможность обращаться к упорядоченному словарю по позиции через квадратные скобки. В примере со строковыми ключами `entries[0]` работает так же, как `entries.GetAt(index: 0)`, и возвращает первую пару — `worker` и `2`. По ключу `gateway` выражение `entries["gateway"]` возвращает число ошибок `5`.

Расширяющий индексатор объявляем в блоке `extension` внутри отдельного статического класса. Параметр `entries` в объявлении блока обозначает экземпляр словаря слева от квадратных скобок. Параметр `position` в объявлении `this[int position]` получает число из скобок. Индексатор передаёт это число в `GetAt`.

Компилятор сначала ищет подходящий индексатор самого типа. Поэтому у словаря с ключами `int` выражение `entries[0]` обращается к словарю по ключу `0`. Для доступа по позиции в таком словаре используй `GetAt`. [Расширяющие индексаторы в C# 15](https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-15#extension-indexers)

Для доступа относительно конца C# использует `System.Index`. В выражении `^1` единица означает «одна позиция от конца», то есть последний элемент. `^0` обозначает позицию сразу после последнего элемента. `Index.GetOffset(length)` переводит индекс в позицию с начала: при длине 3 индекс `^1` даёт 2. Метод вычисляет позицию, а её допустимость для словаря проверяет `GetAt`. [Индексы с конца](https://learn.microsoft.com/dotnet/csharp/tutorials/ranges-indexes), [Сигнатура Index.GetOffset(int length)](https://learn.microsoft.com/dotnet/api/system.index.getoffset?view=net-9.0)

## Запусти пример

В браузере нажми «Запустить этот пример» под программой.

```csharp
using System;
using System.Collections.Generic;

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
    }
}

public static class ServiceBoardExtensions
{
    extension(OrderedDictionary<string, int> entries)
    {
        // position — номер строки с нуля в текущем порядке словаря.
        public KeyValuePair<string, int> this[int position] =>
            entries.GetAt(index: position);
    }
}
```
{: #snippet-full-program }

Ожидаемый вывод:

```text
Ошибки gateway: 5
Первая строка: worker = 2
```
{: #output-full-program }

Для локального запуска используй [.NET 11 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/11.0) версии `11.0.100` или новее. Проект с `net11.0` [по умолчанию использует C# 15](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-15).

```sh
dotnet new console -f net11.0 -o ServiceBoard
cd ServiceBoard
```

Замени содержимое `Program.cs` примером и выполни `dotnet run`.

## Напиши код сам · TASK-003 {#lesson-task}

В задании объявим индексатор, который получает `Index` напрямую. `Index middle = 1` задаёт позицию с начала, а `^1` — позицию с конца. [Спецификация System.Index](https://learn.microsoft.com/dotnet/csharp/language-reference/language-specification/ranges#182-the-index-type)

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
<p>Свяжи три величины: индекс из квадратных скобок, количество элементов в словаре и позицию с начала, которую принимает GetAt.</p>
</details>

На повторении раздели три случая: доступ по строковому ключу, доступ по позиции с начала и доступ относительно конца. Для каждого назови тип результата.

В [уроке №4]({{ '/courses/csharp-dotnet-9-11/lessons/004-closed-hierarchies-leftjoin/' | relative_url }}) сохраним порядок каталога сервисов, когда добавим к нему результаты проверок.
