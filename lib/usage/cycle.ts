type CycleInput = {
  activationTimestamp: Date;
  now?: Date;
};

export type UsageCycle = {
  startAt: Date;
  endAt: Date;
  key: string;
  anchorDay: number;
};

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function clampAnchorDay(anchorDay: number) {
  if (!Number.isFinite(anchorDay)) return 1;
  return Math.max(1, Math.min(28, Math.floor(anchorDay)));
}

export function addCalendarMonthUtcKeepingTime(input: Date, months: number) {
  const year = input.getUTCFullYear();
  const month = input.getUTCMonth();
  const day = input.getUTCDate();
  const hour = input.getUTCHours();
  const minute = input.getUTCMinutes();
  const second = input.getUTCSeconds();
  const ms = input.getUTCMilliseconds();

  const targetMonthAbsolute = month + months;
  const targetYear = year + Math.floor(targetMonthAbsolute / 12);
  const targetMonth = ((targetMonthAbsolute % 12) + 12) % 12;
  const maxDay = daysInUtcMonth(targetYear, targetMonth);
  const clampedDay = Math.min(day, maxDay);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay, hour, minute, second, ms));
}

export function computeUsageCycleKey(startAt: Date, endAt: Date) {
  return `${startAt.toISOString().slice(0, 10)}_to_${endAt.toISOString().slice(0, 10)}`;
}

export function computeCurrentUsageCycle(input: CycleInput): UsageCycle {
  const now = input.now ? new Date(input.now) : new Date();
  const activation = new Date(input.activationTimestamp);
  if (Number.isNaN(activation.getTime())) {
    throw new Error("Invalid activation timestamp");
  }

  let startAt = activation;
  let endAt = addCalendarMonthUtcKeepingTime(startAt, 1);
  while (endAt <= now) {
    startAt = endAt;
    endAt = addCalendarMonthUtcKeepingTime(startAt, 1);
  }
  return {
    startAt,
    endAt,
    key: computeUsageCycleKey(startAt, endAt),
    anchorDay: clampAnchorDay(activation.getUTCDate()),
  };
}

export function advanceUsageCycle(startAt: Date, endAt: Date, now?: Date): UsageCycle {
  const currentNow = now ? new Date(now) : new Date();
  let nextStart = new Date(startAt);
  let nextEnd = new Date(endAt);
  while (nextEnd <= currentNow) {
    nextStart = nextEnd;
    nextEnd = addCalendarMonthUtcKeepingTime(nextStart, 1);
  }
  return {
    startAt: nextStart,
    endAt: nextEnd,
    key: computeUsageCycleKey(nextStart, nextEnd),
    anchorDay: clampAnchorDay(nextStart.getUTCDate()),
  };
}

