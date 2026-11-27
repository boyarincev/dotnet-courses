---
lesson_number: 1
lesson_date: '21 ноября 2026'
title: 'Сводка оплаченных заказов: аллокации, копирование и удержание памяти'
summary: 'Учимся замечать, где C#-код создаёт объекты, копирует значения и удерживает данные в памяти.'
topic_id: 'ALLOC-001'
csharp_feature: 'C# · значения и ссылки'
dotnet_feature: '.NET · память и GC'
series: 'Модель памяти и измерения'
code_framework: net10.0
browser_runtime: '10'
browser_start_snippet: allocations-copies-retention
---
> **30 минут максимум.** Объяснение и пример — 8 минут, самостоятельная задача — 12 минут, проверка и повторение — около 10 минут.

## Зачем это нужно

При разборе проблем с памятью важно понимать, какие операции выделяют место, какие копируют значения и какие данные остаются доступны после завершения операции.

- Учёт **аллокаций** помогает найти код, который под нагрузкой создаёт много временных объектов.
- Понимание **копирования** помогает предсказать, изменится ли исходное значение структуры, если изменить значение, полученное из коллекции.
- Анализ **удержания памяти** помогает найти, какие ссылки сохраняют объекты после обработки запроса. Например, объекты могут оставаться достижимыми через кэш.

## Аллокации, копирование и удержание

