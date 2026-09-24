"""Check profile README/site asset references and build staging policy."""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).parent.parent
assets = {str(p.relative_to(ROOT)) for p in (ROOT / "assets").rglob("*") if p.is_file()}
readme = (ROOT / "README.md").read_text(encoding="utf-8")
site_parts = []
for rel in ("index.html", "404.html", "projects/index.html", "blog/index.html", "styles.css", "script.js"):
    p = ROOT / rel
    if p.exists():
        site_parts.append(p.read_text(encoding="utf-8"))
site = "\n".join(site_parts)
refs = set(re.findall(r'(?:src|href)=[\"\']\./(assets/[^\"\']+)', readme))
refs |= set(re.findall(r'(?:src|href)=[\"\'](?:https?://[^\"\']*/)?(assets/[^\"\']+)', site))
missing = sorted(ref for ref in refs if ref not in assets)
published = (ROOT / "scripts/build-site.mjs").read_text(encoding="utf-8")
body = published.split("PUBLISHED = [", 1)[1].split("]", 1)[0]
ok = bool(refs) and not missing and '"assets/site"' in body and '"assets/readme"' not in body
print("asset refs consistent", ok, "missing", missing)
assert ok
