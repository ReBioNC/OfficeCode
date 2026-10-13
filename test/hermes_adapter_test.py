"""Contract tests for the native Hermes observer; no model calls."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("officecode_test_adapter", ROOT / "integrations/hermes/__init__.py")


class HermesObserverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(cls.module)

    def setUp(self):
        home = tempfile.TemporaryDirectory(prefix="office-hermes-unit-")
        self.addCleanup(home.cleanup)
        env = patch.dict(os.environ, {"HERMES_HOME": home.name, "LOCALAPPDATA": home.name})
        env.start()
        self.addCleanup(env.stop)
        self.events = []
        self.observer = self.module.Observer(self.events.append)

    def invoke(self, event, **payload):
        self.assertIsNone(self.observer.handle(event, **payload))

    def test_turn_completion_and_resume(self):
        self.invoke("pre_llm_call", session_id="main", user_message="Build a feature")
        self.assertEqual(self.events[-1]["role"], "hermes")
        self.assertEqual(self.events[-1]["state"], "thinking")
        self.invoke("post_llm_call", session_id="main", assistant_response="PRIVATE OUTPUT")
        self.invoke("on_session_end", session_id="main", completed=True)
        self.assertEqual(self.events[-1]["outcome"], "done")
        self.assertEqual(len(self.events), 2)
        self.invoke("pre_llm_call", session_id="main", user_message="Continue")
        self.assertEqual(self.events[-1]["prompt"], "Continue")
        self.assertNotIn("PRIVATE OUTPUT", json.dumps(self.events))

    def test_parallel_tools_and_safe_activity_details(self):
        self.invoke("pre_llm_call", session_id="main", user_message="Work")
        self.invoke("pre_tool_call", session_id="main", tool_name="read_file", tool_call_id="read", args={"path": "C:/private/app.ts"})
        self.invoke("pre_tool_call", session_id="main", tool_name="terminal", tool_call_id="test", args={"command": "npm test --token=SECRET"})
        self.assertEqual(len(self.events[-1]["activeTools"]), 2)
        self.assertEqual(self.events[-1]["detail"], "Running tests")
        self.invoke("post_tool_call", session_id="main", tool_name="terminal", tool_call_id="test", status="ok", duration_ms=42, result="SECRET")
        self.assertEqual(self.events[-1]["state"], "acting")
        self.assertEqual(self.events[-1]["activeTools"][0]["activity"], "reading")
        self.assertEqual(self.events[-1]["toolResult"]["durationMs"], 42)
        self.assertNotIn("SECRET", json.dumps(self.events))
        self.assertNotIn("private", json.dumps(self.events))

    def test_delegation_more_than_four_children_and_outcomes(self):
        self.invoke("pre_llm_call", session_id="main", user_message="Feature")
        for i in range(8):
            self.invoke("subagent_start", parent_session_id="main", child_session_id=f"child-{i}", child_role="frontend-dev", child_goal="Implement UI")
        self.assertEqual(len(self.observer.sessions), 9)
        self.assertEqual(self.events[-1]["parentSessionId"], "main")
        self.invoke("pre_llm_call", session_id="child-7", user_message="Work")
        self.assertEqual(self.events[-1]["role"], "frontend-dev")
        self.invoke("subagent_stop", parent_session_id="main", child_session_id="child-7", status="error", child_summary="SECRET")
        self.assertEqual(self.events[-1]["outcome"], "blocked")
        self.assertNotIn("SECRET", json.dumps(self.events))

    def test_approval_interrupt_and_unrelated_events(self):
        self.invoke("pre_llm_call", session_id="main", user_message="Work")
        self.invoke("pre_tool_call", session_id="main", tool_call_id="shell", tool_name="terminal", args={})
        self.invoke("pre_approval_request", session_key="main", command="SECRET")
        self.assertEqual(self.events[-1]["state"], "waiting-approval")
        self.invoke("post_approval_response", session_key="main", choice="once")
        self.assertEqual(self.events[-1]["state"], "acting")
        self.invoke("on_session_end", session_id="main", completed=False, interrupted=True)
        self.assertEqual(self.events[-1]["outcome"], "blocked")
        count = len(self.events)
        self.invoke("post_tool_call", session_id="main", tool_name="terminal", tool_call_id="shell", status="cancelled")
        self.invoke("pre_approval_request", session_key="unknown", command="SECRET")
        self.assertEqual(len(self.events), count)

    def test_register_is_inert_and_returns_no_policy_or_context(self):
        class Context:
            hooks = {}
            commands = {}
            def register_hook(self, name, callback):
                self.hooks[name] = callback
            def register_command(self, name, callback, **kwargs):
                self.commands[name] = callback
        ctx = Context()
        self.module.register(ctx)
        self.assertIn("subagent_start", ctx.hooks)
        self.assertIn("office-dashboard", ctx.commands)
        self.assertIsNone(ctx.hooks["pre_tool_call"](session_id=None, tool_name="read_file", args={}, future_field=True))
        self.assertIn("not running", ctx.commands["office-dashboard"](""))

    def test_queue_keeps_finish_between_rapid_turns(self):
        channel = self.module.Channel()
        # A placeholder prevents starting subprocesses in this queue unit test.
        channel.thread = object()
        channel.emit({"sessionId": "same", "state": "thinking", "prompt": "First"})
        channel.emit({"sessionId": "same", "outcome": "done"})
        channel.emit({"sessionId": "same", "state": "thinking", "prompt": "Second"})
        channel.emit({"sessionId": "same", "outcome": "done"})
        self.assertEqual(len(channel.pending), 4)

    def test_compression_keeps_one_character_and_cleans_up(self):
        self.invoke("pre_llm_call", session_id="old", turn_id="turn-one", task_id="task-one", user_message="Work")
        self.invoke("pre_api_request", session_id="new", turn_id="turn-one", task_id="task-one")
        self.invoke("pre_tool_call", session_id="new", turn_id="turn-one", tool_call_id="read", tool_name="read_file", args={})
        self.assertEqual(self.events[-1]["sessionId"], "old")
        self.assertEqual(self.events[-1]["activity"], "reading")
        self.invoke("on_session_end", session_id="new", turn_id="turn-one", completed=True)
        self.assertEqual(self.events[-1]["outcome"], "done")
        self.assertEqual(len(self.observer.sessions), 0)

    def test_background_children_and_authoritative_failed_completion(self):
        self.invoke("pre_llm_call", session_id="root", user_message="Work")
        self.invoke("subagent_start", parent_session_id="root", child_session_id="async", child_goal="Background work")
        self.invoke("on_session_end", session_id="async", completed=True)
        self.assertNotIn("async", self.observer.sessions)
        self.invoke("post_llm_call", session_id="root", assistant_response="Iteration limit reached")
        self.invoke("on_session_end", session_id="root", completed=False)
        self.assertEqual(self.events[-1]["outcome"], "blocked")
        self.invoke("subagent_start", parent_session_id="root", child_session_id="timed")
        self.invoke("subagent_stop", child_session_id="timed", child_status="timeout")
        self.assertEqual(self.events[-1]["outcome"], "blocked")

    def test_native_approval_uses_turn_id_without_internal_session_id(self):
        self.invoke("pre_llm_call", session_id="internal", turn_id="turn", user_message="Work")
        self.invoke("pre_tool_call", session_id="internal", turn_id="turn", tool_call_id="shell", tool_name="terminal", args={})
        self.invoke("pre_approval_request", session_key="desktop-routing-key", turn_id="turn", tool_call_id="shell", command="SECRET")
        self.assertEqual(self.events[-1]["state"], "waiting-approval")
        self.invoke("post_approval_response", session_key="desktop-routing-key", turn_id="turn", choice="once")
        self.assertEqual(self.events[-1]["state"], "acting")


if __name__ == "__main__":
    unittest.main()
