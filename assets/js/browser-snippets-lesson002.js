/* Execution context for the partial C# fragments in lesson 002. */
(function(factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.DotnetLessonSnippets=api;
})(function(){
  "use strict";
  const imports = "using System;\nusing System.Linq;\n";
  const http = "sealed record HttpCall(string Route, int StatusCode, int DurationMs);";
  const audit = 'sealed class Audit { public string Text { get; set; } = ""; }';
  const calls = 'HttpCall[] calls = [new("/orders", 200, 40), new("/orders", 201, 90), new("/ORDERS", 200, 60)];';

  function wrap(statements, types) {
    const body = statements.join("\n").split("\n").map(line => line ? "        " + line : "").join("\n");
    return imports + "\npublic static class Program\n{\n    public static void Main()\n    {\n" +
      body + "\n    }\n}\n\n" + types + "\n";
  }

  const handlers = {
    aggregateby: code => wrap([
      calls,
      code,
      'foreach (var x in stats) Console.WriteLine($"{x.Key}: {x.Value.Count}/{x.Value.TotalMs}");'
    ], http),
    "explicit-null-check": code => wrap([
      "Audit? audit = new Audit();",
      code,
      'Console.WriteLine("Audit: " + audit.Text);',
      'string BuildSummary() => "ready";'
    ], audit),
    "conditional-assignment": code => wrap([
      "int builds = 0;",
      "Audit? audit = null;",
      code,
      'Console.WriteLine("Builds when null: " + builds);',
      "audit = new Audit();",
      code,
      'Console.WriteLine("Builds when present: " + builds);',
      'Console.WriteLine("Audit: " + audit.Text);',
      'string BuildSummary() { builds++; return "ready"; }'
    ], audit)
  };

  return {
    snippetIds: Object.keys(handlers),
    makeRunnable(fragment, id) {
      if (!Object.hasOwn(handlers, id)) throw Error("Для этого фрагмента нет адаптера.");
      return handlers[id](fragment.replace(/\r\n?/g, "\n").trim());
    }
  };
});
