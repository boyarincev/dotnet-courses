---
lesson_number: 5
lesson_date: '26 ноября 2026'
title: 'Поиск маршрута по срезу строки: allows ref struct и Dictionary.GetAlternateLookup'
summary: 'Находим лимит для HTTP-маршрута по срезу строки запроса и переносим поиск в обобщённый метод.'
csharp_feature: 'C# 13 · allows ref struct'
dotnet_feature: '.NET 9 · Dictionary.GetAlternateLookup'
series: 'Коллекции и LINQ'
code_framework: net9.0
browser_runtime: '9'
browser_start_snippet: full-program
---

## Зачем это нужно

При разборе журналов и входных сообщений часто извлекают идентификаторы и ищут их в словаре со строковыми ключами. Если идентификатор уже представлен срезом `ReadOnlySpan<char>`, `GetAlternateLookup` позволяет выполнить поиск без создания временной строки. Для этого нужен компаратор, который поддерживает сравнение среза со строкой. Для готового строкового ключа достаточно `Dictionary.TryGetValue`.

Например, одну обобщённую обёртку для замера времени можно использовать с парсером строк и с парсером срезов. `allows ref struct` позволяет такому обобщённому методу принимать и `ReadOnlySpan<char>`.

## 1. Что передаём в словарь

В примере словарь хранит лимит `120` для `/orders` и сравнивает ключи без учёта регистра. Путь для поиска берём из строки запроса `GET /ORDERS HTTP/1.1`.

