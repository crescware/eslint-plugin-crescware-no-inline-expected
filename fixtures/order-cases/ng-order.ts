// With `requireExpectedBeforeActual` enabled: the expected variable is declared
// after the value under test, so each assertion is reported.
const something = {};
const expected = {};
expect(something).toEqual(expected);

const actual2 = { a: 1 };
const expected2 = { a: 1 };
expect(actual2).toStrictEqual(expected2);
