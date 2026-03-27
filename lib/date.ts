export function formatDateDMY(date?: Date | null, locale = "en-GB") {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    const iso = date.toISOString().slice(0, 10);
    const [year, month, day] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = months[Math.max(0, Number(month) - 1)] || month;
    return `${day} ${monthName} ${year}`;
  }
}

export function formatDateTimeDMY(date?: Date | null, locale = "en-GB") {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    const iso = date.toISOString();
    const [ymd, time] = iso.split("T");
    const [year, month, day] = ymd.split("-");
    const [hour, minute] = time.split(":");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = months[Math.max(0, Number(month) - 1)] || month;
    return `${day} ${monthName} ${year} ${hour}:${minute}`;
  }
}

const makeUtcDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

export function parseDateInput(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return makeUtcDate(Number(y), Number(m), Number(d));
  }

  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return makeUtcDate(Number(y), Number(m), Number(d));
  }

  return null;
}
