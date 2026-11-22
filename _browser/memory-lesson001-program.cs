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
