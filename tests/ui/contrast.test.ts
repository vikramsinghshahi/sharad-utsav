import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WCAG 2.2 contrast for every text/background pair the UI uses, computed from the
// real tokens in globals.css. Changing a brand colour re-runs this check.

type Rgba = { r: number; g: number; b: number; a: number };

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function token(name: string): Rgba {
  const match = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`Token --color-${name} not found in globals.css`);
  return parseColor(match[1].trim());
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(value);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Number(rgb[4] ?? 1) };
  }
  throw new Error(`Unsupported colour "${value}"`);
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const alpha = (color: Rgba, a: number): Rgba => ({ ...color, a });

// Paint `top` over an opaque `bottom` (how translucent cards and tints render).
function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(text: Rgba, background: Rgba): number {
  const fg = luminance(over(text, background));
  const bg = luminance(background);
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return (hi + 0.05) / (lo + 0.05);
}

const page = token("primary-dark");
const surfaces = {
  page,
  card: over(token("surface"), page),
  raisedCard: over(token("surface-raised"), page),
  errorPanel: over(alpha(token("error"), 0.1), page),
  goldTint: over(alpha(token("bright-gold"), 0.1), page),
  successPanel: over(alpha(token("success"), 0.1), page),
};

const NORMAL_TEXT = 4.5;
const NON_TEXT = 3; // borders of inputs and chips, focus ring, icons

describe("text on the dark page and its cards (≥ 4.5:1)", () => {
  const texts: Record<string, Rgba> = {
    white: WHITE,
    "white/90": alpha(WHITE, 0.9),
    "white/85": alpha(WHITE, 0.85),
    "white/80": alpha(WHITE, 0.8),
    "white/75": alpha(WHITE, 0.75),
    "white/70": alpha(WHITE, 0.7),
    // Gold text on cards and tints is always bright-gold; plain `primary` is too dark there.
    "bright-gold": token("bright-gold"),
    "error-text": token("error-text"),
    "success-text": token("success-text"),
  };
  for (const [surfaceName, surface] of Object.entries(surfaces)) {
    for (const [textName, text] of Object.entries(texts)) {
      it(`${textName} on ${surfaceName}`, () => {
        expect(contrast(text, surface)).toBeGreaterThanOrEqual(NORMAL_TEXT);
      });
    }
  }
});

describe("brand gold (primary) text: only directly on the page", () => {
  it("passes on the page background", () => {
    expect(contrast(token("primary"), page)).toBeGreaterThanOrEqual(NORMAL_TEXT);
  });

  it("is too dark on a raised card, so cards use bright-gold instead", () => {
    expect(contrast(token("primary"), surfaces.raisedCard)).toBeLessThan(NORMAL_TEXT);
  });
});

describe("text on light and gold surfaces (≥ 4.5:1)", () => {
  it.each([
    ["heading on primary (primary buttons)", "heading", "primary"],
    ["heading on bright-gold (hover, selected chips)", "heading", "bright-gold"],
    ["heading on cream (ticket)", "heading", "cream"],
    ["primary-text on cream (ticket)", "primary-text", "cream"],
  ])("%s", (_label, text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(NORMAL_TEXT);
  });

  it("never white on gold: it fails, which is why buttons use dark text", () => {
    expect(contrast(WHITE, token("primary"))).toBeLessThan(NORMAL_TEXT);
  });
});

describe("non-text contrast (≥ 3:1)", () => {
  it.each([
    ["input and chip borders (line-strong)", () => over(token("line-strong"), page)],
    ["focus ring (bright-gold)", () => token("bright-gold")],
    ["error icon and border (error)", () => token("error")],
  ])("%s on the page", (_label, color) => {
    expect(contrast(color(), page)).toBeGreaterThanOrEqual(NON_TEXT);
  });
});
