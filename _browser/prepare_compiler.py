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
