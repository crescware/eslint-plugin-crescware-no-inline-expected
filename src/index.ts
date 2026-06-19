// Minimal structural types for the ESTree / TS-ESTree nodes this rule reads.
// oxlint hands the JS plugin ESTree-compatible nodes; only the fields actually
// inspected here are modeled and the rest are left opaque. Every node also
// carries a `parent` link and a `range`, used to walk up to the enclosing
// `test(...)` callback and to compare textual positions.
type Range = [number, number];

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

// A function whose body, when it is a block, holds the statements a `test(...)`
// callback runs.
type FunctionNode = { type: string; body: Node };

type BlockStatement = { type: "BlockStatement"; body: Node[] };

type ReportDescriptor = { message: string; node: unknown };

// Minimal view of oxlint's scope analysis, reached through `context.sourceCode`.
// `getDeclaredVariables` maps a declaration node to the variables it introduces;
// each variable's `references` carry the textual position of every use, which is
// what the "expected first" check compares against statement spans.
type Reference = { identifier: { range: Range } };

type ScopeVariable = { name: string; references: Reference[] };

type SourceCode = { getDeclaredVariables: (node: Node) => ScopeVariable[] };

type RuleOptions = {
  matchers?: string[];
  requireExpectedFirstInTest?: boolean;
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

// The node's parent link, present on every oxlint AST node (null only at the
// Program root). Read through a cast because the opaque `Node` shape omits it.
const parentOf = (node: Node): Node | null => {
  return (node as { parent?: Node | null }).parent ?? null;
};

// The node's `[start, end)` source offsets, used to test whether one node sits
// textually inside another.
const rangeOf = (node: Node): Range => {
  return (node as unknown as { range: Range }).range;
};

// The identifier at the root of a call's callee, seen through member and call
// layers: `test(...)` -> "test", `it.only(...)` -> "it", and
// `test.each(table)(...)` -> "test". Returns null when the callee bottoms out in
// something other than an identifier.
const rootCalleeName = (call: CallExpression): string | null => {
  let current: Node = call.callee;
  while (true) {
    if (current.type === "Identifier") {
      return (current as Identifier).name;
    }
    if (current.type === "MemberExpression") {
      current = (current as MemberExpression).object;
      continue;
    }
    if (current.type === "CallExpression") {
      current = (current as CallExpression).callee;
      continue;
    }
    return null;
  }
};

// The callee identifiers whose callback bodies this rule treats as a test.
const TEST_CALLEES = new Set<string>(["test", "it"]);

// Type-only declarations introduce no runtime value, so they are neither the
// value under test nor arrange code; they are always allowed above the expected
// declaration regardless of whether the expected value uses them.
const TYPE_ONLY_STATEMENTS = new Set<string>([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
]);

// The block body of the nearest enclosing `test(...)` / `it(...)` callback, found
// by walking parents up from `node`. Modifier and table forms (`it.only`,
// `test.each(table)(...)`) are recognized via the callee's root identifier, and
// an intervening non-test function (a helper closure) is skipped over. Returns
// null when there is no such callback, or its body is an expression with no
// statements to order.
const enclosingTestCallbackBody = (node: Node): BlockStatement | null => {
  let current: Node | null = parentOf(node);
  while (current !== null) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression"
    ) {
      const parent = parentOf(current);
      if (parent !== null && parent.type === "CallExpression") {
        const call = parent as CallExpression;
        const root = rootCalleeName(call);
        if (
          root !== null &&
          TEST_CALLEES.has(root) &&
          call.arguments.includes(current)
        ) {
          const body = (current as FunctionNode).body;
          return body.type === "BlockStatement"
            ? (body as BlockStatement)
            : null;
        }
      }
    }
    current = parentOf(current);
  }
  return null;
};

