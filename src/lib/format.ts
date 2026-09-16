export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  // Corrupt/missing timestamps must never render as "NaNd" — treat as now.
  if (!Number.isFinite(t)) return "now";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
