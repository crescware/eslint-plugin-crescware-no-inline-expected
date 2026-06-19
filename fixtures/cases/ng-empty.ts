// An empty `{}` / `[]` is still an inline literal, so it is reported as well.
const actual = {};

expect(actual).toEqual({});
expect(actual).toEqual([]);
