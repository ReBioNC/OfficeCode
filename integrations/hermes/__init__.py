"""Native Hermes observers and an explicitly invoked OpenCode delegation tool."""
import atexit
from collections import deque
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
import shlex
import subprocess
import threading
import time
import urllib.request
import importlib.util

LOG = logging.getLogger(__name__)
HOOKS = (
    "on_session_start", "pre_llm_call", "post_llm_call", "on_session_end",
    "on_session_finalize", "on_session_reset", "pre_api_request", "api_request_error",
    "pre_tool_call", "post_tool_call", "subagent_start", "subagent_stop",
    "pre_approval_request", "post_approval_response",
)


def text(value, limit=160):
    return re.sub(r"[\r\n\t]+", " ", value)[:limit] if isinstance(value, str) else ""


def tool_activity(name, args):
    """Only forward a filename or an activity cue, never arguments/results."""
    name = text(name, 80).lower()
    args = args if isinstance(args, dict) else {}
    file = args.get("path") or args.get("file_path") or args.get("filePath")
    target = text(str(file).replace("\\", "/").rsplit("/", 1)[-1], 54) if isinstance(file, str) else ""
    if re.search(r"grep|glob|find|search_files|code_search|list_directory", name):
        return "code-search", "Searching code"
    if re.search(r"web|browse|fetch|search", name):
        return "web-search", "Searching the web"
    if re.search(r"edit|write|patch", name):
        return "editing", f"Editing {target}" if target else "Editing files"
    if re.search(r"read|view", name):
        return "reading", f"Reading {target}" if target else "Reading files"
    if re.search(r"terminal|shell|bash|exec|command", name):
        try:
            tokens = shlex.split(args.get("command", ""))
        except (ValueError, TypeError):
            tokens = []
        testing = bool(tokens and (tokens[0] in ("pytest", "vitest", "jest")
            or tokens[:2] == ["node", "--test"]
            or tokens[0] in ("npm", "pnpm", "yarn", "bun", "cargo", "go", "dotnet")
            and (tokens[1:2] == ["test"] or tokens[1:3] == ["run", "test"])))
        return "terminal", "Running tests" if testing else "Running commands"
    if re.search(r"delegate|agent|task", name):
        return "delegating", "Coordinating with agents"
    return "working", f"Using {text(name, 32)}"


