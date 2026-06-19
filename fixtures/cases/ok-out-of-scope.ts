// `toBe` is not a configured matcher, so its inline literal is ignored even
// though it carries one. A `.toEqual` that is not anchored at `expect(...)` is
// likewise out of scope.
declare const wrapper: { toEqual: (value: unknown) => void };

const actual = { a: 1 };

expect(actual).toBe({ a: 1 });
wrapper.toEqual({ a: 1 });
