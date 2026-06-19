// With `requireExpectedFirstInTest` enabled (the default): inside a `test`
// callback the expected variable must be declared first. A statement that is
// not used to build `expected` may not sit above it, so each assertion here is
// reported.

test("an unrelated variable is declared above expected", () => {
  const something = {};
  const expected = {};
  expect(something).toEqual(expected);
});

test("expected is aliased from the value under test", () => {
  const actual = { a: 1 };
  const expected = actual;
  expect(actual).toStrictEqual(expected);
});