const orderMessage = (matcher: string): string => {
  return `The expected value passed to '${matcher}' is not declared at the top of the test. Declare the expected variable first in the 'test' / 'it' callback, before any statement that is not used to build it.`;
};

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow passing an inline object or array literal as the expected value to an `expect(...)` matcher; declare it in a `const` variable first. By default the deep-equality matchers `toEqual` and `toStrictEqual` are checked; override the set with the `matchers` option. A literal wrapped in `as` / `satisfies` is still reported because it is still inline, and an empty `{}` / `[]` is reported too. The rule also requires, by default, that inside a `test` / `it` callback the expected variable is declared first -- before any statement that is not used to build it; set `requireExpectedFirstInTest` to `false` to turn that off.",
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
          requireExpectedFirstInTest: { type: "boolean" },
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
    // Default true: the "expected first in test" check is on; set
    // `requireExpectedFirstInTest: false` to disable it.
    const requireExpectedFirstInTest =
      context.options[0]?.requireExpectedFirstInTest !== false;

    // Enforce that, inside a `test` / `it` callback, the variable used as the
    // expected value is declared at the top of the callback. Only declarations
    // of variables the expected value (transitively) uses may precede it, and
    // even those may not be part of the value passed to `expect(...)` -- so an
    // `expected` aliased from the value under test (`const expected = actual;`)
    // is still reported. Anything else above the declaration (the value under
    // test, unrelated setup, a bare statement) is a violation. Only plain
    // identifiers declared directly in the callback are considered; an expected
    // value that is a literal, a call, or declared elsewhere is left alone.
    const checkExpectedFirstInTest = (
      matcherArg: Node,
      expectArg: Node | undefined,
      anchor: Node,
      matcher: string,
    ): void => {
      if (matcherArg.type !== "Identifier") {
        return;
      }
      const expectedName = (matcherArg as Identifier).name;

      const body = enclosingTestCallbackBody(anchor);
      if (body === null) {
        return;
      }
      const statements = body.body;

      // Variables introduced by each statement (empty for non-declarations).
      const declaredVars = statements.map((statement): ScopeVariable[] =>
        statement.type === "VariableDeclaration"
          ? context.sourceCode.getDeclaredVariables(statement)
          : [],
      );

      // The statement that declares the expected variable as a direct child of
      // the callback body. When the expected value is declared elsewhere (an
      // outer scope, a parameter, a nested block, an import) there is no
      // callback-top position to enforce, so the check is skipped.
      const declIndex = declaredVars.findIndex((vars) =>
        vars.some((variable) => variable.name === expectedName),
      );
      if (declIndex === -1) {
        return;
      }

      // Map each callback-local variable to the statement that declares it.
      const declaringStatement = new Map<ScopeVariable, number>();
      for (const [i, vars] of declaredVars.entries()) {
        for (const variable of vars) {
          declaringStatement.set(variable, i);
        }
      }

      // True when `variable` is referenced anywhere inside `[start, end)`.
      const referencedWithin = (
        variable: ScopeVariable,
        start: number,
        end: number,
      ): boolean => {
        return variable.references.some((reference) => {
          const at = reference.identifier.range[0];
          return at >= start && at < end;
        });
      };

      // Variables that appear inside the `expect(...)` argument: the value under
      // test. These may never sit above the expected declaration, even when the
      // expected value happens to reference them.
      const underTest = new Set<ScopeVariable>();
      if (expectArg !== undefined) {
        const [start, end] = rangeOf(expectArg);
        for (const variable of declaringStatement.keys()) {
          if (referencedWithin(variable, start, end)) {
            underTest.add(variable);
          }
        }
      }

      // Statements the expected declaration transitively depends on: starting
      // from the declaration, pull in any statement whose variable is referenced
      // within a statement already known to be needed.
      const needed = new Set<number>([declIndex]);
      const pending = [declIndex];
      while (pending.length > 0) {
        const index = pending.pop();
        if (index === undefined) {
          break;
        }
        const statement = statements[index];
        if (statement === undefined) {
          continue;
        }
        const [start, end] = rangeOf(statement);
        for (const [variable, owner] of declaringStatement) {
          if (owner === index || needed.has(owner)) {
            continue;
          }
          if (referencedWithin(variable, start, end)) {
            needed.add(owner);
            pending.push(owner);
          }
        }
      }

      // Every statement above the declaration must be a dependency declaration
      // that introduces no value-under-test variable. Type-only declarations
      // (`type` / `interface`) are skipped unconditionally.
      for (let k = 0; k < declIndex; k++) {
        const statement = statements[k];
        if (
          statement !== undefined &&
          TYPE_ONLY_STATEMENTS.has(statement.type)
        ) {
          continue;
        }
        const vars = declaredVars[k] ?? [];
        const isDependency = needed.has(k);
        const introducesUnderTest = vars.some((variable) =>
          underTest.has(variable),
        );
        if (!isDependency || introducesUnderTest) {
          context.report({ message: orderMessage(matcher), node: matcherArg });
          return;
        }
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
      if (requireExpectedFirstInTest && matcherArg !== undefined) {
        checkExpectedFirstInTest(matcherArg, expectArg, node, name);
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