- **Аллокация** — выделение места в памяти. Разбор ниже касается управляемой кучи. Память можно выделить и на стеке. Например, `Span<byte> buffer = stackalloc byte[16];` выделяет 16 байт на время выполнения метода. [Документация stackalloc](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/stackalloc)
- **Копирование** — запись существующего значения в другое место. Вызов `source.AsSpan().CopyTo(destination);` копирует байты из `source` в уже выделенный массив `destination`. Длина `destination` должна быть как минимум равна длине `source`. [Документация Span.CopyTo](https://learn.microsoft.com/en-us/dotnet/api/system.span-1.copyto?view=net-10.0)
- **Удержание памяти** связано с тем, какие ссылки мешают сборщику мусора (GC) освободить объект. Сборщик начинает обход с известных ему ссылок, например из статических полей. Такие ссылки называют корнями GC. Если от корня к объекту ведёт цепочка обычных (сильных) ссылок, объект остаётся достижимым. [Как GC определяет достижимость](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals#memory-release)

Выделение и копирование могут идти последовательно. Если перед `CopyTo` выполнить `byte[] destination = new byte[source.Length];`, сначала будет выделена память для массива, а затем в неё скопируются байты.

## Запускаемый пример

На вход поступают строки с номером заказа, статусом и суммой. Поля разделены `;`. Из строки `ORD-1042;paid;1499.90` программа извлекает номер `ORD-1042` и сумму `1499.90` и сохраняет их в списке оплаченных заказов. После разбора программа меняет сумму в копии первого заказа и снова выводит сумму из списка.

Создай консольный проект с **SDK .NET 10**. Для `net10.0` SDK по умолчанию [выбирает C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-versioning#defaults).

~~~bash
dotnet new console -n MemoryLab -f net10.0
cd MemoryLab
~~~

Полностью замени содержимое `Program.cs`:

~~~csharp
using System;
using System.Collections.Generic;
using System.Globalization;

public static class Program
{
    public static void Main()
    {
        string[] rows =
        [
            "ORD-1042;paid;1499.90",
            "ORD-1043;new;250.00",
            "ORD-1044;paid;80.00"
        ];

        List<Order> paid = ParsePaid(rows);
        Console.WriteLine($"Paid orders: {paid.Count}");
        // F2 выводит две цифры после десятичного разделителя. InvariantCulture задаёт точку.
        Console.WriteLine($"First amount: {paid[0].Amount.ToString(format: "F2", provider: CultureInfo.InvariantCulture)}");

        Order snapshot = paid[0];
        snapshot.Amount = 0m;
        Console.WriteLine($"After copy change: {paid[0].Amount.ToString(format: "F2", provider: CultureInfo.InvariantCulture)}");
    }

    private static List<Order> ParsePaid(IEnumerable<string> rows)
    {
        var result = new List<Order>();
        foreach (string row in rows)
        {
            // В этом формате поля разделены символом ';'.
            string[] fields = row.Split(separator: ';');
            if (fields.Length != 3 || fields[1] != "paid") continue;

            if (!decimal.TryParse(
                    // Третье поле содержит сумму заказа.
                    s: fields[2],
                    // Разрешаем пробелы по краям, знак, десятичный разделитель и разделитель групп разрядов.
                    style: NumberStyles.Number,
                    // InvariantCulture задаёт точку как десятичный разделитель.
                    provider: CultureInfo.InvariantCulture,
                    // При успехе разобранная сумма попадёт в amount.
                    result: out decimal amount))
            {
                continue;
            }

            result.Add(new Order(id: fields[0], amount: amount));
        }
        return result;
    }
}

internal struct Order
{
    public string Id;
    public decimal Amount;

    public Order(string id, decimal amount)
    {
        Id = id;
        Amount = amount;
    }
}
~~~
{: #snippet-allocations-copies-retention }

При разборе и выводе суммы `CultureInfo.InvariantCulture` [задаёт точку как десятичный разделитель](https://learn.microsoft.com/en-us/dotnet/api/system.globalization.numberformatinfo.numberdecimalseparator?view=net-10.0#property-value). В выводе `F2` [задаёт две цифры после десятичного разделителя](https://learn.microsoft.com/en-us/dotnet/standard/base-types/standard-numeric-format-strings#fixed-point-format-specifier-f).

Запусти программу командой `dotnet run` и сравни результат с ожидаемым.

~~~text
Paid orders: 2
First amount: 1499.90
After copy change: 1499.90
~~~
{: #output-allocations-copies-retention }

## Разберём три разных затраты

**Аллокации.** Для первой строки вызов `row.Split(';')` в .NET 10 выделяет массив `string[]` и три строки для отдельных полей ([аллокации при вызове String.Split](https://learn.microsoft.com/en-us/dotnet/api/system.string.split?view=net-10.0#performance-considerations)).

`new List<Order>()` [создаёт объект списка со ссылкой на общий пустой массив `Order[]`](https://github.com/dotnet/runtime/blob/60629d14374c56f1cb51819049ad1fa529307f8d/src/libraries/System.Private.CoreLib/src/System/Collections/Generic/List.cs#L29-L40). Первый `Add` [выделяет массив для элементов](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.list-1.add?view=net-10.0#remarks).

**Копирование.** Внутренний массив списка хранит [сами значения `Order` в элементах](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/structs#1682-value-semantics). Индексатор `paid[0]` возвращает первый элемент списка по значению ([индексатор `List<T>` в документации .NET 10](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.list-1.item?view=net-10.0#definition)).

При `Order snapshot = paid[0]` значение структуры копируется в локальную переменную без выделения отдельного объекта в управляемой куче. После `snapshot.Amount = 0m` сумма в копии равна `0m`. В элементе массива она остаётся `1499.90m`. При копировании `Id` копируется ссылка, поэтому [оба поля указывают на одну и ту же строку](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/value-types).

Схема показывает состояние после `snapshot.Amount = 0m`.

~~~text
Локальные переменные              Управляемая куча

paid --------------------------> List<Order>
                                      |
                                      v
                                 Order[] (массив списка)
                                   [0].Amount = 1499.90m
                                   [0].Id ------------+
                                                      +--> "ORD-1042"
snapshot.Amount = 0m                                  |
snapshot.Id ------------------------------------------+
~~~

**Удержание.** На схеме `paid` указывает на список, список — на массив, а поле `Id` в элементе массива — на строку. Пока эта цепочка существует и `paid` остаётся доступной, она удерживает строку. Если для результата нужны только число заказов и сумма, сохрани эти два значения вместо списка. `Split` по-прежнему создаст строки полей при разборе. Когда все достижимые ссылки на эти строки исчезнут, GC сможет освободить их память.

По одному примеру нельзя судить о выигрыше в производительности: на следующем занятии измерим варианты с BenchmarkDotNet.

## Напиши код сам · ALLOC-TASK-001 {#lesson-task}

**Задача на 12 минут.** Реализуй `SummarizePaid`: на входе — строки формата `ID;status;amount`. Верни количество записей со статусом `paid` и сумму их полей `amount` **без создания списка заказов**.

Сравнивай статус с `paid` с учётом регистра, как при [сравнении строк оператором `==`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/equality-operators#string-equality). При разбиении сохраняй пустые поля на их местах. Поле `ID` в подсчёте не используется, поэтому строка `;paid;4` тоже входит в сводку. Пропускай строки, если в них не ровно три поля или [`decimal.TryParse` с числовым форматом и культурой](<https://learn.microsoft.com/en-us/dotnet/api/system.decimal.tryparse?view=net-10.0#system-decimal-tryparse(system-string-system-globalization-numberstyles-system-iformatprovider-system-decimal@>) возвращает `false` при разборе суммы. Используй [`NumberStyles.Number`](https://learn.microsoft.com/en-us/dotnet/api/system.globalization.numberstyles?view=net-10.0#fields) и `CultureInfo.InvariantCulture`, как в примере. Для разбиения строки можно использовать [`Split(char separator, StringSplitOptions options)`](<https://learn.microsoft.com/en-us/dotnet/api/system.string.split?view=net-10.0#system-string-split(system-char-system-stringsplitoptions>). Не сохраняй промежуточные записи в коллекции.

**Входные данные**

~~~text
ORD-1042;paid;1499.90
ORD-1043;new;250.00
ORD-1044;paid;80.00
broken
ORD-1045;paid;not-a-number
ORD-1046;PAID;30.00
~~~

Для этих строк метод возвращает `(2, 1579.90m)`.

**Пограничный случай:** пустая последовательность должна вернуть `(0, 0m)`. Метод принимает `IEnumerable<string>` и проходит его только один раз.

<details><summary>Необязательная подсказка</summary><p>Достаточно двух локальных переменных: счётчика и суммы. Для каждой строки проверь длину массива полей, статус и результат TryParse. Подумай, какие данные после обработки не нужно сохранять.</p></details>

В `Program.cs` проверки `Assert` охватывают обычный, пустой и пограничный ввод, а также проверяют один проход по входным строкам. Отсутствие промежуточной коллекции проверяется при ревью кода.

~~~csharp
using System;
using System.Collections.Generic;
using System.Globalization;

public static class Program
{
    // BEGIN ALLOC-TASK-001
    static (int PaidCount, decimal Total) SummarizePaid(
        IEnumerable<string> rows)
    {
        // Реализуй SummarizePaid для строк формата "ID;status;amount".
        // За один проход посчитай записи со статусом "paid" с учётом регистра
        // и сложи их поля amount. Верни (PaidCount, Total).
        // Разбирай суммы через decimal.TryParse с NumberStyles.Number
        // и CultureInfo.InvariantCulture.
        // При разбиении учитывай пустые поля. Пропускай строку, если полей не три
        // или decimal.TryParse вернул false.
        // Разобранные записи не сохраняй в коллекции.

        throw new NotImplementedException();
    }
    // END ALLOC-TASK-001

    public static void Main()
    {
        string[] rows =
        [
            "ORD-1042;paid;1499.90", "ORD-1043;new;250.00",
            "ORD-1044;paid;80.00", "broken",
            "ORD-1045;paid;not-a-number", "ORD-1046;PAID;30.00"
        ];
        var summary = SummarizePaid(rows);
        Assert(summary.PaidCount == 2 && summary.Total == 1579.90m,
            FormattableString.Invariant(
                $"Ожидались два оплаченных заказа на сумму 1579.90. Получено ({summary.PaidCount}, {summary.Total})."));

        var empty = SummarizePaid(Array.Empty<string>());
        Assert(empty.PaidCount == 0 && empty.Total == 0m,
            FormattableString.Invariant(
                $"Для пустого ввода ожидалось (0, 0). Получено ({empty.PaidCount}, {empty.Total})."));

        var invalid = SummarizePaid(
            ["broken", "ORD-3;paid;not-a-number", "ORD-4;paid;4;extra", "ORD-8;paid;4;"]);
        Assert(invalid.PaidCount == 0 && invalid.Total == 0m,
            FormattableString.Invariant(
                $"Все строки некорректны, ожидалось (0, 0). Получено ({invalid.PaidCount}, {invalid.Total})."));

        int enumerations = 0;
        var previousCulture = CultureInfo.CurrentCulture;
        var commaCulture = (CultureInfo)CultureInfo.InvariantCulture.Clone();
        commaCulture.NumberFormat.NumberDecimalSeparator = ",";
        commaCulture.NumberFormat.NumberGroupSeparator = " ";

        (int PaidCount, decimal Total) mixed;
        try
        {
            CultureInfo.CurrentCulture = commaCulture;
            mixed = SummarizePaid(EnumerateRows());
        }
        finally
        {
            CultureInfo.CurrentCulture = previousCulture;
        }

        Assert(mixed.PaidCount == 2 && mixed.Total == 10.25m,
            FormattableString.Invariant(
                $"При локали с десятичной запятой ожидалось (2, 10.25). Получено ({mixed.PaidCount}, {mixed.Total})."));
        Assert(enumerations == 1,
            $"Ожидался один проход по исходной последовательности. Фактическое число проходов — {enumerations}.");

        Console.WriteLine("Все проверки пройдены");

        IEnumerable<string> EnumerateRows()
        {
            enumerations++;
            yield return "ORD-5;paid;-1,020.50";
            yield return "ORD-6;new;999.00";
            yield return "ORD-7;paid;1,030.75";
        }
    }

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition) throw new InvalidOperationException("❌ ALLOC-TASK-001: " + failureMessage);
    }
}
~~~
{: #practice-program }

<script type="text/plain" id="practice-wrong-body">
return (0, 0m);
</script>

## Что запомнить

Перед оптимизацией разберись, где метод выделяет память, какие значения копирует и какие объекты остаются достижимыми по ссылкам после вызова. Если вызывающему коду нужны только количество и сумма, в этом примере можно обойтись без списка заказов. Эффект изменения затем проверяем измерением.

**Связь с другим курсом:** в [уроке о `params ReadOnlySpan<T>` и `CountBy`]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы уже видели способ избежать некоторых временных массивов. Позже вернёмся к нему с измерениями.

**Следующий урок:** `ALLOC-002` — BenchmarkDotNet, `MemoryDiagnoser` и сравнение аллокаций.

**Официальная документация:** [типы значений](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/value-types), [GC и управление памятью](https://learn.microsoft.com/dotnet/standard/garbage-collection/fundamentals), [оптимизация C#](https://learn.microsoft.com/dotnet/csharp/advanced-topics/performance/).
