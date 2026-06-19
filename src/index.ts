// Minimal structural types for the ESTree / TS-ESTree nodes this rule reads.
// oxlint hands the JS plugin ESTree-compatible nodes; only the fields actually
// inspected here are modeled and the rest are left opaque.
type Node = { type: string };

type Identifier = { type: "Identifier"; name: string };

// `expr as T` / `expr satisfies T`: in both, `expression` is the wrapped value.
// A literal can sit under any number of stacked clauses (`{} as unknown as T`,
// `[1] as const`, `{} satisfies T`), so the wrapper is unwrapped down to the
// value it ultimately holds.
type WrappedExpression = {
  type: "TSAsExpression" | "TSSatisfiesExpression";
  expression: Node;
};

type MemberExpression = {
  type: "MemberExpression";
  object: Node;
  property: Node;
  computed: boolean;
};

type CallExpression = {
  type: "CallExpression";
  callee: Node;
  arguments: Node[];
};

type ReportDescriptor = { message: string; node: unknown };

// Minimal view of oxlint's scope analysis, reached through `context.sourceCode`.
// A name resolves to a `ScopeVariable`, whose first definition node carries the
// `range` start offset -- the textual position of the declaration, which is all
// the declaration-order check needs.
type Ranged = { range: [number, number] };

type Definition = { node: Ranged };

type ScopeVariable = { defs: Definition[] };

type Scope = { set: Map<string, ScopeVariable>; upper: Scope | null };

type SourceCode = { getScope: (node: Node) => Scope };

type RuleOptions = {
  matchers?: string[];
  requireExpectedBeforeActual?: boolean;
};

type RuleContext = {
  filename: string;
  options: RuleOptions[];
  sourceCode: SourceCode;
  report: (descriptor: ReportDescriptor) => void;
};

type Visitor = Record<string, (node: never) => void>;

type Rule = {
  meta?: Record<string, unknown>;
  create: (context: RuleContext) => Visitor;
};

type Plugin = {
  meta: { name: string };
  rules: Record<string, Rule>;
};

// The matchers checked by default: the two deep-equality assertions. Both take a
// full expected value as their argument, so an inline literal there is exactly
// what this rule asks to extract. Override with the `matchers` option to widen
// the set (e.g. `toMatchObject`, `toContainEqual`, `toHaveBeenCalledWith`) or
// narrow it (e.g. just `toEqual`).
const DEFAULT_MATCHERS = ["toEqual", "toStrictEqual"] satisfies string[];

// `expect(actual)` and its dotted forms `expect.soft(actual)` /
// `expect.poll(fn)`: a call whose callee is the identifier `expect`, or a member
// access on it. This anchor is what separates a real assertion from an unrelated
// `foo.toEqual({...})`.
const isExpectCall = (node: Node): boolean => {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = (node as CallExpression).callee;
  if (callee.type === "Identifier") {
    return (callee as Identifier).name === "expect";
  }
  if (callee.type === "MemberExpression") {
    const object = (callee as MemberExpression).object;
    return (
      object.type === "Identifier" && (object as Identifier).name === "expect"
    );
  }
  return false;
};

// Walk down the receiver chain of a matcher call looking for the `expect(...)`
// anchor, returning that call (so its argument -- the value under test -- can be
// read) or null when there is none. Covers `expect(x).toEqual(...)` as well as
// the modifier chains `expect(x).not.toEqual(...)`,
// `expect(x).resolves.toEqual(...)`, and `expect(x).rejects.not.toEqual(...)`:
// each modifier is one more MemberExpression / CallExpression layer between the
// matcher and `expect`. Each step descends to a strictly deeper child, so the
// walk always terminates.
const findExpectCall = (node: Node): CallExpression | null => {
  let current: Node = node;
  while (
    current.type === "MemberExpression" ||
    current.type === "CallExpression"
  ) {
    if (isExpectCall(current)) {
      return current as CallExpression;
    }
    current =
      current.type === "MemberExpression"
        ? (current as MemberExpression).object
        : (current as CallExpression).callee;
  }
  return null;
};

// The matcher name from `expect(x).<name>(...)`: the property of the call's
// callee, but only when it is a plain (non-computed) identifier. Computed access
// like `expect(x)[name](...)` has no statically known matcher name and is left
// out of scope. Returns null when the callee is not a matcher member access.
const matcherName = (node: CallExpression): string | null => {
  const callee = node.callee;
  if (callee.type !== "MemberExpression") {
    return null;
  }
  const member = callee as MemberExpression;
  if (member.computed) {
    return null;
  }
  const property = member.property;
  if (property.type !== "Identifier") {
    return null;
  }
  return (property as Identifier).name;
};

// Unwrap any stack of `as` / `satisfies` clauses to reach the value underneath.
// `{ a: 1 } as Foo`, `{} satisfies T`, `[1] as const`, and `[] as unknown as
// T[]` all carry a plain literal at the root, so the inline-literal check sees
// through the wrappers.
const unwrapTypeWrappers = (node: Node): Node => {
  let current: Node = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression"
  ) {
    current = (current as WrappedExpression).expression;
  }
  return current;
};

