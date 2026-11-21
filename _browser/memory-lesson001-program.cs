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
