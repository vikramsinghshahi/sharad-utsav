import { localDateTimeIn, type IsoDate } from "./calendar";
import { firstFestivalDay, type Catalog, type FestivalDay } from "./catalog";

// "Now" in the event timezone. Built once per request from an injected clock.
export interface SaleClock {
  today: IsoDate;
  time: string; // "HH:MM:SS"
}

export function saleClock(timezone: string, now: Date): SaleClock {
  const { date, time } = localDateTimeIn(timezone, now);
  return { today: date, time };
}

// D9: a day sells until its same-day cutoff (6 pm); past days never sell.
export function isDayOnSale(day: FestivalDay, clock: SaleClock): boolean {
  if (day.date > clock.today) return true;
  return day.date === clock.today && clock.time < day.cutoffTime;
}

// D9: all-day passes stop selling once day 1 begins.
export function isAllDaysOnSale(catalog: Catalog, clock: SaleClock): boolean {
  return clock.today < firstFestivalDay(catalog);
}
