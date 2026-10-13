# OpenCode and Hermes shared studio

## Approved intent

Support OpenCode alone, Hermes CLI/Desktop alone, and both at the same time.
Provide pasteable Hermes installation/update prompts like the OpenCode prompts.
Start the dashboard when the host opens, before the first prompt. Allow a Hermes
agent to delegate real work to OpenCode and receive its result. Clicking a
character must identify its runtime, role, task, activity, workspace, and parent.
Keep English product text and commit each implementation task on M3.

## Architecture

The existing loopback mirror sidecar remains a visual service. OpenCode retains
its global plugin. Hermes retains its native observer plugin, and gains a local
stdio MCP connector for application-start lifecycle and dashboard status. The
MCP connector and observer use the same connection registry and lease rules.

Delegation is a native Hermes tool, `officecode_delegate_opencode`, registered
through `PluginContext.register_tool`. It calls an OfficeCode worker that runs
the installed OpenCode CLI and consumes its JSON event stream. Native registration
provides access to Hermes's actual calling-session context; the installed MCP
client forwards tool arguments without that context, so the MCP server will not
guess an initiating session from the most recently active agent.

No Hermes/OpenCode core files, credentials, provider implementations, or tool
dispatch functions are replaced. The dashboard UI remains read-only. Delegation
is initiated through Hermes, outside the dashboard HTTP dispatch API.

## Independent hosts and startup

- OpenCode loads its existing global plugin and holds a dashboard lease.
- Hermes loads its configured stdio MCP connector during CLI/Desktop startup.
  Initialization starts or connects to the mirror sidecar and holds a lease
  without creating an agent, calling a model, or requiring OpenCode to be present.
- Hermes's observer continues to project real session/tool events. It shares the
  connector's studio selection and never starts a conversation itself.
- MCP stdout contains protocol responses only; diagnostics go to stderr.
- EOF, host exit, cancellation, and lease expiry stop the appropriate connector.
  A studio stays online while another live owner holds a lease. Closing one host
  must not finish the other host's sessions or stop its worker.
- CLI help/configuration/installer/validation commands must not leave an owned
  studio running. Normal startup is the idle, zero-agent case.
- Desktop scope is its managed local backend. Minimizing/hiding a window does
  not mean the backend has exited; separately managed gateways retain their own
  lifetime.

## Studio and workspace selection

OpenCode defaults to its actual project directory. Hermes defaults to its profile
directory because this installed observer API does not report Desktop workspace
folders. The installer supports an explicit shared studio workspace stored in
OfficeCode's own registration. When both hosts target that same resolved
workspace, they share one studio and independent leases. Other projects remain
separate. A configured studio identity must not be presented as proof that every
Hermes task has that working directory.

Delegation always requires an explicit existing absolute working directory.
The child runs there and appears alongside its verified Hermes parent in the
parent's studio. Its actual working directory remains visible in the inspector,
even when the parent studio is grouped by Hermes profile. Missing parent identity
returns a clear tool error instead of attaching a child to an unrelated session.

## Delegation contract

Tool inputs: `prompt` (nonempty, at most 16,000 characters), `workspace` (existing
absolute directory), optional `agent` (configured OpenCode agent; default `build`),
and optional `role` (bounded display label; does not create an OpenCode agent).
OpenCode's own model/provider configuration is used; no model override is added.

The worker starts `opencode run --format json --dir <workspace> --agent <agent>`
with the task supplied as input, using an argument array and no shell. It uses
neither `--auto` nor `--pure`, preserving the user's permission policy and other
plugins. A child-only OfficeCode environment flag suppresses duplicate OfficeCode
mirror publishing while the worker forwards that child's real events.

Thinking, tools, tool targets, completion/error, the actual OpenCode session ID,
and parent relationship are projected from observed events. Raw reasoning,
credentials, file contents, and arbitrary tool output do not become visual
telemetry. Final assistant text is returned to the requesting Hermes tool as the
delegation result, separately from dashboard telemetry.

