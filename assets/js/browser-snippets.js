/* Runnable C# 13 / .NET 9 wrappers for the seven code blocks in lesson 001.
   Original Markdown fragments stay untouched. Node and the browser use this same builder. */
(function (factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.DotnetLessonSnippets = api;
})(function () {
  "use strict";

  const imports = "using System;\nusing System.Collections.Generic;\nusing System.Linq;\n";
  const sampleMethods = 'string[] methods = ["GET", "POST", "GET", "get"];';
  const snippetIds = [
    "params-array", "params-span", "params-enumerable", "groupby-count",
    "countby", "countby-comparer", "full-program"
  ];

  function indent(source, spaces) {
    return source.trim().split("\n").map(line => line ? " ".repeat(spaces) + line : "").join("\n");
  }

  function wrapInProgram(mainStatements, members) {
    return imports + "\npublic static class Program\n{\n" +
      "    public static void Main()\n    {\n" +
      indent(mainStatements, 8) + "\n    }\n" +
      (members ? "\n" + indent(members, 4) + "\n" : "") +
      "}\n";
  }

  function makeRunnable(snippet, id) {
    const code = snippet.replace(/\r\n?/g, "\n").trim();

    switch (typeof id === "number" ? snippetIds[id] : id) {
      case "params-array":
      case "params-span": {
        const pos = code.lastIndexOf("Console.WriteLine(Sum(");
        if (pos <= 0) throw Error("В примере Sum изменилась структура.");
        return wrapInProgram(code.slice(pos).trim(), code.slice(0, pos).trim());
      }
      case "params-enumerable": {
        const pos = code.indexOf("\nstatic void Analyze(");
        if (pos <= 0) throw Error("В примере Analyze изменилась структура.");
        return wrapInProgram(code.slice(0, pos).trim(), code.slice(pos).trim());
      }
      case "groupby-count":
        if (!code.includes("GroupBy(")) throw Error("В примере GroupBy изменилась структура.");
        return wrapInProgram(sampleMethods + "\n" + code +
          '\nforeach (var row in counts) Console.WriteLine($"{row.Method}: {row.Count}");');
      case "countby":
        if (!code.includes("CountBy(")) throw Error("В примере CountBy изменилась структура.");
        return wrapInProgram(sampleMethods + "\n" + code);
      case "countby-comparer":
        if (!code.includes("StringComparer.OrdinalIgnoreCase")) throw Error("В примере comparer изменилась структура.");
        return wrapInProgram(sampleMethods + "\n" + code +
          '\nforeach (var (method, count) in counts) Console.WriteLine($"{method}: {count}");');
      case "full-program": {
        const marker = "\nstatic void PrintCounts(";
        const pos = code.indexOf(marker);
        if (pos <= 0) throw Error("В полном примере изменилась структура.");
        const main = code.slice(0, pos).split("\n")
          .filter(line => !/^\s*using\s+[\w.]+\s*;\s*$/.test(line)).join("\n").trim();
        return wrapInProgram(main, code.slice(pos).trim());
      }
      default:
        throw Error("Для этого C#-примера пока нет запуска.");
    }
  }

  return { makeRunnable, exampleCount: snippetIds.length, snippetIds };
});
