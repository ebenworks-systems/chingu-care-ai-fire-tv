import { test } from "node:test";
import assert from "node:assert/strict";

import { contrastRatio, DEFAULT_FOCUS, focusStyle } from "../src/focus.ts";
import { lineHeight, MIN_DP, nextTextSize, typeSize, type TypeRole } from "../src/typeScale.ts";

const roles: TypeRole[] = ["display", "title", "heading", "body", "label", "caption"];

test("no role is ever smaller than the minimum, at any size or screen", () => {
  for (const role of roles) {
    for (const size of ["large", "larger", "largest"] as const) {
      for (const width of [640, 960, 1920]) {
        assert.ok(typeSize(role, size, width) >= MIN_DP, `${role} ${size} ${width}`);
      }
    }
  }
});

test("each step up makes text bigger and the order of roles holds", () => {
  for (const role of roles) {
    assert.ok(typeSize(role, "larger") > typeSize(role, "large"));
    assert.ok(typeSize(role, "largest") > typeSize(role, "larger"));
  }
  const sizes = roles.map((r) => typeSize(r));
  assert.deepEqual([...sizes].sort((a, b) => b - a), sizes);
});

test("body text keeps a looser line height than display text", () => {
  assert.ok(lineHeight("body", 22) / 22 > lineHeight("display", 46) / 46);
});

test("text size cycles through three steps", () => {
  assert.equal(nextTextSize("large"), "larger");
  assert.equal(nextTextSize("larger"), "largest");
  assert.equal(nextTextSize("largest"), "large");
});

test("focus is shown by size and ring, not by colour alone", () => {
  const on = focusStyle(true);
  const off = focusStyle(false);
  assert.ok(on.transform[0].scale > off.transform[0].scale);
  assert.equal(on.borderWidth, off.borderWidth, "the ring width is reserved so focus does not shift the layout");
  assert.notEqual(on.borderColor, off.borderColor);
});

test("the default focus ring stands out from a white card and a warm canvas", () => {
  assert.ok(contrastRatio(DEFAULT_FOCUS.ringColor, "#FFFFFF") >= 3, "WCAG 1.4.11 non-text contrast");
  assert.ok(contrastRatio(DEFAULT_FOCUS.ringColor, "#FAF5EE") >= 3);
});

test("contrast ratio matches known WCAG values", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
});
