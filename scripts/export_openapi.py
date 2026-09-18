"""Write the API's OpenAPI spec to a file, for generating frontend types.

    python scripts/export_openapi.py frontend/openapi.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app import create_app  # noqa: E402

out = Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
spec = create_app().openapi()
out.write_text(json.dumps(spec, indent=2) + "\n")
print(f"wrote {out} ({len(spec['paths'])} paths, {len(spec['components']['schemas'])} schemas)")
