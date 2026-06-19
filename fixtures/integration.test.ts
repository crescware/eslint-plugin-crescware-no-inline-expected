import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const oxlintBin = resolve(repoRoot, "node_modules/.bin/oxlint");
const fixturesDir = resolve(repoRoot, "fixtures");
// The case files live in a subdirectory so that linting them never picks up
// this test file, which is itself full of `expect(...).toEqual([...])` calls.
const casesDir = resolve(fixturesDir, "cases");
const defaultConfig = resolve(fixturesDir, "oxlintrc.default.json");
const emptyStrictConfig = resolve(fixturesDir, "oxlintrc.empty-strict.json");
const matchersConfig = resolve(fixturesDir, "oxlintrc.matchers.json");

type Diagnostic = {
  message: string;
  filename: string;
  severity: string;
};

type OxlintReport = { diagnostics: Diagnostic[] };

const runFixtures = (configPath: string): Diagnostic[] => {
  const result = spawnSync(
    oxlintBin,
    ["-c", configPath, "--no-ignore", "-f", "json", resolve(casesDir) + "/"],
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

let defaultDiagnostics: Diagnostic[] = [];
let emptyStrictDiagnostics: Diagnostic[] = [];
let matchersDiagnostics: Diagnostic[] = [];

beforeAll(() => {
  const probe = spawnSync(oxlintBin, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error(`oxlint not runnable: ${probe.stderr ?? ""}`);
  }
  defaultDiagnostics = runFixtures(defaultConfig);
  emptyStrictDiagnostics = runFixtures(emptyStrictConfig);
  matchersDiagnostics = runFixtures(matchersConfig);
});

const okFiles = ["ok-variable.ts", "ok-out-of-scope.ts"] satisfies string[];

describe("default options", () => {
  test("inline object literals are reported", () => {
    expect(messagesFor(defaultDiagnostics, "ng-object.ts")).toEqual([
      objectMessage("toEqual"),
      objectMessage("toStrictEqual"),
    ]);
  });

  test("inline array literals are reported", () => {
    expect(messagesFor(defaultDiagnostics, "ng-array.ts")).toEqual([
      arrayMessage("toEqual"),
      arrayMessage("toStrictEqual"),
    ]);
  });

  test("literals behind modifier chains are reported", () => {
    expect(messagesFor(defaultDiagnostics, "ng-modifiers.ts")).toEqual([
      objectMessage("toEqual"),
      objectMessage("toEqual"),
      objectMessage("toEqual"),
      objectMessage("toEqual"),
    ]);
  });

  test("literals wrapped in `as` / `satisfies` are reported", () => {
    expect(messagesFor(defaultDiagnostics, "ng-wrapped.ts")).toEqual([
      objectMessage("toEqual"),
      objectMessage("toEqual"),
      arrayMessage("toEqual"),
      objectMessage("toEqual"),
    ]);
  });

  test("only the configured matcher fires for custom-matcher fixtures", () => {
    expect(messagesFor(defaultDiagnostics, "ng-custom-matchers.ts")).toEqual([
      objectMessage("toEqual"),
    ]);
  });

  test("JavaScript files are in scope", () => {
    expect(messagesFor(defaultDiagnostics, "ng-js.js")).toEqual([
      objectMessage("toEqual"),
    ]);
  });

  test("empty literals are allowed by default", () => {
    expect(messagesFor(defaultDiagnostics, "ng-empty.ts")).toEqual([]);
  });

  test.each(okFiles)("%s has no diagnostics", (file) => {
    expect(messagesFor(defaultDiagnostics, file)).toEqual([]);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(defaultDiagnostics.length).toBe(14);
  });
});

describe("allowEmptyLiteral: false", () => {
  test("empty literals fall back to the standard messages", () => {
    expect(messagesFor(emptyStrictDiagnostics, "ng-empty.ts")).toEqual([
      objectMessage("toEqual"),
      arrayMessage("toEqual"),
    ]);
  });

  test("non-empty literals are reported as usual", () => {
    expect(messagesFor(emptyStrictDiagnostics, "ng-object.ts")).toEqual([
      objectMessage("toEqual"),
      objectMessage("toStrictEqual"),
    ]);
  });

  test.each(okFiles)("%s has no diagnostics", (file) => {
    expect(messagesFor(emptyStrictDiagnostics, file)).toEqual([]);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(emptyStrictDiagnostics.length).toBe(16);
  });
});

describe("matchers: ['toMatchObject', 'toContainEqual']", () => {
  test("the configured matchers replace the default set", () => {
    expect(messagesFor(matchersDiagnostics, "ng-custom-matchers.ts")).toEqual([
      objectMessage("toMatchObject"),
      objectMessage("toContainEqual"),
    ]);
  });

  test("default matchers no longer fire", () => {
    expect(messagesFor(matchersDiagnostics, "ng-object.ts")).toEqual([]);
    expect(messagesFor(matchersDiagnostics, "ng-array.ts")).toEqual([]);
    expect(messagesFor(matchersDiagnostics, "ng-modifiers.ts")).toEqual([]);
  });

  test.each(okFiles)("%s has no diagnostics", (file) => {
    expect(messagesFor(matchersDiagnostics, file)).toEqual([]);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(matchersDiagnostics.length).toBe(2);
  });
});
