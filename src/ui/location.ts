import { commands } from "../commands";
import type { SignalLocation } from "../types";

export function locationHref(location: SignalLocation): string {
  return `command:${commands.revealLocation}?${encodeURIComponent(JSON.stringify([location]))}`;
}

export function isSignalLocation(value: unknown): value is SignalLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  return (
    typeof location.fileName === "string" &&
    location.fileName.length > 0 &&
    typeof location.name === "string" &&
    typeof location.start === "number" &&
    Number.isFinite(location.start) &&
    typeof location.end === "number" &&
    Number.isFinite(location.end)
  );
}

export function uniqueLocations(locations: readonly SignalLocation[]): SignalLocation[] {
  const seen = new Set<string>();
  const unique: SignalLocation[] = [];
  for (const location of locations) {
    if (seen.has(location.name)) continue;
    seen.add(location.name);
    unique.push(location);
  }
  return unique;
}
