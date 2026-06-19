// With `requireExpectedFirstInTest` enabled (the default): each assertion below
// is allowed, because the expected variable is declared first -- or only its
// own dependencies precede it, or there is nothing to order.

declare function makeId(): string;
declare function makeUser(id: string): unknown;
declare function makeExpected(): unknown;

test("expected is declared first", () => {
  const expected = {};
  const actual = {};
  expect(actual).toEqual(expected);
});

test("a dependency of expected may precede it", () => {
  const name = "alice";
  const expected = { name };
  const actual = { name };
  expect(actual).toEqual(expected);
});

test("a transitive dependency of expected may precede it", () => {
  const id = makeId();
  const expected = { id, name: "alice" };
  const actual = makeUser(id);
  expect(actual).toEqual(expected);
});

test("a non-identifier expected has no declaration to order", () => {
  const actual = { a: 1 };
  expect(actual).toEqual(makeExpected());
});
