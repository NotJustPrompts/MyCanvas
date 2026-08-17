/**
 * "Edited 5 minutes ago" style timestamps for the project list.
 * Falls back to the locale date once the edit is over a week old.
 */
export function relativeEditedTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return "Edited just now";
  }
  if (minutes < 60) {
    return `Edited ${String(minutes)} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Edited ${String(hours)} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Edited ${String(days)} ${days === 1 ? "day" : "days"} ago`;
  }
  return `Edited ${new Date(iso).toLocaleDateString()}`;
}
