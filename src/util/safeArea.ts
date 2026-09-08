/**
 * Read the device's safe-area insets (notch / home indicator) once, via a hidden
 * probe element that resolves the CSS env() values. Falls back to small margins.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let cached: Insets | null = null;

export function safeInsets(): Insets {
  if (cached) return cached;
  const fallback: Insets = { top: 14, right: 12, bottom: 14, left: 12 };
  if (typeof document === "undefined") return (cached = fallback);

  try {
    const probe = document.createElement("div");
    probe.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:0",
      "height:0",
      "pointer-events:none",
      "visibility:hidden",
      "padding-top:env(safe-area-inset-top)",
      "padding-right:env(safe-area-inset-right)",
      "padding-bottom:env(safe-area-inset-bottom)",
      "padding-left:env(safe-area-inset-left)",
    ].join(";");
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const n = (v: string) => {
      const px = parseFloat(v);
      return Number.isFinite(px) ? px : 0;
    };
    const insets: Insets = {
      top: Math.max(n(cs.paddingTop), 12),
      right: Math.max(n(cs.paddingRight), 10),
      bottom: Math.max(n(cs.paddingBottom), 12),
      left: Math.max(n(cs.paddingLeft), 10),
    };
    probe.remove();
    cached = insets;
    return insets;
  } catch {
    return (cached = fallback);
  }
}
