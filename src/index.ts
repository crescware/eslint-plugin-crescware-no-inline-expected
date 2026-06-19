// Minimal structural types for the ESTree / TS-ESTree nodes this rule reads.
// oxlint hands the JS plugin ESTree-compatible nodes; only the fields actually
// inspected here are modeled and the rest are left opaque.
type Node = { type: string };

type Identifier = { type: "Identifier"; name: string };

// Only `length` matters here -- the element/property nodes themselves are never
// inspected, so their shape is left opaque.
type ArrayExpression = { type: "ArrayExpression"; elements: unknown[] };

type ObjectExpression = { type: "ObjectExpression"; properties: unknown[] };

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

type RuleOptions = {
  matchers?: string[];
  allowEmptyLiteral?: boolean;
};

type RuleContext = {
  filename: string;
  options: RuleOptions[];
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
// anchor. Covers `expect(x).toEqual(...)` as well as the modifier chains
// `expect(x).not.toEqual(...)`, `expect(x).resolves.toEqual(...)`, and
// `expect(x).rejects.not.toEqual(...)`: each modifier is one more
// MemberExpression / CallExpression layer between the matcher and `expect`. Each
// step descends to a strictly deeper child, so the walk always terminates.
const chainRootsAtExpect = (node: Node): boolean => {
  let current: Node = node;
  while (
    current.type === "MemberExpression" ||
    current.type === "CallExpression"
  ) {
    if (isExpectCall(current)) {
      return true;
    }
    current =
      current.type === "MemberExpression"
        ? (current as MemberExpression).object
        : (current as CallExpression).callee;
  }
  return false;
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

// An empty `{}` / `[]` with zero properties / elements. A spread (`{ ...base }`
// / `[...xs]`) counts as a property / element, so it is *not* empty -- those
// literals stay in scope. Empty literals are trivial to read inline, so they are
// allowed by default (see `allowEmptyLiteral`).
const isEmptyLiteral = (node: Node): boolean => {
  if (node.type === "ObjectExpression") {
    return (node as ObjectExpression).properties.length === 0;
  }
  if (node.type === "ArrayExpression") {
    return (node as ArrayExpression).elements.length === 0;
  }
  return false;
};

const objectMessage = (matcher: string): string => {
  return `Inline object literal passed to '${matcher}'. Declare the expected value as a variable first: write 'const expected = { ... }; expect(actual).${matcher}(expected);' instead of passing the literal inline.`;
};

const arrayMessage = (matcher: string): string => {
  return `Inline array literal passed to '${matcher}'. Declare the expected value as a variable first: write 'const expected = [ ... ]; expect(actual).${matcher}(expected);' instead of passing the literal inline.`;
};

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow passing an inline object or array literal as the expected value to an `expect(...)` matcher; declare it in a `const` variable first. By default the deep-equality matchers `toEqual` and `toStrictEqual` are checked; override the set with the `matchers` option. A literal wrapped in `as` / `satisfies` is still reported because it is still inline. Empty `{}` / `[]` literals are allowed by default because they are trivial to read inline; set `allowEmptyLiteral` to `false` to report them too.",
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
          allowEmptyLiteral: { type: "boolean" },
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
    // Default true: an empty literal is skipped. Only an explicit `false` opts
    // into reporting empty `{}` / `[]`.
    const allowEmptyLiteral = context.options[0]?.allowEmptyLiteral !== false;

    const checkCall = (node: CallExpression): void => {
      const name = matcherName(node);
      if (name === null || !matchers.has(name)) {
        return;
      }
      // The callee is a MemberExpression here (matcherName returned non-null),
      // so its `object` is the receiver chain to test for the `expect` anchor.
      const receiver = (node.callee as MemberExpression).object;
      if (!chainRootsAtExpect(receiver)) {
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
        if (allowEmptyLiteral && isEmptyLiteral(literal)) {
          continue;
        }
        const message = isObject ? objectMessage(name) : arrayMessage(name);
        context.report({ message, node: arg });
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
