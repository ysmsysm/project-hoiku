const japanDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  calendar: "gregory",
  era: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getJapanDateString(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }

  const parts = japanDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const era = parts.find((part) => part.type === "era")?.value;
  const yearNumber = year === undefined ? Number.NaN : Number(year);

  if (
    era !== "AD" ||
    !year ||
    !/^\d{1,4}$/.test(year) ||
    !Number.isInteger(yearNumber) ||
    yearNumber < 1 ||
    yearNumber > 9999 ||
    !month ||
    !/^\d{2}$/.test(month) ||
    !day ||
    !/^\d{2}$/.test(day)
  ) {
    throw new RangeError("Could not format date in Asia/Tokyo");
  }

  const normalizedYear = String(yearNumber).padStart(4, "0");
  return `${normalizedYear}-${month}-${day}`;
}
