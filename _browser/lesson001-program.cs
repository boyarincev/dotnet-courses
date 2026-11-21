using System;
using System.Collections.Generic;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        PrintCounts("HTTP methods", "GET", "POST", "get", "PUT", "post", "GET");
        Console.WriteLine($"Sum = {Sum(10, 20, 30)}");
    }

    private static void PrintCounts(string title, params IEnumerable<string> values)
    {
        Console.WriteLine(title);
        var counts = values
            .CountBy(x => x, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(x => x.Value);
        foreach (var (method, count) in counts)
            Console.WriteLine($"{method}: {count}");
    }

    private static int Sum(params ReadOnlySpan<int> values)
    {
        int total = 0;
        foreach (int value in values)
            total += value;
        return total;
    }
}
