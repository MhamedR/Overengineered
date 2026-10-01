import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

const oneImplementation = `
interface Logger {
  log(message: string): void;
}
class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
}
`;

describe("single-implementation interface", () => {
  it("reports one implementation and keeps confidence limited without project context", () => {
    const [signal] = ofType(signalsFor(oneImplementation), "single-implementation-interface");
    expect(signal).toMatchObject({
      type: "single-implementation-interface",
      severity: "medium",
      confidence: 0.45,
      title: "Interface has only one implementation",
      clusterId: "abstraction:Logger",
    });
    expect(signal?.evidence[0]).toContain("ConsoleLogger");
    expect(signal?.legitimateReasons[0]).toContain("outside the analyzed code");
    expect(signal?.questions).toContain("Is another implementation expected?");
  });

  it("raises confidence when the surrounding project has been searched", () => {
    const [signal] = ofType(signalsFor(oneImplementation, { context: { partial: false } }), "single-implementation-interface");
    expect(signal?.confidence).toBe(0.75);
    expect(signal?.legitimateReasons.join(" ")).not.toContain("outside the analyzed code");
  });

  it("lowers severity for an exported interface", () => {
    const source = oneImplementation.replace("interface Logger", "export interface Logger");
    const [signal] = ofType(signalsFor(source), "single-implementation-interface");
    expect(signal?.severity).toBe("low");
    expect(signal?.legitimateReasons.join(" ")).toContain("public API");
  });

  it("uses the configured severity", () => {
    const [signal] = ofType(
      signalsFor(oneImplementation, { settings: { singleImplementationSeverity: "high" } }),
      "single-implementation-interface",
    );
    expect(signal?.severity).toBe("high");
  });

  it("stays quiet when a second implementation exists, including a test double", () => {
    const source = `${oneImplementation}
      class MockLogger implements Logger {
        log() {}
      }`;
    expect(ofType(signalsFor(source), "single-implementation-interface")).toEqual([]);
  });

  it("lowers severity when the implementation is marked for a framework", () => {
    const source = `
      interface Port { run(): void }
      @Injectable()
      class Adapter implements Port { run() {} }
    `;
    const [signal] = ofType(signalsFor(source), "single-implementation-interface");
    expect(signal?.severity).toBe("low");
    expect(signal?.legitimateReasons.join(" ")).toContain("framework");
  });
});