В [уроке №1]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы передавали в метод `ReadOnlySpan<int>`. Здесь `ReadOnlySpan<char>` указывает на символы внутри исходной строки. В `line.AsSpan(start: 4, length: 7)` отсчёт начинается с нуля. Позиция 4 указывает на `/`, а длина 7 захватывает `/ORDERS` целиком. [Перегрузка AsSpan с начальной позицией и длиной](<https://learn.microsoft.com/en-us/dotnet/api/system.memoryextensions.asspan?view=net-9.0#system-memoryextensions-asspan(system-string-system-int32-system-int32)>)

## 2. .NET 9 и C# 13 · Поиск по ключу другого типа

Метод `Dictionary<TKey, TValue>.GetAlternateLookup<TAlternateKey>()` возвращает структуру `AlternateLookup<TAlternateKey>`. Через неё можно искать в том же словаре. `TKey` — тип хранимых ключей, в примере это `string`. `TAlternateKey` — тип ключа, который передаём при поиске, в примере это `ReadOnlySpan<char>`. [Сигнатуры в .NET 9](https://github.com/dotnet/runtime/blob/v9.0.0/src/libraries/System.Collections/ref/System.Collections.cs#L673-L704)

~~~csharp
public AlternateLookup<TAlternateKey> GetAlternateLookup<TAlternateKey>()
    where TAlternateKey : notnull, allows ref struct;

// Метод возвращённого AlternateLookup<TAlternateKey>.
public bool TryGetValue(TAlternateKey key, out TValue value);
~~~

`TryGetValue` возвращает `true`, если ключ найден, и записывает значение в `value`. При отсутствии ключа получаем `false` и значение по умолчанию, для `int` это `0`. Значение `0` само по себе не сообщает, был ли ключ найден. [Документация TryGetValue](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.alternatelookup-1.trygetvalue?view=net-9.0)

Для поиска по срезу компаратор словаря должен уметь сравнивать срез со строковым ключом. `StringComparer.OrdinalIgnoreCase` поддерживает `ReadOnlySpan<char>` и сравнивает без учёта регистра. При несовместимом компараторе вызов `GetAlternateLookup` выбросит `InvalidOperationException`. Если совместимость заранее неизвестна, её можно проверить через `TryGetAlternateLookup`. [Поиск по срезу в .NET 9](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-9/libraries#collection-lookups-with-spans) · [Исключения GetAlternateLookup](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.getalternatelookup?view=net-9.0#exceptions) · [Документация TryGetAlternateLookup](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.trygetalternatelookup?view=net-9.0)

По умолчанию `ref struct` нельзя подставить вместо обобщённого параметра типа. `allows ref struct` разрешает подставить такой тип, в том числе `ReadOnlySpan<char>`. Правила безопасности такого значения продолжают действовать. Например, его нельзя упаковать в `object`. В своём обобщённом методе повторим `where TAlternateKey : notnull, allows ref struct`, чтобы передать параметр в `GetAlternateLookup`. `notnull` указывает, что ожидается тип ключа, который не допускает `null`. `allows ref struct` ставится последним. [Ограничения параметров типа](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/constraints-on-type-parameters#allows-ref-struct)

## Запусти пример

В программе два поиска. Для `/ORDERS` ожидаем лимит 120, а ключа `/status` в словаре нет.

Нажми «Запустить этот пример» под программой. Для локального запуска нужен SDK .NET 9. Проект `net9.0` по умолчанию использует C# 13. [Версии языка по умолчанию](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-versioning#defaults)

~~~sh
dotnet new console -f net9.0 -o RouteLookup
cd RouteLookup
~~~

Замени `Program.cs` программой ниже и выполни `dotnet run`.

~~~csharp
using System;
using System.Collections.Generic;

string line = "GET /ORDERS HTTP/1.1";
ReadOnlySpan<char> route = line.AsSpan(start: 4, length: 7);

var limits = new Dictionary<string, int>(comparer: StringComparer.OrdinalIgnoreCase)
{
    ["/orders"] = 120
};

// При вызове со срезом компилятор выводит TAlternateKey как ReadOnlySpan<char>.
bool found = TryReadRoute(limits, route, out int limit);

Console.WriteLine($"Маршрут найден: {found}");
Console.WriteLine($"Лимит: {limit}");

ReadOnlySpan<char> unknown = "/status";
bool unknownFound = TryReadRoute(limits, unknown, out int unknownLimit);
Console.WriteLine($"Поиск /status: {unknownFound}, лимит {unknownLimit}");

static bool TryReadRoute<TAlternateKey>(
    Dictionary<string, int> limits, TAlternateKey route, out int limit)
    where TAlternateKey : notnull, allows ref struct
{
    var lookup = limits.GetAlternateLookup<TAlternateKey>();
    return lookup.TryGetValue(key: route, out limit);
}
~~~
{: #snippet-full-program }

Ожидаемый вывод

~~~text
Маршрут найден: True
Лимит: 120
Поиск /status: False, лимит 0
~~~
{: #output-full-program }

## Напиши код сам · TASK-005 {#lesson-task}

У тебя есть словарь лимитов и два ключа для одного запроса — маршрут и резервный маршрут. Реализуй `TryReadLimit` примерно за 10–12 минут. Сигнатура уже поддерживает обобщённый `TAlternateKey`, а первый ключ для проверки получен из среза строки.

- Сначала ищи `route`. Если он найден, верни `true` и его лимит через `limit`. Нулевой лимит тоже считается найденным.
- Если `route` отсутствует, ищи `fallback`. При совпадении верни `true` и его лимит.
- Если в словаре нет ни одного из ключей, верни `false` и установи `limit` в `0`.

Используй `GetAlternateLookup<TAlternateKey>()` и показанный выше `TryGetValue`. Правила сравнения задаёт готовый словарь. Его компаратор в каждом тесте поддерживает переданный тип ключа. Открой заготовку, заполни метод и нажми «Запустить текущий код». Для локальной проверки скопируй заготовку в `RouteLookup/Program.cs` и выполни `dotnet run` в каталоге проекта.

~~~csharp
using System;
using System.Collections.Generic;

public static class Program
{
    // BEGIN TASK-005
    static bool TryReadLimit<TAlternateKey>(
        Dictionary<string, int> limits, TAlternateKey route, TAlternateKey fallback, out int limit)
        where TAlternateKey : notnull, allows ref struct
    {
        // Найди лимит по route через GetAlternateLookup и TryGetValue.
        // Компаратор словаря совместим с типом ключа.
        // Ищи fallback только при отсутствии route. Нулевой лимит считается найденным.
        // Верни true и найденный лимит. Если оба ключа отсутствуют, верни false и 0.
        throw new NotImplementedException();
    }
    // END TASK-005

    public static void Main()
    {
        var limits = new Dictionary<string, int>(comparer: StringComparer.OrdinalIgnoreCase)
        {
            ["/orders"] = 120,
            ["/health"] = 0
        };

        ReadOnlySpan<char> orders = "GET /ORDERS HTTP/1.1".AsSpan(start: 4, length: 7);
        ReadOnlySpan<char> health = "/HEALTH";
        ReadOnlySpan<char> missing = "/unknown";

        Check(limits, orders, health, expectedFound: true, expectedLimit: 120, context: "основной маршрут в другом регистре");
        Check(limits, missing, orders, expectedFound: true, expectedLimit: 120, context: "найден только резервный маршрут");
        Check(limits, health, orders, expectedFound: true, expectedLimit: 0, context: "найден основной маршрут с нулевым лимитом");
        var caseSensitive = new Dictionary<string, int>(comparer: StringComparer.Ordinal)
        {
            ["/orders"] = 120
        };
        Check(caseSensitive, orders, ReadOnlySpan<char>.Empty,
            expectedFound: false, expectedLimit: 0, context: "словарь с учётом регистра и пустой резервный ключ");

        var empty = new Dictionary<string, int>(comparer: StringComparer.OrdinalIgnoreCase);
        Check(empty, orders, health, expectedFound: false, expectedLimit: 0, context: "пустой словарь");

        Console.WriteLine("Все проверки пройдены");
    }

    static void Check(
        Dictionary<string, int> limits, ReadOnlySpan<char> route, ReadOnlySpan<char> fallback,
        bool expectedFound, int expectedLimit, string context)
    {
        bool found = TryReadLimit(limits, route, fallback, out int limit);
        Assert(found == expectedFound && limit == expectedLimit,
            $"{context}. Ожидалось ({expectedFound}, {expectedLimit}), получено ({found}, {limit}).");
    }

    static void Assert(bool condition, string failureMessage)
    {
        if (!condition)
            throw new InvalidOperationException("❌ TASK-005: " + failureMessage);
    }
}
~~~
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return limits.GetAlternateLookup<TAlternateKey>().TryGetValue(route, out limit);
</script>

<details><summary>Подсказка</summary><p>Выбирай, переходить ли к резервному ключу, по значению <code>bool</code> от первого поиска.</p></details>

`allows ref struct` допускает срез в обобщённом методе. `GetAlternateLookup` ищет по срезу с правилами сравнения исходного словаря.

На повторении объясни, какой тип ключа хранится в словаре и какой тип ключа принимает поиск. Затем придумай вход, на котором проверка `limit != 0` вместо результата `TryGetValue` меняет поведение программы.
