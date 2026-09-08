import { Injectable } from "@nestjs/common";

const DEFAULT_TIME_ZONE = "Asia/Manila";

@Injectable()
export class AiDateTimeService {
  readonly timeZone = DEFAULT_TIME_ZONE;

  now() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const iso = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+08:00`;
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour}:${values.minute}:${values.second}`,
      timezone: this.timeZone,
      iso
    };
  }
}