const objectMessage = (matcher: string): string => {
  return `Inline object literal passed to '${matcher}'. Declare the expected value as a variable first: write 'const expected = { ... }; expect(actual).${matcher}(expected);' instead of passing the literal inline.`;
};

const arrayMessage = (matcher: string): string => {
  return `Inline array literal passed to '${matcher}'. Declare the expected value as a variable first: write 'const expected = [ ... ]; expect(actual).${matcher}(expected);' instead of passing the literal inline.`;
};

// Resolve an in-scope variable by name, walking outward through enclosing
// scopes. Returns null for an unresolved name (e.g. an undeclared global), in
// which case the declaration-order check is skipped.
const findVariable = (scope: Scope, name: string): ScopeVariable | null => {
  let current: Scope | null = scope;
  while (current !== null) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
    current = current.upper;
  }
  return null;
};

// The start offset of a variable's first declaration, or null when it has no
// definition node (an implicit / ambient binding). Used to compare the textual
// order of two declarations.
const declarationStart = (variable: ScopeVariable): number | null => {
  const def = variable.defs[0];
  return def === undefined ? null : def.node.range[0];
};

const orderMessage = (matcher: string): string => {
  return `The variable passed as the expected value to '${matcher}' is declared after the variable passed to 'expect(...)'. Declare the expected variable first, so the expected value is introduced before the value under test.`;
};

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow passing an inline object or array literal as the expected value to an `expect(...)` matcher; declare it in a `const` variable first. By default the deep-equality matchers `toEqual` and `toStrictEqual` are checked; override the set with the `matchers` option. A literal wrapped in `as` / `satisfies` is still reported because it is still inline, and an empty `{}` / `[]` is reported too. The rule also requires, by default, that the variable passed as the expected value is declared before the variable passed to `expect(...)`; set `requireExpectedBeforeActual` to `false` to turn that off.",
    },
    schema: [
      {
        type: "object",
        properties: {
          matchers: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
            uniqueItems: true,
          },
          requireExpectedBeforeActual: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext): Visitor {
    const configuredMatchers = context.options[0]?.matchers;
    const matchers = new Set<string>(
      configuredMatchers !== undefined && configuredMatchers.length > 0
        ? configuredMatchers
        : DEFAULT_MATCHERS,
    );
    // Default true: the declaration-order check is on; set
    // `requireExpectedBeforeActual: false` to disable it.
    const requireExpectedBeforeActual =
      context.options[0]?.requireExpectedBeforeActual !== false;

    // Enforce that the variable used as the expected value (the matcher's first
    // argument) is declared before the variable under test (the `expect(...)`
    // argument). Only applies when both are plain identifiers that resolve to
    // declared variables; anything else (inline literals, calls, undeclared
    // names) has no declaration order to compare and is left alone.
    const checkDeclarationOrder = (
      matcherArg: Node,
      expectArg: Node,
      matcher: string,
    ): void => {
      if (matcherArg.type !== "Identifier" || expectArg.type !== "Identifier") {
        return;
      }
      const expectedName = (matcherArg as Identifier).name;
      const actualName = (expectArg as Identifier).name;
      if (expectedName === actualName) {
        return;
      }
      const scope = context.sourceCode.getScope(matcherArg);
      const expectedVar = findVariable(scope, expectedName);
      const actualVar = findVariable(scope, actualName);
      if (expectedVar === null || actualVar === null) {
        return;
      }
      const expectedStart = declarationStart(expectedVar);
      const actualStart = declarationStart(actualVar);
      if (expectedStart === null || actualStart === null) {
        return;
      }
      if (expectedStart > actualStart) {
        context.report({ message: orderMessage(matcher), node: matcherArg });
      }
    };

    const checkCall = (node: CallExpression): void => {
      const name = matcherName(node);
      if (name === null || !matchers.has(name)) {
        return;
      }
      // The callee is a MemberExpression here (matcherName returned non-null),
      // so its `object` is the receiver chain to search for the `expect` anchor.
      const receiver = (node.callee as MemberExpression).object;
      const expectCall = findExpectCall(receiver);
      if (expectCall === null) {
        return;
      }
      // Inspect every argument: single-value matchers (`toEqual`) have one, but
      // configured multi-arg matchers (`toHaveBeenCalledWith`) may carry several
      // inline literals, each worth extracting.
      for (const arg of node.arguments) {
        const literal = unwrapTypeWrappers(arg);
        const isObject = literal.type === "ObjectExpression";
        const isArray = literal.type === "ArrayExpression";
        if (!isObject && !isArray) {
          continue;
        }
        const message = isObject ? objectMessage(name) : arrayMessage(name);
        context.report({ message, node: arg });
      }
      // The expected value is the matcher's first argument; the value under test
      // is the `expect(...)` call's first argument.
      const matcherArg = node.arguments[0];
      const expectArg = expectCall.arguments[0];
      if (
        requireExpectedBeforeActual &&
        matcherArg !== undefined &&
        expectArg !== undefined
      ) {
        checkDeclarationOrder(matcherArg, expectArg, name);
      }
    };

    return {
      CallExpression: checkCall as unknown as (node: never) => void,
    };
  },
} satisfies Rule;

const plugin = {
  meta: { name: "crescware-no-inline-expected" },
  rules: {
    "no-inline-expected": rule,
  },
} satisfies Plugin;

export default plugin;
