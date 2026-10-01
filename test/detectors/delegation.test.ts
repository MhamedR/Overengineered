import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

describe("delegation-only methods", () => {
  it("reports a method that only forwards to a dependency", () => {
    const [signal] = ofType(
      signalsFor(`
        class LoggingService {
          log(message: string) {
            return this.logger.log(message);
          }
        }
      `),
      "delegation-only",
    );
    expect(signal).toMatchObject({
      severity: "medium",
      confidence: 0.45,
      title: "Method only forwards a call",
    });
    expect(signal?.evidence[0]).toContain("this.logger.log");
  });

  it("lowers severity when the forward satisfies an interface", () => {
    const [signal] = ofType(
      signalsFor(`
        interface Logger { log(message: string): void }
        class Service implements Logger {
          log(message: string) {
            return this.inner.log(message);
          }
        }
      `),
      "delegation-only",
    );
    expect(signal?.severity).toBe("low");
    expect(signal?.legitimateReasons.join(" ")).toContain("adapter");
  });

  it("stays quiet when the method changes arguments", () => {
    const signals = ofType(
      signalsFor(`
        class Service {
          log(message: string) {
            return this.logger.log(message.trim());
          }
        }
      `),
      "delegation-only",
    );
    expect(signals).toEqual([]);
  });

  it("stays quiet when the method does more than forward", () => {
    const signals = ofType(
      signalsFor(`
        class Service {
          log(message: string) {
            this.prepare();
            return this.logger.log(message);
          }
        }
      `),
      "delegation-only",
    );
    expect(signals).toEqual([]);
  });

  it("stays quiet for a direct console call and a same-object forward", () => {
    const signals = ofType(
      signalsFor(`
        class ConsoleLogger {
          log(message: string) { console.log(message); }
          a() { return this.b(); }
          b() { return 1; }
        }
      `),
      "delegation-only",
    );
    expect(signals).toEqual([]);
  });
});
