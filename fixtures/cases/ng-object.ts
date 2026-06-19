// Inline object literals passed to the default matchers are reported.
const actual = { x: 0, y: 0 };

expect(actual).toEqual({ x: 0, y: 0 });
expect(actual).toStrictEqual({ x: 1, y: 1 });
