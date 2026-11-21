using System;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        HttpCall[] calls =
        [
            new("/orders", 200, 40),
            new("/orders", 201, 90),
            new("/orders", 503, 250),
            new("/ORDERS", 200, 60),
            new("/health", 200, 5),
            new("/orders", 201, 30)
        ];

        var stats = calls
            .Where(x => x.StatusCode is >= 200 and < 300)
            .AggregateBy(
                x => x.Route,
                (Count: 0, TotalMs: 0),
                (acc, x) => (
                    Count: acc.Count + 1,
                    TotalMs: acc.TotalMs + x.DurationMs
                ),
                StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x.Key, StringComparer.Ordinal)
            .ToArray();

        foreach (var x in stats)
            Console.WriteLine($"{x.Key}: Count={x.Value.Count}, TotalMs={x.Value.TotalMs}");

        int builds = 0;
        Audit? audit = null;
        audit?.Text = BuildSummary();
        Console.WriteLine($"Builds when null: {builds}");

        audit = new Audit();
        audit?.Text = BuildSummary();
        Console.WriteLine($"Builds when present: {builds}");
        Console.WriteLine($"Audit: {audit.Text}");

        string BuildSummary()
        {
            builds++;
            return string.Join("; ", stats.Select(
                x => $"{x.Key}={x.Value.Count}/{x.Value.TotalMs}"));
        }
    }
}

sealed record HttpCall(string Route, int StatusCode, int DurationMs);
sealed class Audit
{
    public string Text { get; set; } = "";
}
