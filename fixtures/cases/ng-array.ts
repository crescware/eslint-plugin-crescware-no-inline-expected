// Inline array literals passed to the default matchers are reported.
const actual = [1, 2, 3];

expect(actual).toEqual([1, 2, 3]);
expect(actual).toStrictEqual([{ a: 1 }, { b: 2 }]);
