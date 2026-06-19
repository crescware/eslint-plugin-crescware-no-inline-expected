import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const oxlintBin = resolve(repoRoot, "node_modules/.bin/oxlint");
const fixturesDir = resolve(repoRoot, "fixtures");
// The deliberately-violating case files live in subdirectories of their own, so
// the project's own lint can ignore just those directories while still applying
// this rule to this test harness. The harness therefore obeys the rule for
// real: every assertion declares its expected value in a named `const` first and
// passes that variable to `toEqual`, never an inline literal. The inline-literal
// cases and the declaration-order cases are kept apart so the per-config
// diagnostic counts stay easy to account for.
const casesDir = resolve(fixturesDir, "cases");
const orderCasesDir = resolve(fixturesDir, "order-cases");
const defaultConfig = resolve(fixturesDir, "oxlintrc.default.json");
const matchersConfig = resolve(fixturesDir, "oxlintrc.matchers.json");
const orderOffConfig = resolve(fixturesDir, "oxlintrc.order-off.json");

type Diagnostic = {
  message: string;
  filename: string;
  severity: string;
};

type OxlintReport = { diagnostics: Diagnostic[] };

const runFixtures = (configPath: string, targetDir: string): Diagnostic[] => {
  const result = spawnSync(
    oxlintBin,
    ["-c", configPath, "--no-ignore", "-f", "json", resolve(targetDir) + "/"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (result.error !== undefined && result.error !== null) {
    throw result.error;
  }
  const parsed = JSON.parse(result.stdout ?? "") as OxlintReport;
  return parsed.diagnostics;
};

const messagesFor = (diagnostics: Diagnostic[], filename: string): string[] => {
  return diagnostics
    .filter((v) => v.filename.endsWith(`/${filename}`))
    .map((v) => v.message);
};

// Must match the message generators in src/index.ts exactly.
const objectMessage = (matcher: string): string => {
  return `Inline object literal passed to '${matcher}'. Declare the expected value as a variable first: write 'const expected = { ... }; expect(actual).${matcher}(expected);' instead of passing the literal inline.`;
};

const arrayMessage = (matcher: string): string => {
  return `Inline array literal passed to '${matcher}'. Declare the expected value as a variable first: write 'const expected = [ ... ]; expect(actual).${matcher}(expected);' instead of passing the literal inline.`;
};

const orderMessage = (matcher: string): string => {
  return `The variable passed as the expected value to '${matcher}' is declared after the variable passed to 'expect(...)'. Declare the expected variable first, so the expected value is introduced before the value under test.`;
};

let defaultDiagnostics: Diagnostic[] = [];
let matchersDiagnostics: Diagnostic[] = [];
let orderDiagnostics: Diagnostic[] = [];
let orderOffDiagnostics: Diagnostic[] = [];

beforeAll(() => {
  const probe = spawnSync(oxlintBin, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error(`oxlint not runnable: ${probe.stderr ?? ""}`);
  }
  defaultDiagnostics = runFixtures(defaultConfig, casesDir);
  matchersDiagnostics = runFixtures(matchersConfig, casesDir);
  // The declaration-order check is on by default, so the default config drives
  // the order cases; the order-off config proves it can be disabled.
  orderDiagnostics = runFixtures(defaultConfig, orderCasesDir);
  orderOffDiagnostics = runFixtures(orderOffConfig, orderCasesDir);
});

const okFiles = ["ok-variable.ts", "ok-out-of-scope.ts"] satisfies string[];

describe("default options", () => {
  test("inline object literals are reported", () => {
    const expected = [objectMessage("toEqual"), objectMessage("toStrictEqual")];
    expect(messagesFor(defaultDiagnostics, "ng-object.ts")).toEqual(expected);
  });

  test("inline array literals are reported", () => {
    const expected = [arrayMessage("toEqual"), arrayMessage("toStrictEqual")];
    expect(messagesFor(defaultDiagnostics, "ng-array.ts")).toEqual(expected);
  });

  test("literals behind modifier chains are reported", () => {
    const expected = [
      objectMessage("toEqual"),
      objectMessage("toEqual"),
      objectMessage("toEqual"),
      objectMessage("toEqual"),
    ];
    expect(messagesFor(defaultDiagnostics, "ng-modifiers.ts")).toEqual(
      expected,
    );
  });

  test("literals wrapped in `as` / `satisfies` are reported", () => {
    const expected = [
      objectMessage("toEqual"),
      objectMessage("toEqual"),
      arrayMessage("toEqual"),
      objectMessage("toEqual"),
    ];
    expect(messagesFor(defaultDiagnostics, "ng-wrapped.ts")).toEqual(expected);
  });

  test("only the configured matcher fires for custom-matcher fixtures", () => {
    const expected = [objectMessage("toEqual")];
    const actual = messagesFor(defaultDiagnostics, "ng-custom-matchers.ts");
    expect(actual).toEqual(expected);
  });

  test("JavaScript files are in scope", () => {
    const expected = [objectMessage("toEqual")];
    expect(messagesFor(defaultDiagnostics, "ng-js.js")).toEqual(expected);
  });

  test("empty literals are reported", () => {
    const expected = [objectMessage("toEqual"), arrayMessage("toEqual")];
    expect(messagesFor(defaultDiagnostics, "ng-empty.ts")).toEqual(expected);
  });

  test.each(okFiles)("%s has no diagnostics", (file) => {
    const expected: string[] = [];
    expect(messagesFor(defaultDiagnostics, file)).toEqual(expected);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(defaultDiagnostics.length).toBe(16);
  });
});

describe("matchers: ['toMatchObject', 'toContainEqual']", () => {
  test("the configured matchers replace the default set", () => {
    const expected = [
      objectMessage("toMatchObject"),
      objectMessage("toContainEqual"),
    ];
    const actual = messagesFor(matchersDiagnostics, "ng-custom-matchers.ts");
    expect(actual).toEqual(expected);
  });

  test.each(["ng-object.ts", "ng-array.ts", "ng-empty.ts"])(
    "default-matcher fixture %s is no longer reported",
    (file) => {
      const expected: string[] = [];
      expect(messagesFor(matchersDiagnostics, file)).toEqual(expected);
    },
  );

  test.each(okFiles)("%s has no diagnostics", (file) => {
    const expected: string[] = [];
    expect(messagesFor(matchersDiagnostics, file)).toEqual(expected);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(matchersDiagnostics.length).toBe(2);
  });
});

describe("requireExpectedBeforeActual (on by default)", () => {
  test("an expected variable declared after the actual is reported", () => {
    const expected = [orderMessage("toEqual"), orderMessage("toStrictEqual")];
    expect(messagesFor(orderDiagnostics, "ng-order.ts")).toEqual(expected);
  });

  test("an expected variable declared first is allowed", () => {
    const expected: string[] = [];
    expect(messagesFor(orderDiagnostics, "ok-order.ts")).toEqual(expected);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(orderDiagnostics.length).toBe(2);
  });
});

describe("requireExpectedBeforeActual: false", () => {
  test("the declaration-order check stops reporting", () => {
    const expected: string[] = [];
    expect(messagesFor(orderOffDiagnostics, "ng-order.ts")).toEqual(expected);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(orderOffDiagnostics.length).toBe(0);
  });
});
