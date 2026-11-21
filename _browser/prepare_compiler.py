"""Build the upstream MIT-licensed C# minor compiler as a reusable browser runtime.
Pinned source from MicrosoftLearning/c-sharp-minor; build twice (net9 and net10).
Editor enhancement is shared by both runtimes; no compiler binaries are committed.
"""
from pathlib import Path
import re
import sys

runtime = sys.argv[1] if len(sys.argv) > 1 else ""
if runtime not in ("9", "10"):
    raise SystemExit("Usage: prepare_compiler.py 9|10 <source directory>")
root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("_compiler_src/CSharpCompilerWasm")
razor = root / "Pages/Compiler.razor"
html = root / "wwwroot/index.html"
csproj = root / "CSharpCompilerWasm.csproj"
sample_file = "_browser/lesson001-program.cs" if runtime == "9" else "_browser/lesson002-program.cs"
sample = Path(sample_file).read_text(encoding="utf-8").strip()
literal = '@"' + sample.replace('"', '""') + '"'
source = razor.read_text(encoding="utf-8")

replacements = [
    (r'private string sourceCode = @".*?";(?=\s+private string sampleCode =)',
     "private string sourceCode = " + literal + ";"),
    (r'private string sampleCode = @".*?";(?=\s+private string output =)',
     "private string sampleCode = " + literal + ";"),
    (r'private bool showFullCode = false;', 'private bool showFullCode = true;'),
]
for pattern, value in replacements:
    source, count = re.subn(pattern, lambda _: value, source, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError("Upstream source changed; cannot patch: " + pattern)

needle = "            var result = await CompileCSharpCode(sourceCode);"
if source.count(needle) != 1:
    raise RuntimeError("Upstream compilation entry changed")
source = source.replace(
    needle,
    "            // Source may have been updated programmatically by the parent lesson.\n"
    "            if (showFullCode) sourceCode = displayCode;\n"
    + needle,
)
parse = "CSharpSyntaxTree.ParseText(combinedCode);"
if source.count(parse) != 1:
    raise RuntimeError("Missing CSharpSyntaxTree.ParseText")
lang = "CSharp13" if runtime == "9" else "CSharp14"
source = source.replace(parse, "CSharpSyntaxTree.ParseText(combinedCode, new CSharpParseOptions(LanguageVersion." + lang + "));")


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError("Upstream console code changed; cannot patch: " + old.splitlines()[0].strip())
    return text.replace(old, new)


# ReadLine restarts the entry point. Use a dedicated signal so a program error
# with the same message cannot be mistaken for a request for input.
console = root / "ConsoleReplacementCode.cs"
console_source = replace_once(
    console.read_text(encoding="utf-8"),
    '        throw new System.InvalidOperationException(""INPUT_REQUIRED"");',
    '        throw new InputRequiredException();',
)
console_source = replace_once(
    console_source,
    "    internal static string GetCapturedOutput()",
    "    internal sealed class InputRequiredException : System.Exception { }\n\n"
    "    internal static string GetCapturedOutput()",
)

source = replace_once(
    source,
    '                AddOutput(".NET WebAssembly execution completed successfully!", "success");',
    '''                if (string.IsNullOrEmpty(executionResult))
                {
                    AddOutput(".NET WebAssembly execution completed successfully!", "success");
                }
                else if (!showSystemOutput)
                {
                    await DisplayErrorsViaJavaScript(clearPreviousOutput: false);
                }''',
)
source = replace_once(
    source,
    '                return "Error: No suitable Main method found";',
    '                AddErrorOutput("Error: No suitable Main method found", "error");\n'
    '                return "Error: No suitable Main method found";',
)
source = replace_once(
    source,
    "        // We need to use the restart-based approach, but we'll optimize it to minimize visual issues",
    '''        // We need to use the restart-based approach, but we'll optimize it to minimize visual issues
        var getOutputMethod = consoleType?.GetMethod("GetCapturedOutput", BindingFlags.Static | BindingFlags.NonPublic);
        var inputRequiredType = consoleType?.GetNestedType("InputRequiredException", BindingFlags.NonPublic);
        string GetCapturedOutput() => getOutputMethod?.Invoke(null, null) as string ?? "";
        var outputBeforeExecution = output;''',
)
source = replace_once(
    source,
    "                // Clear and reset the console for this execution attempt",
    '''                // Replace the previous attempt's preview when replaying input.
                if (showSystemOutput)
                {
                    output = outputBeforeExecution;
                }

                // Clear and reset the console for this execution attempt''',
)
for name, comment in (("finalOutput", "the final output"), ("outputSoFar", "current output")):
    source = replace_once(
        source,
        f'''                    string {name} = "";
                    if (consoleType != null)
                    {{
                        var getOutputMethod = consoleType.GetMethod("GetCapturedOutput", BindingFlags.Static | BindingFlags.NonPublic);
                        {name} = getOutputMethod?.Invoke(null, null) as string ?? "";
                    }}''' + "\n                    \n" + f'''                    // Display {comment}
                    await DisplayOutput({name});''',
        "                    await DisplayOutput(GetCapturedOutput());",
    )
source = replace_once(
    source,
    'catch (TargetInvocationException ex) when (ex.InnerException?.Message == "INPUT_REQUIRED")',
    'catch (TargetInvocationException ex) when (inputRequiredType != null && ex.InnerException?.GetType() == inputRequiredType)',
)
source = replace_once(
    source,
    "            var innerEx = ex.InnerException ?? ex;",
    '''            await DisplayOutput(GetCapturedOutput());
            var innerEx = ex is TargetInvocationException { InnerException: { } cause } ? cause : ex;''',
)

# Keep the two renderers in order: DisplayOutput replaces the previous run,
# while the error renderer can append to the current run's console.
source = replace_once(
    source,
    "    private async Task DisplayErrorsViaJavaScript()",
    "    private async Task DisplayErrorsViaJavaScript(bool clearPreviousOutput = true)",
)
source = replace_once(
    source,
    '''            // Clear previous output first
            await JSRuntime.InvokeVoidAsync("clearAllOutput");''',
    '''            if (clearPreviousOutput)
            {
                await JSRuntime.InvokeVoidAsync("clearAllOutput");
            }''',
)
source = replace_once(
    source,
    "        var line = $\"<span class='{cssClass}'>[{timestamp}] {text.Replace(\"\\n\", \"<br/>\")}</span><br/>\";\n"
    "        errorOutput += line;",
    "        var escaped = System.Net.WebUtility.HtmlEncode(text).Replace(\"\\n\", \"<br/>\");\n"
    "        var line = $\"<span class='{cssClass}'>[{timestamp}] {escaped}</span><br/>\";\n"
    "        errorOutput += line;",
)

# Preserve blank lines too. The HTML parser consumes the first newline in
# a <pre> element, so add one before the escaped text in the Razor renderer.
trim_leading = r"""                    var lines = outputText.Split('\n');
                    int firstNonEmptyLine = 0;
                    for (int i = 0; i < lines.Length; i++)
                    {
                        if (!string.IsNullOrWhiteSpace(lines[i]))
                        {
                            firstNonEmptyLine = i;
                            break;
                        }
                    }
                    var trimmedOutput = string.Join("\n", lines.Skip(firstNonEmptyLine));
""" + "                    \n"
if source.count(trim_leading) != 2 or source.count("trimmedOutput") != 4:
    raise RuntimeError("Upstream console output formatting changed")
source = source.replace(trim_leading, "").replace("trimmedOutput", "outputText")
source = replace_once(source, ";'>{escaped}</pre>", r";'>\n{escaped}</pre>")

console.write_text(console_source, encoding="utf-8")

if runtime == "10":
    source = source.replace("Basic.Reference.Assemblies.Net90", "Basic.Reference.Assemblies.Net100")
    project = csproj.read_text(encoding="utf-8")
    versions = {
        "<TargetFramework>net9.0</TargetFramework>": "<TargetFramework>net10.0</TargetFramework>",
        'Basic.Reference.Assemblies.Net90" Version="1.8.3"': 'Basic.Reference.Assemblies.Net100" Version="1.8.15"',
        'Microsoft.AspNetCore.Components.WebAssembly" Version="9.0.10"': 'Microsoft.AspNetCore.Components.WebAssembly" Version="10.0.13"',
        'Microsoft.AspNetCore.Components.WebAssembly.DevServer" Version="9.0.10"': 'Microsoft.AspNetCore.Components.WebAssembly.DevServer" Version="10.0.13"',
        'Microsoft.CodeAnalysis.Common" Version="4.14.0"': 'Microsoft.CodeAnalysis.Common" Version="5.12.0"',
        'Microsoft.CodeAnalysis.CSharp" Version="4.14.0"': 'Microsoft.CodeAnalysis.CSharp" Version="5.12.0"',
    }
    for old, new in versions.items():
        if project.count(old) != 1:
            raise RuntimeError("Cannot upgrade unknown csproj token: " + old)
        project = project.replace(old, new)
    csproj.write_text(project, encoding="utf-8")

razor.write_text(source, encoding="utf-8")
index = html.read_text(encoding="utf-8")
if '<base href="/" />' not in index:
    raise RuntimeError("Unexpected upstream <base>")
index = index.replace('<base href="/" />', '<base href="./" />')
in_head = '''<link rel="stylesheet" href="../assets/vendor/codemirror/lib/codemirror.css" />
<link rel="stylesheet" href="../assets/vendor/codemirror/addon/hint/show-hint.css" />'''
before_framework = '''<script src="../assets/vendor/codemirror/lib/codemirror.js"></script>
<script src="../assets/vendor/codemirror/mode/clike/clike.js"></script>
<script src="../assets/vendor/codemirror/addon/hint/show-hint.js"></script>
<script src="../assets/vendor/codemirror/addon/edit/matchbrackets.js"></script>
<script src="../assets/vendor/codemirror/addon/edit/closebrackets.js"></script>
<script src="../assets/js/compiler-editor.js"></script>'''
if "</head>" not in index or '<script src="_framework/blazor.webassembly.js"></script>' not in index:
    raise RuntimeError("Unexpected upstream index.html")
index = index.replace("</head>", in_head + "\n</head>")
index = index.replace('<script src="_framework/blazor.webassembly.js"></script>', before_framework + '\n<script src="_framework/blazor.webassembly.js"></script>')
html.write_text(index, encoding="utf-8")
print("Prepared C# " + ("13" if runtime == "9" else "14") + " / .NET " + runtime + " compiler.")
