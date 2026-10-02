export function connectionStatus(info: { server: boolean; stream: boolean; fresh: boolean; managed: boolean; leases: number; active: number; attempted: boolean }) {
  if (!info.attempted) return { state: "offline", text: "Connecting…" };
  if (!info.server) return { state: "offline", text: "Server unavailable · reopen OpenCode" };
  if (info.managed && info.leases === 0) return { state: "offline", text: "OpenCode disconnected" };
  if (!info.stream) return { state: "offline", text: "Reconnecting live feed…" };
  if (!info.fresh) return { state: "offline", text: "Data out of sync · retrying" };
  return { state: "online", text: info.active ? `Live · ${info.active} agents working` : info.managed ? "OpenCode connected · idle" : "Preview server · idle" };
}