The connector permits four concurrent delegated jobs. Additional requests return
a clear capacity response. Jobs time out after 600 seconds; cancellation/timeout
terminates their owned process tree and reports an incomplete outcome. Permission
denial, missing CLI, invalid agent, and nonzero exit are reported to Hermes; a
transport success alone is not task success. No approval is silently granted.
Individual JSON event lines are capped at 1 MiB, buffered output at 16 MiB per
job, and returned assistant text at 64,000 characters; any truncation is explicit. Restarted
sidecars are rehydrated from current observations without relaunching a job.

## Provenance and inspector

Mirror registration gains additive `runtime: "opencode" | "hermes"` and optional
`workspace` metadata. Server validation bounds strings and validates the runtime;
RunRecord and GET /api/runs carry these values. Existing records without explicit
provenance display `Unknown runtime`, rather than deriving the host from a role.
Workspace metadata is bounded to 4,096 characters and role labels to 48 characters.

Clicking a character, workstation, or crew card opens the existing inspector with:

- Runtime badge: OpenCode or Hermes.
- Display role and original configured/custom agent name.
- Original task text; observed current activity and active tool details.
- Actual working directory when supplied by the host; otherwise `Not provided`.
- State, elapsed time, and verified delegating parent/runtime when present.

A single generic agent remains Fullstack. Provenance badges also identify the
runtime in crew/delegation lists. Selected metadata updates live. Completed agents
leave the floor while their workflow/identity stays available in history. All text
uses safe DOM text rendering; existing keyboard alternatives and reduced motion
remain supported. The layout and optional relation lines are preserved.

## Installation and updates

`npm run install:hermes` installs the native observer and configures OfficeCode's
stdio MCP entry using the verified Node executable and permanent checkout path.
It preserves unrelated MCP servers, plugins, profiles, models, settings, and
credentials, backing up changed OfficeCode-managed files. Existing profile and
Windows Desktop/legacy home resolution remain supported. OpenCode is optional for
Hermes visualization; its executable is required only when delegation is invoked.

The installer offers explicit shared-studio selection and installs delegation
support without registering redundant tool schemas through MCP. Updates reuse
the verified checkout and profile. README includes short pasteable Hermes install
and update prompts, standalone/shared startup instructions, and delegation usage.
Full guide/privacy/API documentation explains lease ownership, explicit workspace
selection, runtime metadata, and the fact that delegated work uses OpenCode tokens.

## Acceptance and verification

1. Each host independently reaches an idle healthy dashboard before a task, with
   zero model requests and zero fake agents; closing it releases its lease.
2. Two owners of the same studio can close independently. Different workspaces
   retain distinct sessions, registrations, and sidecar lifetime.
3. An isolated Hermes startup fixture loads the MCP connector through the installed
   client; observer events and native tool identity retain correct correlation.
4. A deterministic fake OpenCode executable verifies argv/stdin, workspace, four
   concurrent jobs, parent links, JSON event mapping, results, failures, permissions,
   cancellation/timeout, and no duplicate mirror record. Fixture tests make no
   model requests. Real provider execution is reported separately if exercised.
5. Browser verification shows both runtime badges, inspected task/activity/workspace
   and parent, live updates, and completion removal; mobile and XSS contracts pass.
6. Installer/update tests preserve existing configuration and fail clearly on
   collisions or missing requirements. Startup/protocol logs cannot corrupt MCP.
7. Run npm run build and npm test before dashboard completion claims. For server
   changes, verify health/office/runs/queue/budgets and update README API contracts.

## Implementation boundaries

Build in three independently verifiable tasks: runtime provenance/inspector;
Hermes MCP startup/shared leases and installer prompts; native Hermes delegation
and real OpenCode worker. Reuse existing mirror history, animation, navigation,
and connection discovery. Commit each task on M3. Push/merge only when requested.

## Evidence used

- Installed Hermes: public PluginContext hook/tool APIs, tools/mcp_tool.py startup
  discovery and call_tool argument forwarding, gateway/session_context.py context
  access, and CLI/gateway startup code. No runtime monkey patches.
- Installed OpenCode run --help: --format json, --dir, --agent, permission mode,
  and pure/auto flags; the integration preserves normal plugin/permission behavior.
- Existing OfficeCode adapters, mirror contracts, leases, inspector, registry,
  installer preservation tests, and the 179-test baseline.
