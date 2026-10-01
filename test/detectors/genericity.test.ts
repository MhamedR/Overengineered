import { describe, expect, it } from "vitest";
import { buildProjectContext } from "../../src/projectContext";
import { extractFacts } from "../../src/parse/extract";
import { ofType, signalsFor } from "./helpers";

const sameArguments = `
  interface Repository<T, TOptions> { save(item: T, options: TOptions): void }
  type Users = Repository<User, UserOptions>;
  type Again = Repository<User, UserOptions>;
`;

describe("premature genericity", () => {
  it("reports a generic that is always instantiated the same way", () => {
    const [signal] = ofType(signalsFor(sameArguments), "unused-genericity");
    expect(signal).toMatchObject({
      severity: "low",
      confidence: 0.35,
      title: "Type parameters stay the same",
      clusterId: "generic:Repository",
    });
    expect(signal?.evidence[1]).toContain("<User, UserOptions>");
  });

  it("reports one type parameter that is repeated with the same argument", () => {
    const source = `
      function wrap<T>(value: T): T { return value; }
      const first = wrap<User>(user);
      const second = wrap<User>(other);
    `;
    const [signal] = ofType(signalsFor(source), "unused-genericity");
    expect(signal?.evidence[0]).toContain("1 type parameter");
  });

  it("raises confidence when a finished search still finds one argument list", () => {
    const source = "interface Repository<T, TOptions> { save(item: T, options: TOptions): void }\n";
    const files = [
      { fileName: "repo.ts", text: source },
      { fileName: "use.ts", text: "type Users = Repository<User, UserOptions>;\n" },
    ];
    const facts = extractFacts(source, "repo.ts", "typescript");
    const [signal] = ofType(
      signalsFor(source, { fileName: "repo.ts", context: buildProjectContext(facts, files) }),
      "unused-genericity",
    );
    expect(signal?.confidence).toBe(0.75);
  });

  it("stays quiet when two instantiations differ", () => {
    const source = `
      interface Repository<T, TOptions> { save(item: T, options: TOptions): void }
      type Users = Repository<User, UserOptions>;
      type Orders = Repository<Order, OrderOptions>;
    `;
    expect(ofType(signalsFor(source), "unused-genericity")).toEqual([]);
  });

  it("stays quiet when another file instantiates the generic differently", () => {
    const source = `
      interface Repository<T, TOptions> { save(item: T, options: TOptions): void }
      type Users = Repository<User, UserOptions>;
    `;
    const files = [
      { fileName: "repo.ts", text: source },
      { fileName: "orders.ts", text: "type Orders = Repository<Order, OrderOptions>;\n" },
    ];
    const facts = extractFacts(source, "repo.ts", "typescript");
    expect(
      ofType(signalsFor(source, { fileName: "repo.ts", context: buildProjectContext(facts, files) }), "unused-genericity"),
    ).toEqual([]);
  });

  it("stays quiet when the only use passes the type parameters through", () => {
    const source = `
      interface Box<T> { value: T }
      class NamedBox<T> implements Box<T> { value!: T }
    `;
    expect(ofType(signalsFor(source), "unused-genericity")).toEqual([]);
  });

  it("stays quiet when no explicit instantiation was found", () => {
    const source = "interface Repository<T, TOptions, TContext> { save(item: T): void }\n";
    expect(ofType(signalsFor(source, { context: { partial: false } }), "unused-genericity")).toEqual([]);
  });
});
