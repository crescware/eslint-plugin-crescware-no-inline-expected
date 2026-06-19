// A literal wrapped in `as` / `satisfies` (including `as const` and multi-step
// chains) is still inline, so it is still reported. The wrappers are unwrapped
// to classify the underlying literal as object or array.
type Point = { x: number; y: number };

const actual = { x: 0, y: 0 };

expect(actual).toEqual({ x: 0, y: 0 } as Point);
expect(actual).toEqual({ x: 1, y: 1 } satisfies Point);
expect(actual).toEqual([1, 2, 3] as const);
expect(actual).toEqual({ x: 2, y: 2 } as unknown as Point);
