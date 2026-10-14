"""A native Hermes tool starts an isolated OpenCode CLI session."""
import json
import os
import queue
from pathlib import Path
import shutil
import subprocess
import threading

def is_interrupted():
    try:
        from tools.interrupt import is_interrupted as check
        return check()
    except ImportError:
        return False

TOOL_NAME = "officecode_delegate_opencode"
SCHEMA = {
    "name": TOOL_NAME,
    "description": "Delegate a specific task to a real OpenCode agent in an explicit workspace, and return its result. Uses OpenCode's configured model and permissions. Creates a real child session in OfficeCode.",
    "parameters": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "prompt": {"type": "string", "minLength": 1, "maxLength": 16000},
            "workspace": {"type": "string", "description": "Existing absolute working directory for the OpenCode task."},
            "agent": {"type": "string", "description": "Configured OpenCode agent; defaults to build.", "maxLength": 48},
            "role": {"type": "string", "description": "Optional display role, such as frontend-dev, backend-dev, or qa-engineer.", "maxLength": 48},
        }, "required": ["prompt", "workspace"],
    },
}


class Delegator:
    def __init__(self, observer, channel, settings):
        self.observer, self.channel, self.settings = observer, channel, settings
        self.capacity = threading.BoundedSemaphore(4)
        self.jobs = set()
        self.lock = threading.Lock()
        self.closed = False
        self.is_interrupted = is_interrupted

    def available(self):
        return bool(shutil.which(os.environ.get("OFFICECODE_OPENCODE_CLI", "opencode")))

    def __call__(self, args, **context):
        if not isinstance(args, dict):
            return json.dumps({"error": "invalid-input"})
        # session_id is supplied by Hermes registry dispatch, not the model schema.
        parent = context.get("session_id")
        with self.observer.lock:
            parent = self.observer.aliases.get(parent, parent)
            if not isinstance(parent, str) or parent not in self.observer.sessions:
                return json.dumps({"error": "parent-session-unavailable"})
        workspace = args.get("workspace")
        if not isinstance(workspace, str) or len(workspace) > 4096 or not Path(workspace).is_absolute() or not Path(workspace).is_dir():
            return json.dumps({"error": "invalid-workspace"})
        prompt = args.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16000:
            return json.dumps({"error": "invalid-prompt"})
        for key in ("agent", "role"):
            value = args.get(key)
            if value is not None and (not isinstance(value, str) or not value.strip() or len(value) > 48):
                return json.dumps({"error": "invalid-" + key})
        if self.closed or not self.capacity.acquire(blocking=False):
            return json.dumps({"error": "delegation-capacity", "message": "Four delegated jobs are already active, or this connector is closing."})
        child = None
        result = {"outcome": "blocked", "error": "worker-unavailable", "result": ""}
        try:
            config, _home = self.settings()
            root = Path(os.environ.get("OFFICECODE_ROOT") or config.get("root", ""))
            script = root / "scripts/delegate-opencode.cjs"
            if not script.is_file():
                return json.dumps(result)
            with self.lock:
                if self.closed:
                    return json.dumps({"outcome": "blocked", "error": "cancelled", "result": ""})
                child = subprocess.Popen([os.environ.get("OFFICECODE_NODE") or config.get("node", "node"), str(script)],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    env=dict(os.environ, OFFICECODE_HERMES_PARENT_PID=str(os.getpid())),
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                self.jobs.add(child)
            payload = {"prompt": prompt, "workspace": str(Path(workspace).resolve()),
                "agent": args.get("agent") or "build", "role": args.get("role") or args.get("agent") or "build",
                "parentSessionId": parent}
            child.stdin.write((json.dumps(payload, ensure_ascii=True) + "\n").encode("utf-8"))
            child.stdin.flush()
            lines = queue.Queue(maxsize=64)
            reader_stopped = threading.Event()
            def read_lines():
                try:
                    for line in child.stdout:
                        while not reader_stopped.is_set():
                            try:
                                lines.put(line, timeout=.1)
                                break
                            except queue.Full:
                                pass
                        if reader_stopped.is_set():
                            return
                finally:
                    while not reader_stopped.is_set():
                        try:
                            lines.put(None, timeout=.1)
                            break
                        except queue.Full:
                            pass
            reader = threading.Thread(target=read_lines, daemon=True)
            reader.start()
            interrupted = False
            while True:
                if not interrupted and self.is_interrupted():
                    interrupted = True
                    self.cancel(child)
                try:
                    line = lines.get(timeout=.1)
                except queue.Empty:
                    continue
                if line is None:
                    break
                if len(line) > 1_048_576:
                    self.cancel(child)
                    result = {"outcome": "blocked", "error": "worker-protocol-limit", "result": ""}
                    break
                message = json.loads(line)
                if message.get("kind") == "event":
                    event = message.get("event")
                    if isinstance(event, dict):
                        self.channel.emit(event)
                elif message.get("kind") == "result" and isinstance(message.get("result"), dict):
                    result = message["result"]
                    break
            child.wait(timeout=5)
            if interrupted:
                result = {"outcome": "blocked", "error": "cancelled", "result": "OpenCode delegation was cancelled."}
            return json.dumps(result, ensure_ascii=False)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            if child:
                self.cancel(child)
            return json.dumps({"outcome": "blocked", "error": "worker-unavailable", "result": ""})
        finally:
            if 'reader_stopped' in locals():
                reader_stopped.set()
            if child:
                with self.lock:
                    self.jobs.discard(child)
                for stream in (child.stdin, child.stdout):
                    if stream:
                        try:
                            stream.close()
                        except OSError:
                            pass
            self.capacity.release()

    @staticmethod
    def cancel(child):
        try:
            if child.poll() is None and child.stdin:
                child.stdin.write(b'{"kind":"cancel"}\n')
                child.stdin.flush()
        except (OSError, ValueError):
            pass

    def close(self):
        with self.lock:
            self.closed = True
            jobs = list(self.jobs)
        for job in jobs:
            self.cancel(job)
