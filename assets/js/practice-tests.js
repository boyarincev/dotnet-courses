/* Practice assert harness; it invokes the student's own method, never a solution. */
(function(factory) {
  "use strict";
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  if(typeof window!=="undefined") window.DotnetPracticeTests=api;
})(function(){
  "use strict";
  const imports="using System;\nusing System.Collections.Generic;\nusing System.Linq;\nusing System.Globalization;\n";
  const specs={
    "whats-new:1":{
      id:"TASK-001",
      types:"",
      checks:String.raw`
        var data = new[] {"get","POST","GET","put","post","DELETE","delete","GET"};
        var actual = GetTopMethods(data).ToArray();
        Assert(actual.Length == 3, "TASK-001: для примера нужно ровно три результата");
        Assert(actual[0].Count == 3 && string.Equals(actual[0].Method,"get",StringComparison.OrdinalIgnoreCase),
            "TASK-001: регистр GET/get игнорируется, частота равна 3");
        Assert(actual[1].Count == 2 && string.Equals(actual[1].Method,"DELETE",StringComparison.OrdinalIgnoreCase)
            && actual[2].Count == 2 && string.Equals(actual[2].Method,"POST",StringComparison.OrdinalIgnoreCase),
            "TASK-001: при равной частоте сортировка по имени без учёта регистра");
        Assert(!GetTopMethods(Array.Empty<string>()).Any(), "TASK-001: пустой ввод");
        var mixed = GetTopMethods(new[] {"X","x","y"}).ToArray();
        Assert(mixed.Length == 2 && mixed[0].Count == 2 &&
            string.Equals(mixed[0].Method,"x",StringComparison.OrdinalIgnoreCase),
            "TASK-001: объединение ключей X/x");
        var tie = GetTopMethods(new[] {"z","A","Z","a"}).ToArray();
        Assert(tie.Length == 2 && tie[0].Count == 2 && tie[1].Count == 2 &&
            string.Equals(tie[0].Method,"a",StringComparison.OrdinalIgnoreCase),
            "TASK-001: при равенстве частот первым идёт A, затем Z");
      `
    },
    "whats-new:2":{
      id:"TASK-002",
      types:String.raw`
sealed record Failure(string Client, int StatusCode, long ResponseBytes);
sealed class AuditReport { public string Text { get; set; } = ""; }
      `,
      checks:String.raw`
        Failure[] calls = {
            new("api-A",500,150), new("API-a",404,50),
            new("api-b",503,400), new("api-b",200,900), new("api-c",500,400)
        };
        var audit = new AuditReport();
        var actual = GetNoisiestClients(calls,audit);
        Assert(actual.Count == 2, "TASK-002: для примера нужно два клиента");
        Assert(actual[0].Count == 1 && actual[0].TotalBytes == 400 &&
            string.Equals(actual[0].Client,"api-b",StringComparison.OrdinalIgnoreCase),
            "TASK-002: первый клиент api-b, 1 ошибка, 400 байт");
        Assert(actual[1].Count == 1 && actual[1].TotalBytes == 400 &&
            string.Equals(actual[1].Client,"api-c",StringComparison.OrdinalIgnoreCase),
            "TASK-002: при равной сумме сортировка по имени");
        Assert(audit.Text == "api-b=400; api-c=400", "TASK-002: текст отчёта audit.Text");
        var emptyAudit = new AuditReport {Text="старое значение"};
        Assert(GetNoisiestClients(Array.Empty<Failure>(),emptyAudit).Count == 0 && emptyAudit.Text == "",
            "TASK-002: пустая последовательность и очистка отчёта");
        Failure[] mixed = {
            new("Api-X",500,300), new("API-x",404,50),
            new("small",500,10), new("ignored",200,9000)
        };
        var withoutAudit = GetNoisiestClients(mixed,null);
        Assert(withoutAudit.Count == 2 &&
            string.Equals(withoutAudit[0].Client,"Api-X",StringComparison.OrdinalIgnoreCase) &&
            withoutAudit[0].Count == 2 && withoutAudit[0].TotalBytes == 350,
            "TASK-002: группировка без учёта регистра и audit=null");
        Assert(withoutAudit[1].TotalBytes == 10 &&
            string.Equals(withoutAudit[1].Client,"small",StringComparison.OrdinalIgnoreCase),
            "TASK-002: успешный HTTP-ответ не участвует в сумме");
      `
    },
    "memory:1":{
      id:"ALLOC-TASK-001",
      types:"",
      checks:String.raw`
        string[] rows = {
            "ORD-1042;paid;1499.90", "ORD-1043;new;250.00",
            "ORD-1044;paid;80.00", "broken",
            "ORD-1045;paid;not-a-number", "ORD-1046;PAID;30.00"
        };
        var summary = SummarizePaid(rows);
        Assert(summary.PaidCount == 2 && summary.Total == 1579.90m,
            "ALLOC-TASK-001: пример — 2 оплаченных заказа, сумма 1579.90");
        var empty = SummarizePaid(Array.Empty<string>());
        Assert(empty.PaidCount == 0 && empty.Total == 0m,
            "ALLOC-TASK-001: пустой ввод");
        var bad = SummarizePaid(new[] {"broken","ORD-3;paid;not-a-number","ORD-4;paid;4;extra"});
        Assert(bad.PaidCount == 0 && bad.Total == 0m,
            "ALLOC-TASK-001: неверные и неполные записи пропускаются");
        var strict = SummarizePaid(new[] {"ORD-1;PAID;10.00","ORD-2;paid;5.25"});
        Assert(strict.PaidCount == 1 && strict.Total == 5.25m,
            "ALLOC-TASK-001: статус сравнивается с учётом регистра");
        var negative = SummarizePaid(new[] {"ORD-5;paid;-20.50","ORD-6;new;999.00","ORD-7;paid;30.75"});
        Assert(negative.PaidCount == 2 && negative.Total == 10.25m,
            "ALLOC-TASK-001: десятичные и отрицательные суммы");
      `
    }
  };
  const stripImports=value=>String(value).replace(/\r\n?/g,"\n").split("\n")
    .filter(line=>!/^\s*using\s+[\w.]+\s*;\s*$/.test(line)).join("\n").trim();
  function makeProgram(course,lesson,source){
    const spec=specs[course+":"+lesson];
    if(!spec) throw Error("Для этого урока пока нет проверочного задания.");
    if(/\b(?:class|struct)\s+Program\b/.test(source)) {
      throw Error("Для автоматической проверки вставь в поле задания только метод, без класса Program.");
    }
    const body=stripImports(source);
    if(!body) throw Error("Сначала напиши метод в поле задания.");
    return imports+
      "\npublic static class Program\n{\n"+
      "    private static int passed;\n"+
      "    private static void Assert(bool condition, string message)\n    {\n"+
      "        if (!condition) throw new InvalidOperationException(\"❌ \" + message);\n"+
      "        passed++;\n        Console.WriteLine(\"✓ \" + message);\n    }\n"+
      "    public static void Main()\n    {\n"+spec.checks+"\n"+
      "        Console.WriteLine(\"ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: \" + passed);\n"+
      "    }\n"+
      "    // BEGIN "+spec.id+"\n"+body+"\n"+
      "    // END "+spec.id+"\n}\n"+spec.types+"\n";
  }
  return {makeProgram,keys:Object.keys(specs)};
});
