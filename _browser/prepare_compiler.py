"""Adapt the MIT-licensed MicrosoftLearning C# minor Blazor WASM compiler for lesson 001.
The compiler is built during GitHub Actions; no binary artifacts are committed.
"""
from pathlib import Path
import re

root = Path("_compiler_src/CSharpCompilerWasm")
razor = root / "Pages/Compiler.razor"
html = root / "wwwroot/index.html"
sample = Path("_browser/lesson001-program.cs").read_text(encoding="utf-8").strip()
literal = '@"' + sample.replace('"', '""') + '"'
source = razor.read_text(encoding="utf-8")

replacements = [
    (r'private string sourceCode = @".*?";(?=\s+private string sampleCode =)',
     "private string sourceCode = " + literal + ";"),
    (r'private string sampleCode = @".*?";(?=\s+private string output =)',
     "private string sampleCode = " + literal + ";"),
    (r'private bool showFullCode = false;',
     'private bool showFullCode = true;'),
]
for pattern, value in replacements:
    source, count = re.subn(pattern, lambda _: value, source, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError("Upstream compiler source changed; cannot safely patch: " + pattern)
razor.write_text(source, encoding="utf-8")

index = html.read_text(encoding="utf-8")
if '<base href="/" />' not in index:
    raise RuntimeError("Unexpected upstream index.html base element")
index = index.replace('<base href="/" />', '<base href="./" />')
html.write_text(index, encoding="utf-8")
print("Prepared the MicrosoftLearning browser compiler for C# 13 / .NET 9.")
