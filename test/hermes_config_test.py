import importlib.util
from pathlib import Path
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("officecode_config_test", ROOT / "scripts/configure-hermes-mcp.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ConfigTests(unittest.TestCase):
    def test_updates_owned_paths_but_keeps_other_servers_models_and_custom_settings(self):
        with tempfile.TemporaryDirectory(prefix="office-config-") as home:
            file = Path(home) / "config.yaml"
            original = {"model": "keep-model", "plugins": {"enabled": ["existing"]}, "mcp_servers": {
                "other": {"command": "keep-command"},
                "officecode": {"officecodeManaged": True, "command": "old-node", "args": ["old-script"],
                    "timeout": 30, "env": {"MY_PREFERENCE": "keep"}},
            }}
            file.write_text(yaml.safe_dump(original))
            entry = {"command": "new-node", "args": ["new-script"], "timeout": 15, "officecodeManaged": True, "env": {"HERMES_HOME": home}}
            module.configure(home, entry)
            result = yaml.safe_load(file.read_text())
            self.assertEqual(result["model"], "keep-model")
            self.assertEqual(result["plugins"], original["plugins"])
            self.assertEqual(result["mcp_servers"]["other"], original["mcp_servers"]["other"])
            self.assertEqual(result["mcp_servers"]["officecode"]["env"], {"MY_PREFERENCE": "keep", "HERMES_HOME": home})
            self.assertEqual(result["mcp_servers"]["officecode"]["timeout"], 30)
            self.assertEqual(result["mcp_servers"]["officecode"]["args"], ["new-script"])
            before = file.read_bytes()
            module.configure(home, entry)
            self.assertEqual(file.read_bytes(), before)

    def test_name_collision_preserves_original_config(self):
        with tempfile.TemporaryDirectory(prefix="office-config-") as home:
            file = Path(home) / "config.yaml"
            value = "mcp_servers:\n  officecode:\n    command: another-server\n"
            file.write_text(value)
            with self.assertRaises(ValueError):
                module.configure(home, {"command": "our-server", "officecodeManaged": True})
            self.assertEqual(file.read_text(), value)

    def test_invalid_yaml_is_not_replaced_or_exposed_in_errors(self):
        with tempfile.TemporaryDirectory(prefix="office-config-") as home:
            file = Path(home) / "config.yaml"
            value = "credential: [SECRET_VALUE"
            file.write_text(value)
            with self.assertRaises(ValueError) as error:
                module.configure(home, {})
            self.assertNotIn("SECRET_VALUE", str(error.exception))
            self.assertEqual(file.read_text(), value)


if __name__ == "__main__":
    unittest.main()