class Observer:
    def __init__(self, emit):
        self.emit = emit
        self.sessions = {}
        self.lock = threading.RLock()
        self.counter = 0
        self.aliases = {}
        self.turns = {}

    def publish(self, sid, result=None):
        session = self.sessions[sid]
        tools = list(session["tools"].values())
        latest = tools[-1] if tools else None
        waiting = session.get("waiting", False)
        event = {k: session[k] for k in ("role", "prompt", "parentSessionId") if session.get(k)}
        event.update(sessionId=sid, state="waiting-approval" if waiting else "acting" if latest else "thinking",
            activity="approval" if waiting else latest["activity"] if latest else "thinking",
            detail="Waiting for permission" if waiting else latest["detail"] if latest else "Planning next steps",
            activeTools=[{k: v for k, v in tool.items() if k != "started"} for tool in tools][-64:])
        if result:
            event["toolResult"] = result
        self.emit(event)

    def finish(self, sid, outcome):
        if self.sessions.pop(sid, None) is not None:
            self.emit({"sessionId": sid, "outcome": outcome})
            self.aliases = {key: value for key, value in self.aliases.items() if value != sid}
            self.turns = {key: value for key, value in self.turns.items() if value != sid}

    def handle(self, event, **data):
        try:
            with self.lock:
                self._handle(event, data)
        except Exception:
            LOG.debug("OfficeCode observer unavailable", exc_info=True)
        # Never inject context, block tools, or alter host responses.
        return None

    def _handle(self, event, data):
        sid = text(data.get("session_id"), 200)
        turn = text(data.get("turn_id"), 400)
        canonical = self.turns.get(turn) or self.aliases.get(sid)
        if canonical and canonical in self.sessions:
            if sid:
                self.aliases[sid] = canonical
            sid = canonical
        if event in ("pre_approval_request", "post_approval_response"):
            sid = sid or self.aliases.get(text(data.get("session_key"), 200), text(data.get("session_key"), 200))
            if sid in self.sessions:
                self.sessions[sid]["waiting"] = event == "pre_approval_request"
                self.publish(sid)
            return
        if event == "subagent_start":
            sid = text(data.get("child_session_id"), 200)
            if not sid:
                return
            self.sessions[sid] = {"role": text(data.get("child_role"), 48) or "hermes",
                "prompt": text(data.get("child_goal"), 200) or "Delegated task",
                "parentSessionId": self.aliases.get(text(data.get("parent_session_id"), 200), text(data.get("parent_session_id"), 200)), "tools": {}}
            self.publish(sid)
            return
        if event == "subagent_stop":
            status = str(data.get("status") or data.get("child_status") or "").lower()
            child = text(data.get("child_session_id"), 200)
            self.finish(self.aliases.get(child, child), "blocked" if status in ("error", "failed", "cancelled", "interrupted", "timeout") else "done")
            return
        if event == "on_session_reset":
            sid = text(data.get("old_session_id"), 200) or sid
        if not sid:
            return
        if event in ("on_session_start", "pre_llm_call"):
            if sid not in self.sessions:
                self.sessions[sid] = {"role": "hermes", "prompt": "Hermes session", "tools": {}}
            if event == "pre_llm_call":
                self.sessions[sid]["prompt"] = text(data.get("user_message"), 200) or self.sessions[sid]["prompt"]
                if turn:
                    self.turns[turn] = sid
            self.publish(sid)
            return
        if sid not in self.sessions:
            return
        session = self.sessions[sid]
        if event in ("on_session_finalize", "on_session_reset"):
            for child in list(self.sessions):
                if self.sessions[child].get("parentSessionId") == sid:
                    self.finish(child, "blocked")
            self.finish(sid, "blocked")
        elif event == "on_session_end":
            # This is authoritative for both foreground and background delegates.
            failed = data.get("interrupted") or data.get("completed") is False
            self.finish(sid, "blocked" if failed else "done")
        elif event == "pre_tool_call":
            self.counter += 1
            key = text(data.get("tool_call_id"), 160) or f"anonymous-{self.counter}"
            name = text(data.get("tool_name"), 80) or "tool"
            activity, detail = tool_activity(name, data.get("args"))
            session["tools"][key] = dict(id=key, name=name, activity=activity, detail=detail, started=time.monotonic())
            self.publish(sid)
        elif event == "post_tool_call":
            tools = session["tools"]
            key = text(data.get("tool_call_id"), 160) or next((k for k, t in tools.items() if t["name"] == data.get("tool_name")), "")
            tool = tools.pop(key, None)
            if tool:
                result = {k: v for k, v in tool.items() if k != "started"}
                duration = data.get("duration_ms")
                result.update(outcome="completed" if data.get("status", "ok") == "ok" else "error",
                    durationMs=max(0, duration) if isinstance(duration, (int, float)) and math.isfinite(duration) and duration >= 0 else round((time.monotonic() - tool["started"]) * 1000))
                self.publish(sid, result)
        elif event in ("pre_api_request", "api_request_error"):
            self.publish(sid)


def settings():
    try:
        config = json.loads((Path(__file__).parent / "office-dashboard.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        config = {}
    home = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))).resolve()
    return config, home


