/**
 * Timezone and Date Formatting Utilities for Smart Vault
 * Guarantees proper UTC parsing and formatting in the user's local timezone (Asia/Kolkata / IST, UTC+05:30).
 */

/**
 * Safely parses a UTC timestamp from backend API or DB into a JavaScript Date.
 * If the string lacks an explicit timezone offset, it appends 'Z' to treat it as UTC.
 */
export function parseUtcDate(dateInput: string | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

  let s = String(dateInput).trim();
  if (!s) return null;

  // Convert SQLite space-separated format "YYYY-MM-DD HH:MM:SS..." to ISO "YYYY-MM-DDTHH:MM:SS..."
  if (s.includes(" ") && !s.includes("T")) {
    s = s.replace(" ", "T");
  }

  // If no timezone offset is present (no trailing Z and no +HH:MM / -HH:MM), treat as UTC
  if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a timestamp into a full date and time string in Indian Standard Time (IST, UTC+05:30).
 * Example: "09 Oct 2026, 09:34:58 pm"
 */
export function formatDateTimeIST(dateInput: string | Date | null | undefined): string {
  const date = parseUtcDate(dateInput);
  if (!date) return "";

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * Formats a timestamp into time-only string in Indian Standard Time (IST, UTC+05:30).
 * Example: "09:34 pm"
 */
export function formatTimeIST(dateInput: string | Date | null | undefined): string {
  const date = parseUtcDate(dateInput);
  if (!date) return "";

  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
