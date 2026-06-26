export function formatTime(value: number): string {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(value: number): string {
  if (value < 1000) return `${Math.max(0, Math.round(value))}ms`;
  return `${Math.max(0, value / 1000).toFixed(1)}s`;
}