class Channel:
    """Coalesce pending session snapshots; never wait for network in a hook."""
    def __init__(self):
        self.pending = deque()
        self.condition = threading.Condition()
        self.child = None
        self.thread = None
        self.closed = False

    def emit(self, event):
        with self.condition:
            if self.closed:
                return
            if len(self.pending) >= 512:
                LOG.warning("OfficeCode observer queue is full")
                self.closed = True
                self.condition.notify()
                return
            # Coalesce only adjacent activity updates; preserve every turn boundary.
            if self.pending and self.pending[-1]["sessionId"] == event["sessionId"] and not self.pending[-1].get("outcome") and not event.get("outcome"):
                self.pending[-1] = event
            else:
                self.pending.append(event)
            if self.thread is None:
                self.thread = threading.Thread(target=self.run, name="officecode-observer", daemon=True)
                self.thread.start()
            self.condition.notify()

    def run(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.closed or self.pending)
                if self.closed:
                    if self.child and self.child.stdin:
                        self.child.stdin.close()
                    return
                event = self.pending.popleft()
            try:
                if self.child is None or self.child.poll() is not None:
                    config, home = settings()
                    root = Path(os.environ.get("OFFICECODE_ROOT") or config.get("root", ""))
                    bridge = root / "scripts/hermes-bridge.cjs"
                    if not bridge.is_file():
                        continue
                    env = dict(os.environ, OFFICECODE_HERMES_HOME=str(home), OFFICECODE_HERMES_PARENT_PID=str(os.getpid()))
                    if config.get("studioWorkspace") and not env.get("OFFICECODE_STUDIO_WORKSPACE"):
                        env["OFFICECODE_STUDIO_WORKSPACE"] = config["studioWorkspace"]
                    self.child = subprocess.Popen([os.environ.get("OFFICECODE_NODE") or config.get("node", "node"), str(bridge)],
                        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                self.child.stdin.write((json.dumps(event, ensure_ascii=True) + "\n").encode("utf-8"))
                self.child.stdin.flush()
            except (OSError, ValueError):
                LOG.debug("OfficeCode bridge unavailable", exc_info=True)

    def close(self):
        with self.condition:
            self.closed = True
            self.condition.notify()
        if self.child and self.child.stdin:
            try:
                self.child.stdin.close()
            except (OSError, ValueError):
                pass


def dashboard_command(_args=""):
    """Read a registration; this command never starts a server or agent."""
    config, home = settings()
    workspace = str(Path(os.environ.get("OFFICECODE_STUDIO_WORKSPACE") or config.get("studioWorkspace") or home).resolve())
    key = hashlib.sha256((workspace.lower() if os.name == "nt" else workspace).encode()).hexdigest()[:16]
    state = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / ".local/share"))) / "OfficeCode/projects" / key
    try:
        url = json.loads((state / "connection.json").read_text(encoding="utf-8"))["url"]
        if re.fullmatch(r"http://127\.0\.0\.1:[1-9][0-9]{0,4}", url) and int(url.rsplit(":", 1)[1]) <= 65535:
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    return None
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open(url + "/api/health", timeout=1) as response:
                info = json.loads(response.read(16_385))
            if info.get("ok") and info.get("service") == "officecode" and info.get("workspace") == workspace and info.get("activeLeases", 0) > 0:
                return f"Office dashboard → {url}\nHermes connected. Tasks and models run in Hermes."
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        pass
    return "Office dashboard is not running. Reopen Hermes CLI/Desktop and check the OfficeCode MCP connector."


def make_delegator(observer, channel):
    spec = importlib.util.spec_from_file_location(__name__ + ".delegation", Path(__file__).parent / "delegation.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    controller = module.Delegator(observer, channel, settings)
    controller.schema = module.SCHEMA
    return controller


def register(ctx):
    channel = Channel()
    observer = Observer(channel.emit)
    delegator = make_delegator(observer, channel)
    ctx.register_tool(name="officecode_delegate_opencode", toolset="officecode", schema=delegator.schema,
        handler=delegator, check_fn=delegator.available, description="Delegate a real task to OpenCode", emoji="🏢")
    for name in HOOKS:
        def callback(_event=name, **kwargs):
            return observer.handle(_event, **kwargs)
        ctx.register_hook(name, callback)
    ctx.register_command("office-dashboard", dashboard_command, description="Show the OfficeCode studio URL without running a model")
    atexit.register(channel.close)
    atexit.register(delegator.close)
