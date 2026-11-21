/* Runnable .NET 10 sample: no prewritten practice solution. */
(function(factory){
  "use strict";
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  if(typeof window!=="undefined") window.DotnetMemoryLesson001Snippets=api;
})(function(){
  "use strict";
  return {
    exampleCount:1,
    makeRunnable(snippet,index){
      const code=String(snippet).replace(/\r\n?/g,"\n").trim();
      if(index!==0 || !code.includes("public static class Program") ||
         !code.includes("List<Order> ParsePaid("))
        throw Error("Не найден полный пример урока ALLOC-001.");
      return code+"\n";
    }
  };
});
