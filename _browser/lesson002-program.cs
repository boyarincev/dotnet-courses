using System;
using System.Linq;

public static class Program
{
    public static void Main()
    {
        HttpCall[] calls =
        [
            new(Route: "/orders", StatusCode: 200, DurationMs: 40),
            new(Route: "/orders", StatusCode: 201, DurationMs: 90),
            new(Route: "/orders", StatusCode: 503, DurationMs: 250),
            new(Route: "/ORDERS", StatusCode: 200, DurationMs: 60),
            new(Route: "/health", StatusCode: 200, DurationMs: 5),
            new(Route: "/orders", StatusCode: 201, DurationMs: 30)
        ];

        var stats = calls
            .Where(call => call.StatusCode is >= 200 and < 300)
            .AggregateBy(
                keySelector: call => call.Route,
                seed: (Count: 0, TotalMs: 0),
                func: (acc, call) => (
                    Count: acc.Count + 1,
                    TotalMs: acc.TotalMs + call.DurationMs
                ),
                keyComparer: StringComparer.OrdinalIgnoreCase)
            .OrderBy(keySelector: pair => pair.Key, comparer: StringComparer.Ordinal)
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
