import { StudentAccessHttpError } from "@/lib/student-access/http";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
};

const partFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string) {
  let formatter = partFormatterCache.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partFormatterCache.set(timeZone, formatter);
  }

  return formatter;
}

function getRequiredPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  const part = parts.find((entry) => entry.type === type)?.value;

  if (!part) {
    throw new Error(`Missing ${type} part for time zone conversion`);
  }

  return Number(part);
}

function getZonedDateTimeParts(date: Date, timeZone: string): DateTimeParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);

  return {
    year: getRequiredPart(parts, "year"),
    month: getRequiredPart(parts, "month"),
    day: getRequiredPart(parts, "day"),
    hour: getRequiredPart(parts, "hour"),
    minute: getRequiredPart(parts, "minute"),
    second: getRequiredPart(parts, "second"),
  };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date) {
  const zoned = getZonedDateTimeParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  const actualUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );

  return zonedAsUtc - actualUtc;
}

function zonedDateTimeToUtc(parts: DateTimeParts, timeZone: string) {
  const localUtcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let resolved = localUtcGuess;

  for (let index = 0; index < 4; index += 1) {
    const offsetMs = getTimeZoneOffsetMs(timeZone, new Date(resolved));
    const nextResolved = localUtcGuess - offsetMs;

    if (nextResolved === resolved) {
      break;
    }

    resolved = nextResolved;
  }

  return new Date(resolved);
}

function parseYearMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    throw new StudentAccessHttpError(400, "Please provide month in YYYY-MM format.");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) {
    throw new StudentAccessHttpError(400, "Please provide month in YYYY-MM format.");
  }

  return { year, month: monthNumber };
}

function parseLocalDate(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);

  if (!match) {
    throw new StudentAccessHttpError(400, "Please provide day in YYYY-MM-DD format.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayNumber = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, dayNumber));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== dayNumber
  ) {
    throw new StudentAccessHttpError(400, "Please provide day in YYYY-MM-DD format.");
  }

  return { year, month, day: dayNumber };
}

function shiftLocalDate(parts: DateParts, deltaDays: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function assertIanaTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new StudentAccessHttpError(400, "Please provide a valid IANA time zone.");
  }

  return timeZone;
}

export function getMonthUtcRange(month: string, timeZone: string) {
  const { year, month: monthNumber } = parseYearMonth(month);
  const start = zonedDateTimeToUtc(
    { year, month: monthNumber, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );

  const nextMonth =
    monthNumber === 12
      ? { year: year + 1, month: 1 }
      : { year, month: monthNumber + 1 };
  const end = zonedDateTimeToUtc(
    { year: nextMonth.year, month: nextMonth.month, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );

  return { start, end };
}

export function getLocalDayUtcRange(day: string, timeZone: string) {
  const parsed = parseLocalDate(day);
  const nextDay = shiftLocalDate(parsed, 1);
  const start = zonedDateTimeToUtc(
    { ...parsed, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const end = zonedDateTimeToUtc(
    { ...nextDay, hour: 0, minute: 0, second: 0 },
    timeZone,
  );

  return { start, end };
}

export function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = getZonedDateTimeParts(date, timeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
