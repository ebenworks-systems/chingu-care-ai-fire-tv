/**
 * Focus styling that does not rely on colour alone: a focused item grows,
 * gains a thick ring and a lifted shadow, so a viewer with weak contrast
 * vision or colour blindness still sees where they are.
 */

export type FocusLook = {
  ringColor: string;
  ringWidth: number;
  scale: number;
  shadowOpacity: number;
  elevation: number;
};

export const DEFAULT_FOCUS: FocusLook = {
  ringColor: "#C4613A",
  ringWidth: 4,
  scale: 1.06,
  shadowOpacity: 0.22,
  elevation: 10,
};

export function focusStyle(focused: boolean, look: FocusLook = DEFAULT_FOCUS) {
  return focused
    ? {
        borderColor: look.ringColor,
        borderWidth: look.ringWidth,
        transform: [{ scale: look.scale }],
        shadowColor: "#000",
        shadowOpacity: look.shadowOpacity,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: look.elevation,
      }
    : {
        borderColor: "transparent",
        borderWidth: look.ringWidth,
        transform: [{ scale: 1 }],
        shadowOpacity: 0,
        elevation: 0,
      };
}

/** WCAG relative luminance contrast between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
