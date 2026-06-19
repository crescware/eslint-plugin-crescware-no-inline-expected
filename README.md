# @crescware/eslint-plugin-crescware-no-inline-expected

An [oxlint](https://oxc.rs/docs/guide/usage/linter) JS plugin that forbids passing an inline object or array literal as the expected value to an `expect(...)` matcher. Declare the expected value in a `const` variable first.

## Rule: `no-inline-expected`

When the expected value of an assertion is written inline as an object or array literal (`expect(actual).toEqual({ ... })` / `expect(actual).toStrictEqual([ ... ])`), extract it into a named variable. A named `expected` separates "what is being compared" from "what the answer should be", keeps the assertion line short, and gives the expected value a name to refer to.

```ts
// NG: an inline object literal as the expected value
expect(actual).toEqual({ id: 1, name: "Alice" });

// NG: an inline array literal as the expected value
expect(actual).toEqual([1, 2, 3]);

// NG: an empty literal is still an inline literal
expect(actual).toEqual({});
expect(actual).toEqual([]);

// OK: the expected value is declared first
const expected = { id: 1, name: "Alice" };
expect(actual).toEqual(expected);

// OK: a non-literal argument is out of scope
expect(actual).toEqual(buildExpected());
```

By default the rule also enforces that, inside a `test` / `it` callback, the expected variable is declared **first** — at the top of the callback. Only declarations of variables that the expected value uses may precede it, and even those may not be part of the value passed to `expect(...)`.

```ts
// NG: an unrelated variable is declared above expected
test("...", () => {
  const something = {};
  const expected = {};
  expect(something).toEqual(expected);
});

// NG: expected is aliased from the value under test
test("...", () => {
  const actual = { a: 1 };
  const expected = actual;
  expect(actual).toStrictEqual(expected);
});

// OK: expected is declared first
test("...", () => {
  const expected = {};
  const actual = {};
  expect(actual).toEqual(expected);
});

// OK: a variable used to build expected may precede it, as long as it is not
// the value under test
test("...", () => {
  const id = makeId();
  const expected = { id, name: "alice" };
  const actual = makeUser(id);
  expect(actual).toEqual(expected);
});
```

### Scope

The rule fires when **all** of the following hold for a call expression:

- The callee is a member access whose property is one of the configured `matchers` (default: `toEqual`, `toStrictEqual`).
- The receiver chain is anchored at an `expect(...)` call. Modifier chains are followed, so `expect(x).not.toEqual(...)`, `expect(x).resolves.toEqual(...)`, `expect(x).rejects.toEqual(...)`, and `expect.soft(x).toEqual(...)` are all in scope. An unrelated `foo.toEqual({ ... })` that is not anchored at `expect` is **not** reported.
- An argument is a plain object literal (`ObjectExpression`) or array literal (`ArrayExpression`), optionally wrapped in `as` / `satisfies` clauses (`{ ... } as Foo`, `[ ... ] as const`, `{ ... } satisfies T`, including multi-step chains such as `{ ... } as unknown as T`). The wrappers are unwrapped to classify the underlying literal.

Notes:

- Object and array literals are treated the same, including empty `{}` / `[]`.
- Every argument is inspected, so multi-argument matchers (e.g. a configured `toHaveBeenCalledWith`) report each inline literal.
- The rule applies to JavaScript (`.js` / `.mjs` / `.cjs` / `.jsx`) as well as TypeScript: it targets a runtime assertion call, not any TypeScript-only syntax.
- The expected-first check (on by default) only applies inside a `test` / `it` callback, and only when the expected value is a plain identifier declared directly in that callback. An expected value that is an inline literal, a call, or declared elsewhere (an outer scope, a parameter, an import) has no callback-top position to enforce and is left alone. Modifier and table forms (`it.only`, `test.each(table)(...)`) are recognized.
- Type-only declarations (`type` / `interface`) introduce no runtime value, so they are always allowed above the expected declaration, whether or not the expected value uses them.
- The rule does not autofix; it reports only.

### Options

```jsonc
"crescware-no-inline-expected/no-inline-expected": [
  "error",
  {
    // The matcher names to check. Replaces the default set, not extends it.
    "matchers": ["toEqual", "toStrictEqual"],

    // true (default): inside a `test` / `it` callback the expected variable
    // must be declared first. Set to false to disable this check.
    "requireExpectedFirstInTest": true
  }
]
```

| Option                       | Type       | Default                        | Effect                                                                                                                                                                                                                                                       |
| ---------------------------- | ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matchers`                   | `string[]` | `["toEqual", "toStrictEqual"]` | The matcher names whose inline-literal arguments are reported. Setting this **replaces** the default set. Add names such as `toMatchObject`, `toContainEqual`, or `toHaveBeenCalledWith` to widen coverage.                                                  |
| `requireExpectedFirstInTest` | `boolean`  | `true`                         | When `true`, additionally requires the expected variable to be declared first inside its `test` / `it` callback. Only declarations of variables the expected value uses may precede it (and not the value under test). Set to `false` to disable this check. |

## Usage

Register the plugin in your `.oxlintrc.json` and enable the rule:

```json
{
  "jsPlugins": ["@crescware/eslint-plugin-crescware-no-inline-expected"],
  "rules": {
    "crescware-no-inline-expected/no-inline-expected": "error"
  }
}
```

## Stack

- **Runtime**: Node.js 24 (via [mise](https://mise.jdx.dev/))
- **Package manager**: pnpm (via corepack)
- **Language**: TypeScript ([native preview](https://github.com/microsoft/typescript-go))
- **Test**: [Vitest](https://vitest.dev/)
- **Lint**: [oxlint](https://oxc.rs/docs/guide/usage/linter)
- **Format**: [oxfmt](https://github.com/oxc-project/oxc)
- **Unused code**: [Knip](https://knip.dev/)

## Setup

```sh
mise install
corepack enable
pnpm install
```

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm build`       | Compile `src` to `dist`                  |
| `pnpm check`       | Run all checks (types, lint, knip, test) |
| `pnpm check:types` | Type check                               |
| `pnpm check:lint`  | Lint and format check                    |
| `pnpm check:knip`  | Unused files/exports check               |
| `pnpm test`        | Run fixture integration tests            |
| `pnpm format`      | Fix lint and format                      |
