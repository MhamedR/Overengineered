import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

describe("single strategy", () => {
  it("reports a strategy interface with one concrete class", () => {
    const signals = signalsFor(`
      interface PaymentStrategy { pay(): void }
      class CardStrategy implements PaymentStrategy { pay() {} }
    `);
    const [strategy] = ofType(signals, "single-strategy");
    expect(strategy).toMatchObject({
      severity: "medium",
      confidence: 0.45,
      title: "Strategy has only one implementation",
      clusterId: "abstraction:PaymentStrategy",
    });
    expect(strategy?.evidence[0]).toContain("CardStrategy");
    expect(ofType(signals, "single-implementation-interface")).toHaveLength(1);
    expect(ofType(signals, "single-implementation-interface")[0]?.clusterId).toBe(strategy?.clusterId);
  });

  it("reports a class named Strategy even when the interface is not", () => {
    const [signal] = ofType(
      signalsFor(`
        interface Permission { allow(): boolean }
        class RoleBasedPermissionStrategy implements Permission { allow() { return true; } }
      `),
      "single-strategy",
    );
    expect(signal?.evidence[0]).toContain("RoleBasedPermissionStrategy");
  });

  it("stays quiet when a plain interface has one implementation", () => {
    const signals = ofType(
      signalsFor(`
        interface Logger { log(message: string): void }
        class ConsoleLogger implements Logger { log(message: string) { console.log(message); } }
      `),
      "single-strategy",
    );
    expect(signals).toEqual([]);
  });

  it("stays quiet when two strategies exist", () => {
    const signals = ofType(
      signalsFor(`
        interface PaymentStrategy { pay(): void }
        class CardStrategy implements PaymentStrategy { pay() {} }
        class CashStrategy implements PaymentStrategy { pay() {} }
      `),
      "single-strategy",
    );
    expect(signals).toEqual([]);
  });
});
