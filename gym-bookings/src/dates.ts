import { Timestamp } from "spacetimedb";

// The hours the book is open: the first appointment starts at 9, the last at 17.
export const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

export const at = (day: Date, hour: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);

export const addDays = (day: Date, days: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);

export const startOfToday = () => at(new Date(), 0);

export const startOfWeek = (day: Date) =>
  addDays(day, -((day.getDay() + 6) % 7));

export const isAt = (startsAt: Timestamp, when: Date) =>
  startsAt.toDate().getTime() === when.getTime();

export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", options).format(date);
