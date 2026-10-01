import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

function service(count: number, decorator = ""): string {
  const params = Array.from({ length: count }, (_, index) => `private dep${index}: Dep${index}`).join(", ");
  return `${decorator}class OrderService { constructor(${params}) {} }\n`;
}

describe("constructor dependency count", () => {
  it("reports a constructor above the default of five typed dependencies", () => {
    const [signal] = ofType(signalsFor(service(6)), "high-dependency-count");
    expect(signal).toMatchObject({
      severity: "low",
      confidence: 0.45,
      title: "Constructor takes many dependencies",
      clusterId: "dependency:OrderService",
    });
    expect(signal?.evidence[0]).toContain("6 typed constructor dependencies");
  });

  it("raises severity as the count climbs", () => {
    expect(ofType(signalsFor(service(8)), "high-dependency-count")[0]?.severity).toBe("medium");
    expect(ofType(signalsFor(service(10)), "high-dependency-count")[0]?.severity).toBe("high");
  });

  it("keeps a framework class at medium until the count is extreme", () => {
    const marked = ofType(signalsFor(service(10, "@Injectable()\n")), "high-dependency-count")[0];
    expect(marked?.severity).toBe("medium");
    expect(marked?.legitimateReasons.join(" ")).toContain("framework");
    expect(ofType(signalsFor(service(12, "@Injectable()\n")), "high-dependency-count")[0]?.severity).toBe("high");
  });

  it("honors a lower configured limit", () => {
    const [signal] = ofType(signalsFor(service(3), { settings: { maxDependencyCount: 2 } }), "high-dependency-count");
    expect(signal?.evidence[0]).toContain("The setting allows 2");
  });

  it("stays quiet at the limit and when parameters are primitives or options objects", () => {
    expect(ofType(signalsFor(service(5)), "high-dependency-count")).toEqual([]);
    const quiet = `
      class OrderService {
        constructor(
          private label: string,
          private retries: number,
          private enabled: boolean,
          private options: { debug: boolean },
          private hook: () => void,
          private orders: OrderStore,
        ) {}
      }
    `;
    expect(ofType(signalsFor(quiet), "high-dependency-count")).toEqual([]);
  });

  it("stays quiet for an untyped JavaScript constructor", () => {
    const source = "class Service { constructor(a, b, c, d, e, f) {} }\n";
    expect(ofType(signalsFor(source, { fileName: "service.js" }), "high-dependency-count")).toEqual([]);
  });
});
