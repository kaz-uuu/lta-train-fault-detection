"""Check the dashboard palette against WCAG contrast thresholds.

Reads frontend/src/styles/tokens.css, so the check can't drift from the tokens
the app actually uses. Exits non-zero if any pair fails.

    python scripts/check_contrast.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

TOKENS = Path(__file__).resolve().parents[1] / "frontend/src/styles/tokens.css"

TEXT, GRAPHIC = 4.5, 3.0
SURFACES = ("bg", "surface-1", "surface-2")

# (foreground, background, threshold, what it is)
PAIRS = (
    [(fg, bg, TEXT, "text") for fg in ("text", "text-2", "p1-ink", "p2-ink", "p3-ink", "dq-ink") for bg in SURFACES]
    + [(fg, bg, 3.0, "tertiary text") for fg in ("text-3",) for bg in SURFACES]
    + [(fg, bg, GRAPHIC, "normal-state glyph") for fg in ("ink-normal",) for bg in SURFACES]
    + [(fg, bg, GRAPHIC, "chart line") for fg in ("chart-line",) for bg in SURFACES]
    + [
        ("p1-on", "p1-fill", TEXT, "label on P1 fill"),
        ("p2-on", "p2-fill", TEXT, "label on P2 fill"),
        ("act-on", "act-fill", TEXT, "label on action fill"),
        ("on-bone", "bone", TEXT, "label on inverse fill"),
    ]
    # state shapes are drawn as fill + ink outline; the outline must carry them
    + [(fg, bg, GRAPHIC, "state shape outline") for fg in ("p1-ink", "p2-ink", "p3-ink") for bg in SURFACES]
)


def parse(css: str) -> dict[str, dict[str, str]]:
    blocks = {}
    for name, body in re.findall(r"(:root(?:\[data-theme=\"\w+\"\])?)\s*\{(.*?)\}", css, re.S):
        theme = "light" if "light" in name else "dark"
        blocks[theme] = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;", body))
    # light inherits anything it doesn't redefine
    blocks["light"] = {**blocks["dark"], **blocks.get("light", {})}
    return blocks


def luminance(hex_: str) -> float:
    rgb = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main() -> int:
    themes = parse(TOKENS.read_text())
    failures = 0
    for theme, tokens in themes.items():
        print(f"\n{theme}")
        for fg, bg, need, what in PAIRS:
            if fg not in tokens or bg not in tokens:
                print(f"  MISSING  --{fg} / --{bg}")
                failures += 1
                continue
            r = ratio(tokens[fg], tokens[bg])
            ok = r >= need
            failures += not ok
            if not ok or "-v" in sys.argv:
                print(f"  {'ok  ' if ok else 'FAIL'} {r:5.2f} >= {need}  --{fg} on --{bg}  ({what})")
        print(f"  {sum(1 for _ in PAIRS)} pairs checked")
    print("\nall pairs pass" if not failures else f"\n{failures} failing pairs")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
