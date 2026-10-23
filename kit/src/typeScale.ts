/**
 * A 10-foot type scale for older viewers.
 *
 * Sizes are in density-independent pixels. A 1080p Fire TV or Android TV
 * reports 960 x 540 dp, so 1 dp is 2 physical pixels. Android TV's own guide
 * puts body text at 12 sp or more; older eyes need far more, so the smallest
 * size here is 18 dp and the viewer can step everything up twice.
 */

export type TypeRole = "display" | "title" | "heading" | "body" | "label" | "caption";
export type TextSize = "large" | "larger" | "largest";

export const MIN_DP = 18;

const BASE: Record<TypeRole, number> = {
  display: 46,
  title: 36,
  heading: 28,
  body: 22,
  label: 20,
  caption: 18,
};

const STEP: Record<TextSize, number> = { large: 1, larger: 1.15, largest: 1.3 };

/** Size in dp for a role at the viewer's chosen text size, never below MIN_DP. */
export function typeSize(role: TypeRole, size: TextSize = "large", screenWidthDp = 960): number {
  // Scale with the screen so a 4K TV at a different density keeps the same proportions.
  const screen = Math.max(0.8, Math.min(1.5, screenWidthDp / 960));
  return Math.max(MIN_DP, Math.round(BASE[role] * STEP[size] * screen));
}

/** Line height that keeps large type readable: tighter for display, looser for body. */
export function lineHeight(role: TypeRole, fontSize: number): number {
  const ratio = role === "display" || role === "title" ? 1.12 : role === "heading" ? 1.2 : 1.4;
  return Math.round(fontSize * ratio);
}

export function nextTextSize(size: TextSize): TextSize {
  return size === "large" ? "larger" : size === "larger" ? "largest" : "large";
}
