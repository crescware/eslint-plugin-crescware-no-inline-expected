// JavaScript is in scope: this rule targets a runtime assertion call, not any
// TypeScript-only syntax, so an inline literal is reported in `.js` too.
const actual = { a: 1 };

expect(actual).toEqual({ a: 1, b: 2 });
