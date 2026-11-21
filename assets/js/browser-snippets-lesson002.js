/* Runnable wrappers for lesson 002. No solutions to TASK-002 are included. */
(function(factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.DotnetLesson002Snippets=api;
})(function(){
  "use strict";
  const imports="using System;\nusing System.Collections.Generic;\nusing System.Linq;\n";
  const failure="sealed record Failure(string Client, int StatusCode, long ResponseBytes);";
  const auditReport='sealed class AuditReport { public string Text { get; set; } = ""; }';
  const http='sealed record HttpCall(string Route, int StatusCode, int DurationMs);';
  const audit='sealed class Audit { public string Text { get; set; } = ""; }';
  const calls='HttpCall[] calls = [new("/orders",200,40), new("/orders",201,90), new("/ORDERS",200,60)];';
  const indent=(s,n)=>s.trim().split("\n").map(line=>line?" ".repeat(n)+line:"").join("\n");
  const wrap=(main,members="",types="")=>imports+
    "\npublic static class Program\n{\n    public static void Main()\n    {\n"+
    indent(main,8)+"\n    }\n"+(members?"\n"+indent(members,4)+"\n":"")+"}\n"+
    (types?"\n"+types+"\n":"");

  function makeRunnable(fragment,index){
    const code=fragment.replace(/\r\n?/g,"\n").trim();
    switch(index){
      case 0:
        if(!code.includes("AggregateBy("))throw Error("Изменилась структура примера AggregateBy.");
        return wrap(calls+"\n"+code+'\nforeach (var x in stats) Console.WriteLine($"{x.Key}: {x.Value.Count}/{x.Value.TotalMs}");',"",http);
      case 1:
        if(!code.includes("if (audit is not null)"))throw Error("Изменилась структура if.");
        return wrap('Audit? audit = new Audit();\n'+code+'\nConsole.WriteLine("Audit: " + audit.Text);\nstring BuildSummary() => "ready";',"",audit);
      case 2:
        if(!code.includes("audit?.Text = BuildSummary();"))throw Error("Изменилась структура условного присваивания.");
        return wrap('int builds = 0;\nAudit? audit = null;\n'+code+
          '\nConsole.WriteLine("Builds when null: " + builds);'+
          '\naudit = new Audit();\n'+code+
          '\nConsole.WriteLine("Builds when present: " + builds);'+
          '\nConsole.WriteLine("Audit: " + audit.Text);'+
          '\nstring BuildSummary() { builds++; return "ready"; }',"",audit);
      case 3: {
        const marker="\nsealed record HttpCall(";
        const pos=code.lastIndexOf(marker);
        if(pos<0)throw Error("В полном примере отсутствуют объявления типов.");
        const allBody=code.slice(0,pos).split("\n").filter(l=>!/^\s*using\s+[\w.]+\s*;\s*$/.test(l)).join("\n").trim();
        return wrap(allBody,"",code.slice(pos).trim());
      }
      case 4:
        if(!code.includes("record Failure("))throw Error("Изменились определения типов.");
        return wrap('var item = new Failure("api-A", 500, 150);\nvar report = new AuditReport { Text = item.Client };\nConsole.WriteLine($"{report.Text}: {item.StatusCode}, bytes={item.ResponseBytes}");',"",code);
      case 5:
        if(!code.includes("GetNoisiestClients("))throw Error("Изменилась сигнатура задания.");
        return wrap('Console.WriteLine("Сигнатура проверена; реализацию напиши самостоятельно.");',
          code+"\n{\n    throw new NotImplementedException();\n}",failure+"\n"+auditReport);
      case 6:
        if(!code.includes("Failure[] calls"))throw Error("Изменился вход задания.");
        return wrap(code+'\nConsole.WriteLine($"Input: {calls.Length} calls");',"",failure);
      default:throw Error("Неизвестный пример урока №2.");
    }
  }
  return {makeRunnable,exampleCount:7};
});
