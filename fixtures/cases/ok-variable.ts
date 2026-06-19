// The shape this rule asks for: the expected value lives in a variable declared
// before the value under test, and non-literal arguments (calls, identifiers)
// are out of scope.
declare function buildExpected(): unknown;
declare function makeExpected(): unknown;

const expected = { x: 0, y: 0 };
const actual = { x: 0, y: 0 };

expect(actual).toEqual(expected);
expect(actual).toEqual(buildExpected());
expect(actual).toStrictEqual(makeExpected());
