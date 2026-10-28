// Chingu Care AI's parent-mode tokens (dashboard/src/styles/chingu-tokens.css in
// the main product), the same set the website and phone apps use since the
// 28 Oct 2026 redesign. Navy is for text, icons and focus rings, never a fill;
// the parent's action colour fills only the main buttons.
export const colors = {
  canvas: "#F6F9F7",
  paper: "#FFFFFF",
  stage: "#FFF9F3",
  hero: "#F6E8D7",
  heroEdge: "#E7D4C0",
  warm: "#FFF4EB",
  mist: "#DCEBE4",
  rule: "#C8DBD2",
  parentRule: "#B8CEC4",
  persimmon: "#C4613A",
  action: "#A64B29",
  actionSoft: "#FFF0E6",
  brandSoft: "#FAEDE7",
  brandText: "#93421F",
  listening: "#A34124",
  celadon: "#2B7A6B",
  positive: "#216052",
  positiveSoft: "#E4F2EC",
  positiveBorder: "#9ABEB0",
  notePaper: "#F0F6F1",
  hwangto: "#D4926A",
  cream: "#F5E6D3",
  navy: "#1C3D52",
  textSoft: "#365467",
  muted: "#526873",
  help: "#8F2834",
  helpSoft: "#FFF1F1",
  helpBorder: "#E7B9BD",
};

// Pretendard alone, as on the website: it carries Hangul and Latin in one voice.
export const fonts = {
  sans: "Pretendard-Regular",
  sansSemi: "Pretendard-SemiBold",
  sansBold: "Pretendard-Bold",
};

/** 20 for buttons and inner cards, 40 for stadium panels and photographs, pill for chips and bars. */
export const radius = { button: 20, panel: 40, pill: 999 };

/** The website's soft shadow, 48 dp spread, tinted with Chingu navy. */
export const shadow = {
  soft: "0px 24px 48px rgba(28, 61, 82, 0.10)",
  lifted: "0px 18px 36px rgba(28, 61, 82, 0.16)",
};

/** Headlines track in at -0.035em, as on the website. */
export const tight = (fontSize: number) => Math.round(fontSize * -0.035 * 10) / 10;
