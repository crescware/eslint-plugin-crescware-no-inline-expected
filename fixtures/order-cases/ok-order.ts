// With `requireExpectedBeforeActual` enabled: the expected variable is declared
// before the value under test, so this is allowed.
const expected = {};
const something = {};
expect(something).toEqual(expected);

// A non-identifier expected value (a call) has no declaration to order against.
declare function makeExpected(): unknown;

const actual = { a: 1 };
expect(actual).toEqual(makeExpected());

// The same variable on both sides has nothing to order.
const shared = { a: 1 };
expect(shared).toEqual(shared);
