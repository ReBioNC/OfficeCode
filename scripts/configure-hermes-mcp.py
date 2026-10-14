"""Update only OfficeCode's MCP entry in a Hermes profile, preserving other keys."""
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import yaml


def configure(home, entry):
    file = Path(home) / "config.yaml"
    try:
        config = yaml.safe_load(file.read_text(encoding="utf-8")) or {} if file.exists() else {}
    except (OSError, yaml.YAMLError):
        raise ValueError("Hermes config cannot be parsed. Fix config.yaml before installing.") from None
    if not isinstance(config, dict) or not isinstance(config.get("mcp_servers", {}), dict):
        raise ValueError("Hermes mcp_servers must be a mapping; existing settings were preserved.")
    servers = config.setdefault("mcp_servers", {})
    previous = servers.get("officecode")
    if previous is not None and (not isinstance(previous, dict) or not previous.get("officecodeManaged")):
        raise ValueError("An unmanaged MCP server named officecode already exists. Rename it before installing; it was preserved.")
    merged = dict(previous or {})
    merged.update({key: value for key, value in entry.items() if key not in ("timeout", "env")})
    if "env" in entry:
        old_env = merged.get("env", {})
        if not isinstance(old_env, dict):
            raise ValueError("OfficeCode MCP env must be a mapping; existing settings were preserved.")
        merged["env"] = dict(old_env, **entry["env"])
    merged.setdefault("timeout", entry.get("timeout", 15))
    if previous == merged:
        return
    servers["officecode"] = merged
    file.parent.mkdir(parents=True, exist_ok=True)
    if file.exists():
        shutil.copy2(file, file.with_name("config.yaml.officecode.bak"))
    descriptor, temporary = tempfile.mkstemp(prefix=".officecode-config-", dir=file.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            yaml.safe_dump(config, stream, sort_keys=False, allow_unicode=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, stat.S_IMODE(file.stat().st_mode) if file.exists() else 0o600)
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    try:
        configure(sys.argv[1], json.loads(sys.argv[2]))
    except (ValueError, OSError):
        print("OfficeCode MCP configuration failed. Check config.yaml and any existing unmanaged officecode MCP entry.", file=sys.stderr)
        sys.exit(1)
    print("OfficeCode MCP startup entry configured.")
