#!/usr/bin/env python3
"""Build Foundry release zip and GitHub release module.json."""
import argparse, json, pathlib, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = ["module.json", "LICENSE", "README.md", "scripts/camp-exploration.mjs",
         "styles/camp-exploration.css", "templates/board.hbs"]
p = argparse.ArgumentParser()
p.add_argument("--repo", required=True)
p.add_argument("--version", default="0.1.0")
a = p.parse_args()
if a.repo.count("/") != 1 or " " in a.repo:
    p.error("--repo must be OWNER/REPO")
dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
manifest = json.loads((ROOT / "module.json").read_text())
manifest.update({
    "version": a.version,
    "url": f"https://github.com/{a.repo}",
    "manifest": f"https://github.com/{a.repo}/releases/latest/download/module.json",
    "download": f"https://github.com/{a.repo}/releases/latest/download/camp-exploration.zip"
})
content = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
(dist / "module.json").write_text(content)
with zipfile.ZipFile(dist / "camp-exploration.zip", "w", compression=zipfile.ZIP_DEFLATED) as z:
    for file in FILES:
        if file == "module.json":
            z.writestr("module.json", content)
        else:
            z.write(ROOT / file, file)
print(f"Created {dist/'camp-exploration.zip'} and {dist/'module.json'}")
