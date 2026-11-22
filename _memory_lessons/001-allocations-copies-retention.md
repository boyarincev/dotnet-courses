---
lesson_number: 1
lesson_date: '21 ноября 2026'
title: 'Аллокации, копирование и удержание памяти'
summary: 'Учимся замечать, где C#-код создаёт объекты, копирует значения и удерживает данные в памяти.'
topic_id: 'ALLOC-001'
csharp_feature: 'C# · значения и ссылки'
dotnet_feature: '.NET · память и GC'
series: 'Модель памяти и измерения'
browser_runtime: '10'
---
> **30 минут максимум.** Объяснение и пример — 8 минут, самостоятельная задача — 12 минут, проверка и повторение — около 10 минут. Пока не нужно оптимизировать весь код.

## Зачем это нужно

В рабочем сервисе встречаются строки импорта вида `ORD-1042;paid;1499.90`. Допустим, сервис обрабатывает тысячи таких строк. Чтобы оценить цену реализации, важно различать **три вида работы**:

- **Аллокация** — выделение места в памяти. В этом уроке разбираем выделения в управляемой куче: например, `Split` в нашем примере создаёт массив и строки с полями. Память можно выделить и на стеке. Например, `Span<byte> buffer = stackalloc byte[16];` выделяет 16 байт на время выполнения метода. [Документация по `stackalloc`](https://learn.microsoft.com/dotnet/csharp/language-reference/operators/stackalloc).
- **Копирование** — запись уже существующего значения в другое место. Если место уже есть, новое выделение не нужно. Например, `source.AsSpan().CopyTo(destination);` копирует байты из массива `source` в уже выделенный массив `destination`. В массиве назначения должно быть достаточно места. [Документация по `CopyTo`](https://learn.microsoft.com/en-us/dotnet/api/system.span-1.copyto?view=net-6.0). В примере ниже `Order snapshot = paid[0]` копирует значение структуры из списка в локальную переменную без создания отдельного объекта в управляемой куче.
- **Удержание** — данные остаются достижимыми через ссылки и поэтому продолжают занимать память. Пример: сохранённый надолго `List<Order>`.

Выделение и копирование могут встретиться вместе. Строка `byte[] destination = new byte[source.Length];` создаёт массив. Следующая строка, `source.AsSpan().CopyTo(destination);`, записывает в него байты из исходного массива.

Место хранения структуры зависит от того, где она используется. Если массив структур размещён в управляемой куче, его элементы хранятся прямо внутри массива. [Документация о типах значений](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/value-types).

## Запускаемый пример

Нужен **.NET 10 SDK**. Создай консольный проект:

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
        // F2 показывает две цифры после точки. InvariantCulture сохраняет точку при любой локали.
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
                    // Разрешаем пробелы по краям, знак, десятичный разделитель и разделитель групп.
                    style: NumberStyles.Number,
                    // Разбираем точку как десятичный разделитель при любой локали.
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

Запуск: `dotnet run`. Ожидаемый вывод:

~~~text
Paid orders: 2
First amount: 1499.90
After copy change: 1499.90
~~~

## Разберём три разных затраты

**Аллокации.** В .NET 10 для строки `ORD-1042;paid;1499.90` вызов `row.Split(';')` создаёт один массив `string[]` и три строки. Для пустых полей используется `string.Empty`. Если разделителя `;` нет, массив содержит одну ссылку на исходную строку `row`. `new List<Order>()` создаёт объект списка со ссылкой на общий пустой массив `Order[]`. При первом вызове `Add` выделяется массив для хранения элементов.

**Копирование.** `Order snapshot = paid[0]` копирует значение структуры `Order`. Изменение `snapshot.Amount` не меняет элемент списка. При этом поле `Id` в обеих копиях указывает на одну и ту же строку: символы повторно не копируются.

**Удержание.** Метод возвращает `List<Order>`, который продолжает хранить записи, пока остаётся доступным. Если потребителю нужны только количество и сумма, можно обойтись без списка результатов. Но это **не отменяет** аллокаций внутри `Split` — их устраним в будущих уроках о `Span`.

По одному примеру нельзя судить о выигрыше в производительности: на следующем занятии измерим варианты с BenchmarkDotNet.

## Напиши код сам · ALLOC-TASK-001

**Задача на 12 минут.** Реализуй `SummarizePaid`: на входе — строки формата `ID;status;amount`. Верни количество записей со статусом `paid` и сумму их полей `amount` **без создания списка объектов заказов**.

**Правила:** сравнение статуса строго с учётом регистра. Некорректная строка, неправильное число полей или нечисловая сумма пропускаются. Для чисел используй `decimal.TryParse` с `CultureInfo.InvariantCulture`. Пока **можно использовать `Split`** — это тема следующей цепочки. Не сохраняй промежуточные записи в коллекции.

**Проверка:**

~~~text
ORD-1042;paid;1499.90
ORD-1043;new;250.00
ORD-1044;paid;80.00
broken
ORD-1045;paid;not-a-number
ORD-1046;PAID;30.00
→ Paid: 2, Total: 1579.90
~~~

**Пограничный случай:** пустая последовательность должна вернуть `(0, 0m)`. Метод принимает `IEnumerable<string>` и проходит его только один раз.

<details><summary>Необязательная подсказка</summary><p>Достаточно двух локальных переменных: счётчика и суммы. Для каждой строки проверь длину массива полей, статус и результат TryParse. Подумай, какие данные после обработки не нужно сохранять.</p></details>

**Проверка решения:** кнопка «Запустить и проверить Assert» откроет в браузерном редакторе полный `Program.cs`: твой метод, тестовые данные и видимые C#-проверки `Assert` на обычный, пустой и пограничный ввод. При ошибке увидишь нарушенное условие; готовое решение не показывается.

<script type="text/plain" id="practice-program-template">
using System;
using System.Collections.Generic;
using System.Globalization;

public static class Program
{
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
            yield return "ORD-5;paid;-20.50";
            yield return "ORD-6;new;999.00";
            yield return "ORD-7;paid;30.75";
        }
    }

    private static void Assert(bool condition, string failureMessage)
    {
        if (!condition) throw new InvalidOperationException("❌ ALLOC-TASK-001: " + failureMessage);
    }

    // BEGIN ALLOC-TASK-001
    // INSERT_SOLUTION_HERE
    // END ALLOC-TASK-001
}
</script>

