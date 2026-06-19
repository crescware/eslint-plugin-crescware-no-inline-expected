// Empty `{}` / `[]` literals are trivial to read inline, so they are allowed by
// default. With `allowEmptyLiteral: false` they are reported with the standard
// object / array messages.
const actual = {};

expect(actual).toEqual({});
expect(actual).toEqual([]);
