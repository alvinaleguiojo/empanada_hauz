import { AiDateTimeService } from "./ai-datetime.service";

describe("AiDateTimeService", () => {
  it("returns the current Manila date/time with ISO timestamp", () => {
    const service = new AiDateTimeService();
    const result = service.now();

    expect(result.timezone).toBe("Asia/Manila");
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
