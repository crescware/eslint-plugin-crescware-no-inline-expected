// Under the default `matchers`, only `toEqual` here is reported. Under a config
// that sets `matchers` to `["toMatchObject", "toContainEqual"]`, those two are
// reported instead and `toEqual` is ignored -- the option replaces the set
// rather than extending it.
const actual = { a: 1 };

expect(actual).toMatchObject({ a: 1 });
expect(actual).toContainEqual({ a: 1 });
expect(actual).toEqual({ a: 1 });
