// The `expect(...)` anchor is found through modifier chains, so an inline
// literal after `.not` / `.resolves` / `.rejects` or behind `expect.soft(...)`
// is reported just like the bare `expect(x).toEqual(...)` form.
declare const actual: unknown;

expect(actual).not.toEqual({ a: 1 });
expect(actual).resolves.toEqual({ b: 2 });
expect(actual).rejects.toEqual({ c: 3 });
expect.soft(actual).toEqual({ d: 4 });
