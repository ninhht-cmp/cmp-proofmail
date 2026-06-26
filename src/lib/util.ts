// Cross-cutting pure helpers with no domain knowledge — usable from any layer.

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Safely read a message off a caught value. A `catch` binding is `unknown` (it
// can be anything thrown, not just an Error), so reaching for `.message`
// directly is unsound — this narrows it once, in one place.
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
