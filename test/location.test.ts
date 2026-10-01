import { describe, expect, it } from "vitest";
import { isSignalLocation, locationHref, uniqueLocations } from "../src/ui/location";

describe("signal locations", () => {
  it("builds a command URI that carries the location as its argument", () => {
    const location = { fileName: "/src/orders.ts", name: "recordLoose", start: 40, end: 88 };
    expect(locationHref(location)).toBe(
      `command:overengineered.revealLocation?${encodeURIComponent(JSON.stringify([location]))}`,
    );
  });

  it("keeps the first location for each name", () => {
    expect(
      uniqueLocations([
        { fileName: "a.ts", name: "Logger", start: 0, end: 4 },
        { fileName: "a.ts", name: "ConsoleLogger", start: 10, end: 20 },
        { fileName: "a.ts", name: "Logger", start: 30, end: 40 },
      ]).map((location) => location.name),
    ).toEqual(["Logger", "ConsoleLogger"]);
  });

  it("accepts only complete location objects", () => {
    expect(isSignalLocation({ fileName: "a.ts", name: "f", start: 0, end: 1 })).toBe(true);
    expect(isSignalLocation({ fileName: "", name: "f", start: 0, end: 1 })).toBe(false);
    expect(isSignalLocation({ fileName: "a.ts", name: "f", start: 0 })).toBe(false);
    expect(isSignalLocation(undefined)).toBe(false);
  });
});
