# @crescware/eslint-plugin-crescware-no-inline-expected

An [oxlint](https://oxc.rs/docs/guide/usage/linter) JS plugin that forbids passing an inline object or array literal as the expected value to an `expect(...)` matcher. Declare the expected value in a `const` variable first.

## Rule: `no-inline-expected`

When the expected value of an assertion is written inline as an object or array literal (`expect(actual).toEqual({ ... })` / `expect(actual).toStrictEqual([ ... ])`), extract it into a named variable. A named `expected` separates "what is being compared" from "what the answer should be", keeps the assertion line short, and gives the expected value a name to refer to.

```ts
// NG: an inline object literal as the expected value
expect(actual).toEqual({ id: 1, name: "Alice" });

// NG: an inline array literal as the expected value
expect(actual).toEqual([1, 2, 3]);

// OK: the expected value is declared first
const expected = { id: 1, name: "Alice" };
expect(actual).toEqual(expected);

// OK: a non-literal argument is out of scope
expect(actual).toEqual(buildExpected());

// OK: an empty literal is allowed by default -- it is trivial to read inline
expect(actual).toEqual({});
expect(actual).toEqual([]);
```

### Scope

The rule fires when **all** of the following hold for a call expression:

- The callee is a member access whose property is one of the configured `matchers` (default: `toEqual`, `toStrictEqual`).
- The receiver chain is anchored at an `expect(...)` call. Modifier chains are followed, so `expect(x).not.toEqual(...)`, `expect(x).resolves.toEqual(...)`, `expect(x).rejects.toEqual(...)`, and `expect.soft(x).toEqual(...)` are all in scope. An unrelated `foo.toEqual({ ... })` that is not anchored at `expect` is **not** reported.
- An argument is a plain object literal (`ObjectExpression`) or array literal (`ArrayExpression`), optionally wrapped in `as` / `satisfies` clauses (`{ ... } as Foo`, `[ ... ] as const`, `{ ... } satisfies T`, including multi-step chains such as `{ ... } as unknown as T`). The wrappers are unwrapped to classify the underlying literal.

Notes:

- Object and array literals are treated the same.
- Every argument is inspected, so multi-argument matchers (e.g. a configured `toHaveBeenCalledWith`) report each inline literal.
- An empty literal (`{}` / `[]`, with zero properties / elements) is allowed by default and controlled by `allowEmptyLiteral`. A spread (`{ ...base }` / `[...xs]`) counts as non-empty and stays in scope.
- The rule applies to JavaScript (`.js` / `.mjs` / `.cjs` / `.jsx`) as well as TypeScript: it targets a runtime assertion call, not any TypeScript-only syntax.
- The rule does not autofix; it reports only.

### Options

```jsonc
"crescware-no-inline-expected/no-inline-expected": [
  "error",
  {
    // The matcher names to check. Replaces the default set, not extends it.
    "matchers": ["toEqual", "toStrictEqual"],

    // true (default): empty `{}` / `[]` literals are not reported.
    // false: report them with the standard message.
    "allowEmptyLiteral": true
  }
]
```

| Option              | Type       | Default                        | Effect                                                                                                                                                                                                      |
| ------------------- | ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matchers`          | `string[]` | `["toEqual", "toStrictEqual"]` | The matcher names whose inline-literal arguments are reported. Setting this **replaces** the default set. Add names such as `toMatchObject`, `toContainEqual`, or `toHaveBeenCalledWith` to widen coverage. |
| `allowEmptyLiteral` | `boolean`  | `true`                         | When `true`, empty `{}` / `[]` literals are not reported. Set to `false` to report them as well.                                                                                                            |

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
