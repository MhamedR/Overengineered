import { describe, expect, it } from "vitest";
import { extractFacts, nonBlankLineCount } from "../src/parse/extract";
import type { Facts } from "../src/types";
import { loggerSource } from "./fixtures/logger";

function references(facts: Facts, name: string): number {
  return facts.references.filter((reference) => reference.name === name).length;
}

describe("extractFacts", () => {
  it("parses the logger sample into structural facts", () => {
    const facts = extractFacts(loggerSource, "logger.ts", "typescript");

    expect(facts.language).toBe("typescript");
    expect(facts.linesOfCode).toBe(nonBlankLineCount(loggerSource));
    expect(facts.interfaces.map((item) => item.name)).toEqual(["Logger"]);
    expect(facts.interfaces[0]?.members).toEqual(["log"]);
    expect(facts.classes.map((cls) => cls.name)).toEqual(["ConsoleLogger", "LoggerFactory", "LoggingService"]);

    const consoleLogger = facts.classes[0];
    expect(consoleLogger?.implements).toEqual([{ name: "Logger", typeArguments: [] }]);
    expect(consoleLogger?.methods[0]).toMatchObject({
      name: "log",
      body: "forward-call",
      callee: "console.log",
    });

    const factory = facts.classes[1];
    expect(factory?.methods[0]).toMatchObject({
      name: "create",
      body: "return-new",
      callee: "ConsoleLogger",
    });
    expect(facts.constructions).toEqual([
      expect.objectContaining({ caller: "LoggerFactory.create", typeName: "ConsoleLogger" }),
    ]);

    const service = facts.classes[2];
    expect(service?.constructorParameters).toEqual([
      expect.objectContaining({
        name: "logger",
        typeText: "Logger",
        countsAsDependency: true,
        parameterProperty: true,
      }),
    ]);
    expect(service?.methods.map((method) => method.name)).toEqual(["constructor", "log"]);
    expect(service?.methods[1]).toMatchObject({
      body: "forward-call",
      callee: "this.logger.log",
    });

    expect(facts.callSites).toEqual([
      expect.objectContaining({ caller: "ConsoleLogger.log", callee: "console.log", kind: "other" }),
      expect.objectContaining({ caller: "LoggingService.log", callee: "this.logger.log", kind: "other" }),
    ]);
    expect(references(facts, "Logger")).toBe(3);
    expect(references(facts, "ConsoleLogger")).toBe(1);
    expect(facts.structuralStatements).toBe(4);
    expect(facts.behavioralStatements).toBe(1);
  });

  it("distinguishes forwarding, transformed calls, and extra statements", () => {
    const facts = extractFacts(
      `class Box {
        pass(message: string) {
          return (this.service.pass(message));
        }
        change(message: string) {
          return this.service.pass(message.trim());
        }
        prepare(message: string) {
          this.ready();
          return this.service.pass(message);
        }
      }`,
      "box.ts",
      "typescript",
    );

    const methods = facts.classes[0]?.methods ?? [];
    expect(methods.map((method) => method.body)).toEqual(["forward-call", "transformed-call", "other"]);
  });

  it("records generic declarations and concrete instantiations", () => {
    const facts = extractFacts(
      `interface Repository<T, TOptions> {
        get(id: string): T;
      }
      type UserRepository = Repository<User, UserOptions>;
      function make<T>(value: T): T {
        return value;
      }
      const user = make<User>(null as unknown as User);
      `,
      "repo.ts",
      "typescript",
    );

    expect(facts.interfaces[0]?.typeParameters).toEqual(["T", "TOptions"]);
    expect(facts.functions[0]?.typeParameters).toEqual(["T"]);
    expect(facts.instantiations).toEqual([
      expect.objectContaining({ name: "Repository", typeArguments: ["User", "UserOptions"] }),
      expect.objectContaining({ name: "make", typeArguments: ["User"] }),
    ]);
  });

  it("records a function whose body only constructs one type", () => {
    const facts = extractFacts(
      `export const createPayment = () => new StripePayment();`,
      "pay.ts",
      "typescript",
    );

    expect(facts.functions[0]).toMatchObject({
      name: "createPayment",
      exported: true,
      body: "return-new",
      callee: "StripePayment",
    });
    expect(facts.constructions.map((construction) => construction.typeName)).toEqual(["StripePayment"]);
  });

  it("parses JavaScript classes and TSX functions", () => {
    const javascript = extractFacts(
      `class Box {
        constructor(value) { this.value = value; }
        get() { return this.value; }
      }`,
      "box.js",
      "javascript",
    );
    expect(javascript.language).toBe("javascript");
    expect(javascript.classes[0]?.constructorParameters[0]?.countsAsDependency).toBe(false);

    const tsx = extractFacts(`function Button() {\n  return <div />;\n}\n`, "Button.tsx", "typescriptreact");
    expect(tsx.language).toBe("typescript");
    expect(tsx.functions.map((fn) => fn.name)).toEqual(["Button"]);
  });

  it("keeps going when the source has a syntax error", () => {
    expect(() => extractFacts("class {", "broken.ts", "typescript")).not.toThrow();
  });

  it("records decorators, abstract classes, and exported names", () => {
    const facts = extractFacts(
      `@Injectable()
      abstract class Base {}
      class Child extends Base {}
      class Foo {}
      export { Foo };
      `,
      "di.ts",
      "typescript",
    );

    expect(facts.classes[0]).toMatchObject({ name: "Base", abstract: true, decorators: ["Injectable"] });
    expect(facts.classes[1]?.extends).toEqual({ name: "Base", typeArguments: [] });
    expect(facts.classes[2]).toMatchObject({ name: "Foo", exported: true });
  });

  it("counts branches in cyclomatic complexity", () => {
    const facts = extractFacts(
      `function f(x: number) {
        if (x > 0 && x < 10) {
          return x;
        }
        return 0;
      }
      function g(x: number) {
        switch (x) {
          case 1:
            return 1;
          case 2:
            return 2;
          default:
            return 0;
        }
      }`,
      "branches.ts",
      "typescript",
    );

    expect(facts.functions[0]).toMatchObject({ cyclomaticComplexity: 3, structuralStatements: 1, behavioralStatements: 2 });
    expect(facts.functions[1]?.cyclomaticComplexity).toBe(3);
  });
});
