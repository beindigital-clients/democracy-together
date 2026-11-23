#!/usr/bin/env python3
"""Print the Cercle invitation letter and its annex to PDF.

    python3 design/lettre-cercle/build.py

For each language (lettre-fr.html, lettre-en.html) writes:
  - the letter followed by its annex, once per signatory (SIGNERS below) and
    once as a template with the signature left to fill in;
  - the annex alone, with its own short introduction, for KOHOP authors.

Uses Playwright's chrome-headless-shell when installed, else Google Chrome
(no Node dependency). Fonts come from Google Fonts, so a network connection is
needed. Set CHROME to another Chrome or Chromium binary if needed.
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "pdf"


def find_chrome() -> str:
    """CHROME if set, else Playwright's headless shell, else Google Chrome.

    Google Chrome's own headless mode fails in some sandboxed shells; the
    Playwright headless shell (installed by `pnpm exec playwright install`)
    does not."""
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    cache = Path.home() / "Library/Caches/ms-playwright"
    shells = sorted(cache.glob("chromium_headless_shell-*/*/chrome-headless-shell"))
    if shells:
        return str(shells[-1])
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


CHROME = find_chrome()
LANGS = ("fr", "en")
# Keys of the SIGNATAIRES table inside each HTML file.
SIGNERS = ("philippe-kourilsky", "abdou-samb")


def render(html: Path, query: str, out: Path) -> None:
    url = html.as_uri() + (f"?{query}" if query else "")
    subprocess.run(
        [
            CHROME,
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=15000",
            f"--print-to-pdf={out}",
            url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"  {out.relative_to(HERE)}")


def main() -> int:
    if not Path(CHROME).exists():
        print(f"Chrome not found at {CHROME}; set CHROME.", file=sys.stderr)
        return 1
    OUT.mkdir(exist_ok=True)
    for lang in LANGS:
        html = HERE / f"lettre-{lang}.html"
        print(lang)
        render(html, "", OUT / f"democracy-together-invitation-cercle-{lang}-modele.pdf")
        for key in SIGNERS:
            render(
                html,
                f"signe={key}",
                OUT / f"democracy-together-invitation-cercle-{lang}-{key}.pdf",
            )
        render(html, "mode=annexe", OUT / f"democracy-together-annexe-exemples-{lang}.pdf")
    return 0


if __name__ == "__main__":
    sys.exit(main())
