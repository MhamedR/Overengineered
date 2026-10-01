import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

describe("single-product factory", () => {
  it("reports a factory class that constructs one type", () => {
    const [signal] = ofType(
      signalsFor(`
        class LoggerFactory {
          create(): Logger {
            return new ConsoleLogger();
          }
        }
      `),
      "single-product-factory",
    );
    expect(signal).toMatchObject({
      severity: "medium",
      confidence: 0.45,
      title: "Factory has only one product",
    });
    expect(signal?.evidence[0]).toContain("ConsoleLogger");
  });

  it("reports a create function that constructs one type", () => {
    const [signal] = ofType(
      signalsFor(`export const createPayment = () => new StripePayment();`),
      "single-product-factory",
    );
    expect(signal?.evidence[0]).toContain("StripePayment");
    expect(signal?.clusterId).toBe("factory:StripePayment");
  });

  it("stays quiet when the factory constructs two types", () => {
    const signals = ofType(
      signalsFor(`
        class PaymentFactory {
          create(kind: string) {
            if (kind === "card") return new StripePayment();
            return new CashPayment();
          }
        }
      `),
      "single-product-factory",
    );
    expect(signals).toEqual([]);
  });

  it("lowers confidence when the product interface already has another implementation", () => {
    const [signal] = ofType(
      signalsFor(`
        interface Payment { charge(): void }
        class StripePayment implements Payment { charge() {} }
        class CashPayment implements Payment { charge() {} }
        class PaymentFactory {
          create() { return new StripePayment(); }
        }
      `),
      "single-product-factory",
    );
    expect(signal?.confidence).toBe(0.35);
    expect(signal?.legitimateReasons.join(" ")).toContain("another implementation");
  });
});
