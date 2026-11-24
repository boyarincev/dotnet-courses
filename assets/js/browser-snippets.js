/* Execution context for the partial C# fragments in lesson 001. */
(function (factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.DotnetLessonSnippets = api;
})(function () {
  "use strict";

  const imports = "using System;\nusing System.Collections.Generic;\nusing System.Linq;\n";
  const sampleMethods = 'string[] methods = ["GET", "POST", "GET", "get"];';

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

  function wrapSum(code) {
    const call = code.lastIndexOf("Console.WriteLine(Sum(");
    if (call <= 0) throw Error("В примере Sum изменилась структура.");
    return wrapInProgram(code.slice(call), code.slice(0, call));
  }

  const handlers = {
    "params-array": wrapSum,
    "params-span": wrapSum,
    "params-enumerable": code => {
      const declaration = code.indexOf("\nstatic void Analyze(");
      if (declaration <= 0) throw Error("В примере Analyze изменилась структура.");
      return wrapInProgram(code.slice(0, declaration), code.slice(declaration));
    },
    "groupby-count": code => wrapInProgram(sampleMethods + "\n" + code +
      '\nforeach (var row in counts) Console.WriteLine($"{row.Method}: {row.Count}");'),
    countby: code => wrapInProgram(sampleMethods + "\n" + code),
    "countby-comparer": code => wrapInProgram(sampleMethods + "\n" + code +
      '\nforeach (var (method, count) in counts) Console.WriteLine($"{method}: {count}");')
  };

  return {
    snippetIds: Object.keys(handlers),
    makeRunnable(snippet, id) {
      if (!Object.hasOwn(handlers, id)) throw Error("Для этого фрагмента нет адаптера.");
      return handlers[id](snippet.replace(/\r\n?/g, "\n").trim());
    }
  };
});