<label for="solution-ALLOC-TASK-001" class="editor-label">Твой код:</label>
<textarea id="solution-ALLOC-TASK-001" class="code-editor" data-practice-id="ALLOC-TASK-001" spellcheck="false" rows="12">static (int PaidCount, decimal Total) SummarizePaid(
    IEnumerable&lt;string&gt; rows)
{
    // Реализуй SummarizePaid для строк формата "ID;status;amount".
    // За один проход посчитай записи со статусом "paid" с учётом регистра
    // и сложи их поля amount. Верни (PaidCount, Total).
    // Разбирай суммы через decimal.TryParse с CultureInfo.InvariantCulture.
    // Пропускай строки с неверным числом полей или нечисловой суммой.
    // Разобранные записи не сохраняй в коллекции.

    throw new NotImplementedException();
}</textarea>
<div class="practice-actions"><button type="button" class="button" data-copy-practice="ALLOC-TASK-001">Скопировать код</button> <button type="button" class="button" data-download-practice="ALLOC-TASK-001">Скачать .cs</button><span class="practice-feedback" role="status"></span></div>
<p class="muted">Черновик сохраняется только в браузере. Кнопка «Запустить и проверить Assert» передаст реализацию в WebAssembly-компилятор вместе с тестами. Там можно исправлять код и повторно запускать его отдельной кнопкой «Запустить мой код». Для проверки результата и рекомендаций отправь код в чат.</p>

## Что запомнить

**Выделить память ≠ скопировать значение ≠ удерживать данные.** Сначала выясняем, какие расходы есть у метода и нужны ли все сохраняемые данные. Затем измеряем эффект изменений.

**Связь с другим курсом:** в [уроке о `params ReadOnlySpan<T>` и `CountBy`]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы уже видели способ избежать некоторых временных массивов. Позже вернёмся к нему с измерениями.

**Следующий урок:** `ALLOC-002` — BenchmarkDotNet, `MemoryDiagnoser` и сравнение аллокаций.

**Официальная документация:** [типы значений](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/value-types), [GC и управление памятью](https://learn.microsoft.com/dotnet/standard/garbage-collection/fundamentals), [оптимизация C#](https://learn.microsoft.com/dotnet/csharp/advanced-topics/performance/).
