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
  if (/audit|review|security|keamanan|kerentanan/.test(text)) return "Auditor";
  if (/\bqa\b|\btest|uji|pengujian/.test(text)) return "QA";
  if (/ui\/ux|desain|design|wireframe|figma/.test(text)) return "UI/UX";
  const front = /frontend|front.?end|antarmuka|komponen|component|\.tsx?\b|\.jsx?\b|\bcss\b|\bhtml\b|\breact\b|\bvue\b|\bsvelte\b/.test(text);
  const back = /backend|back.?end|server|endpoint|route|\bapi\b|database|query|\bsql\b/.test(text);
  if (front && back) return "Fullstack";
  if (front) return "Frontend";
  if (back) return "Backend";
  if (/deploy|pipeline|docker|infra|\bci\b/.test(text)) return "DevOps";
  if (/readme|dokumentasi|documentation|\bdocs\b/.test(text)) return "Documentation";
  if (/riset|research|referensi|mencari di web/.test(text)) return "Researcher";
  return undefined;
}

export function displayWorkRole(run: WorkRoleSource, singleVisibleAgent: boolean): string {
  if (singleVisibleAgent) return "Fullstack";
  const agentRole = explicitRole(run.role);
  if (agentRole) return agentRole;
  const task = taskRole(run.prompt) ?? taskRole(run.detail ?? "");
  if (task) return task;
  const raw = run.role.trim();
  if (!raw || GENERIC_AGENTS.has(raw.toLowerCase())) return "Developer";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
