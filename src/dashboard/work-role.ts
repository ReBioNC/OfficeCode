export interface WorkRoleSource {
  role: string;
  prompt: string;
  detail?: string;
}

const GENERIC_AGENTS = new Set(["opencode", "build", "general", "default", "agent"]);

function explicitRole(name: string): string | undefined {
  const value = name.toLowerCase().replace(/[_-]/g, " ").trim();
  if (/\b(frontend|front end)\b/.test(value)) return "Frontend";
  if (/\b(backend|back end)\b/.test(value)) return "Backend";
  if (/\b(auditor|reviewer|security)\b/.test(value)) return "Auditor";
  if (/\b(qa|tester|testing|quality)\b/.test(value)) return "QA";
  if (/\b(uiux|ui ux|designer)\b/.test(value)) return "UI/UX";
  if (/\b(database|db engineer)\b/.test(value)) return "Database";
  if (/\b(devops|infra)\b/.test(value)) return "DevOps";
  if (/\b(api)\b/.test(value)) return "API";
  if (/\b(docs|writer)\b/.test(value)) return "Documentation";
  if (/\b(researcher|explore)\b/.test(value)) return "Researcher";
  if (/\b(architect)\b/.test(value)) return "Architect";
  if (/\b(plan|pm)\b/.test(value)) return "Planner";
  if (/\b(debugger)\b/.test(value)) return "Debugger";
  return undefined;
}

function taskRole(value: string): string | undefined {
  const text = value.toLowerCase();
  if (/\b(audit|auditing|review|reviewing|security|keamanan|kerentanan)\b/.test(text)) return "Auditor";
  if (/\b(qa|test|tests|testing|tester|uji|pengujian)\b/.test(text)) return "QA";
  if (/ui\/ux|\b(desain|design|wireframe|figma)\b/.test(text)) return "UI/UX";
  const front = /\b(frontend|front.?end|antarmuka|komponen|components?|css|html|react|vue|svelte)\b|\.(tsx|jsx)\b/.test(text);
  const back = /\b(backend|back.?end|server|endpoints?|routes?|api|database|query|sql)\b/.test(text);
  if (front && back) return "Fullstack";
  if (front) return "Frontend";
  if (back) return "Backend";
  if (/\b(deploy|deployment|pipeline|docker|infra|infrastructure|ci)\b/.test(text)) return "DevOps";
  if (/\b(readme|dokumentasi|documentation|docs)\b/.test(text)) return "Documentation";
  if (/\b(riset|research|referensi)\b|mencari di web/.test(text)) return "Researcher";
  return undefined;
}

export function resolveWorkRole(run: WorkRoleSource, singleVisibleAgent: boolean): { label: string; source: "explicit" | "inferred" | "single-agent" | "default" } {
  const agentRole = explicitRole(run.role);
  if (agentRole) return { label: agentRole, source: "explicit" };
  const raw = run.role.trim();
  if (raw && !GENERIC_AGENTS.has(raw.toLowerCase())) return { label: raw.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), source: "explicit" };
  if (singleVisibleAgent) return { label: "Fullstack", source: "single-agent" };
  const task = taskRole(run.prompt) ?? taskRole(run.detail ?? "");
  if (task) return { label: task, source: "inferred" };
  return { label: "Developer", source: "default" };
}

export function displayWorkRole(run: WorkRoleSource, singleVisibleAgent: boolean): string {
  return resolveWorkRole(run, singleVisibleAgent).label;
}
