---
lesson_number: 1
lesson_date: '21 ноября 2026'
title: 'Аллокации, копирование и удержание памяти'
summary: 'На знакомом коде импорта заказов учимся различать создание объектов, копирование значений и длительное хранение данных.'
topic_id: 'ALLOC-001'
csharp_feature: 'C# · значения и ссылки'
dotnet_feature: '.NET · память и GC'
series: 'Модель памяти и измерения'
browser_runtime: '10'
---
> **30 минут максимум.** Объяснение и пример — 8 минут, самостоятельная задача — 12 минут, проверка и повторение — около 10 минут. Пока не нужно оптимизировать весь код.

## Зачем это нужно

В рабочем сервисе встречаются строки импорта вида `ORD-1042;paid;1499.90`. Допустим, сервис обрабатывает тысячи таких строк. Чтобы оценить цену реализации, важно различать **три вида работы**:

- **Аллокация** — выделение памяти под новый объект или массив (для управляемых объектов — обычно в куче). Пример: массив и подстроки, полученные из `Split`.
- **Копирование** — перенос уже существующего значения или данных. Пример: присваивание одной переменной типа `struct` другой; само по себе оно обычно не требует отдельной heap-аллокации.
- **Удержание** — данные остаются достижимыми через ссылки и поэтому продолжают занимать память. Пример: сохранённый надолго `List<Order>`.

Важно: **`struct` не означает «всегда в стеке»**. Значение структуры может быть частью объекта или массива в управляемой куче. И наоборот, локальная переменная не обязательно означает отдельный объект.

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
        Console.WriteLine($"First amount: {paid[0].Amount.ToString("F2", CultureInfo.InvariantCulture)}");

        Order snapshot = paid[0];
        snapshot.Amount = 0m;
        Console.WriteLine($"After copy change: {paid[0].Amount.ToString("F2", CultureInfo.InvariantCulture)}");
    }

    private static List<Order> ParsePaid(IEnumerable<string> rows)
    {
        var result = new List<Order>();
        foreach (string row in rows)
        {
            string[] fields = row.Split(';');
            if (fields.Length != 3 || fields[1] != "paid") continue;
            if (!decimal.TryParse(fields[2], NumberStyles.Number,
                                  CultureInfo.InvariantCulture, out decimal amount)) continue;
            result.Add(new Order(fields[0], amount));
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

**Аллокации.** `row.Split(';')` создаёт массив элементов и строки для полей, хотя детали оптимизации зависят от входа. `new List<Order>()` создаёт объект списка; при добавлении элементов обычно выделяется внутренний массив.

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
            "Два оплаченных заказа дают сумму 1579.90");

        var empty = SummarizePaid(Array.Empty<string>());
        Assert(empty.PaidCount == 0 && empty.Total == 0m,
            "Пустой ввод возвращает (0, 0)");

        var invalid = SummarizePaid(
            ["broken", "ORD-3;paid;not-a-number", "ORD-4;paid;4;extra"]);
        Assert(invalid.PaidCount == 0 && invalid.Total == 0m,
            "Некорректные записи пропускаются");

        var strict = SummarizePaid(["ORD-1;PAID;10.00", "ORD-2;paid;5.25"]);
        Assert(strict.PaidCount == 1 && strict.Total == 5.25m,
            "Статус paid учитывает регистр");

        var mixed = SummarizePaid(
            ["ORD-5;paid;-20.50", "ORD-6;new;999.00", "ORD-7;paid;30.75"]);
        Assert(mixed.PaidCount == 2 && mixed.Total == 10.25m,
            "Суммы decimal и фильтрация статуса");

        Console.WriteLine("Все проверки пройдены");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException("❌ ALLOC-TASK-001: " + message);
        Console.WriteLine("✓ " + message);
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
    // Напиши реализацию. Не сохраняй List&lt;Order&gt;.
    throw new NotImplementedException();
}</textarea>
<div class="practice-actions"><button type="button" class="button" data-copy-practice="ALLOC-TASK-001">Скопировать код</button> <button type="button" class="button" data-download-practice="ALLOC-TASK-001">Скачать .cs</button><span class="practice-feedback" role="status"></span></div>
<p class="muted">Черновик сохраняется только в браузере. Кнопка «Запустить и проверить Assert» передаст реализацию в WebAssembly-компилятор вместе с тестами. Там можно исправлять код и повторно запускать его отдельной кнопкой «Запустить мой код». Для проверки результата и рекомендаций отправь код в чат.</p>

## Что запомнить

**Выделить память ≠ скопировать значение ≠ удерживать данные.** Сначала выясняем, какие расходы есть у метода и нужны ли все сохраняемые данные. Затем измеряем эффект изменений.

**Связь с другим курсом:** в [уроке о `params ReadOnlySpan<T>` и `CountBy`]({{ '/courses/csharp-dotnet-9-11/lessons/001-params-countby/' | relative_url }}) мы уже видели способ избежать некоторых временных массивов. Позже вернёмся к нему с измерениями.

**Следующий урок:** `ALLOC-002` — BenchmarkDotNet, `MemoryDiagnoser` и сравнение аллокаций.

**Официальная документация:** [типы значений](https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/value-types), [GC и управление памятью](https://learn.microsoft.com/dotnet/standard/garbage-collection/fundamentals), [оптимизация C#](https://learn.microsoft.com/dotnet/csharp/advanced-topics/performance/).
