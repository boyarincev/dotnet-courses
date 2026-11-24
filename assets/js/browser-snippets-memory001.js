/* Runnable .NET 10 sample: no prewritten practice solution. */
(function(factory){
  "use strict";
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  if(typeof window!=="undefined") window.DotnetLessonSnippets=api;
})(function(){
  "use strict";
  const snippetIds = ["allocations-copies-retention"];
  return {
    exampleCount: snippetIds.length,
    snippetIds,
    makeRunnable(snippet, id) {
      const code=String(snippet).replace(/\r\n?/g,"\n").trim();
      if((id !== 0 && id !== snippetIds[0]) || !code.includes("public static class Program") ||
         !code.includes("List<Order> ParsePaid("))
        throw Error("Не найден полный пример урока ALLOC-001.");
      return code+"\n";
    }
  };
});
