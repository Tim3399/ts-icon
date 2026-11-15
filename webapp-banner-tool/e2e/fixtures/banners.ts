// Realistic banner fixtures (T-142-F1 item 4). The pictures are drawn in the
// page with a canvas, so no image dependency is needed: dark, photo-like
// gradients with soft light and fine grain and a short title. No polka dots,
// no fully saturated hue (saturation stays at or below 45 %).
import type { Page } from "@playwright/test";

export type BannerKind =
  /** A channel spacer: a dark, almost flat strip with a centred title. */
  | "spacer"
  /** A wide artwork: a dark sweep of light across the full width, title at the right. */
  | "artwork"
  /** A light image: pale, low contrast, dark title. */
  | "light";

export interface BannerSpec {
  kind: BannerKind;
  title: string;
  /** Hue 0-359; the saturation is fixed per kind. */
  hue: number;
}

/** The named fixtures the route fixtures and the screenshots use. */
export const BANNERS = {
  spacer: { kind: "spacer", title: "Community", hue: 215 },
  artwork: { kind: "artwork", title: "Gaming Area", hue: 255 },
  light: { kind: "light", title: "Lounge", hue: 35 },
  forest: { kind: "artwork", title: "Counter-Strike", hue: 150 },
  dusk: { kind: "artwork", title: "Hytale", hue: 20 },
} satisfies Record<string, BannerSpec>;

/** Cycled over the channels that get a banner in the route fixtures. */
export const BANNER_CYCLE: BannerSpec[] = [
  BANNERS.spacer,
  BANNERS.artwork,
  BANNERS.forest,
  BANNERS.dusk,
  BANNERS.light,
];

/** A 500 x 44 banner PNG of the given kind, drawn in the page. */
export async function fixtureBanner(page: Page, spec: BannerSpec): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(({ kind, title, hue }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 500;
      canvas.height = 44;
      const c = canvas.getContext("2d")!;
      const light = kind === "light";
      const base = c.createLinearGradient(0, 0, 500, 44);
      base.addColorStop(0, light ? `hsl(${hue} 30% 90%)` : `hsl(${hue} 32% 11%)`);
      base.addColorStop(1, light ? `hsl(${hue + 20} 26% 80%)` : `hsl(${hue + 28} 30% 20%)`);
      c.fillStyle = base;
      c.fillRect(0, 0, 500, 44);

      // Soft light, the way a photo has it: wide radial glows at low alpha.
      const glows =
        kind === "spacer"
          ? [[250, 22, 220, 0.1]]
          : [
              [380, 8, 240, 0.28],
              [90, 60, 180, 0.16],
            ];
      for (const [x, y, r, a] of glows) {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, light ? `hsl(${hue} 30% 98% / ${a})` : `hsl(${hue + 15} 40% 62% / ${a})`);
        g.addColorStop(1, "transparent");
        c.fillStyle = g;
        c.fillRect(0, 0, 500, 44);
      }
      if (kind === "artwork") {
        // A diagonal sweep with a soft edge across the whole width.
        const sweep = c.createLinearGradient(120, 0, 260, 44);
        sweep.addColorStop(0, "transparent");
        sweep.addColorStop(0.5, `hsl(${hue + 10} 35% 70% / 0.14)`);
        sweep.addColorStop(1, "transparent");
        c.fillStyle = sweep;
        c.fillRect(0, 0, 500, 44);
      }

      // Fine, deterministic grain.
      let seed = hue * 7919 + title.length * 104729;
      const next = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let i = 0; i < 700; i++) {
        const shade = next() > 0.5 ? "255 255 255" : "0 0 0";
        c.fillStyle = `rgb(${shade} / ${(0.02 + next() * 0.04).toFixed(3)})`;
        c.fillRect(Math.floor(next() * 500), Math.floor(next() * 44), 1, 1);
      }

      // Title.
      c.font = "700 19px system-ui, -apple-system, 'Segoe UI', sans-serif";
      c.textBaseline = "middle";
      // Right-aligned on channel banners: TeamSpeak draws the channel name over
      // the left of the banner, so real banners keep their own text to the right.
      c.textAlign = kind === "spacer" ? "center" : "right";
      const x = kind === "spacer" ? 250 : 484;
      if (!light) {
        c.fillStyle = "rgb(0 0 0 / 0.45)";
        c.fillText(title, x + 1, 23);
      }
      c.fillStyle = light ? "hsl(220 25% 16%)" : "hsl(210 25% 94%)";
      c.fillText(title, x, 22);
      return canvas.toDataURL("image/png").split(",")[1];
    }, spec),
    "base64",
  );
}

/**
 * A 1000 x 400 photo-like source image for the crop workflows: a dusk sky,
 * a sun glow and two mountain ridges, drawn in the page.
 */
export async function fixtureSource(page: Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 400;
      const c = canvas.getContext("2d")!;
      const sky = c.createLinearGradient(0, 0, 0, 400);
      sky.addColorStop(0, "hsl(225 32% 14%)");
      sky.addColorStop(0.6, "hsl(255 28% 28%)");
      sky.addColorStop(1, "hsl(15 38% 46%)");
      c.fillStyle = sky;
      c.fillRect(0, 0, 1000, 400);
      const sun = c.createRadialGradient(680, 250, 0, 680, 250, 260);
      sun.addColorStop(0, "hsl(30 45% 78% / 0.85)");
      sun.addColorStop(1, "transparent");
      c.fillStyle = sun;
      c.fillRect(0, 0, 1000, 400);
      const ridge = (color: string, base: number, amp: number, phase: number) => {
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(0, 400);
        for (let x = 0; x <= 1000; x += 20) {
          c.lineTo(
            x,
            base - amp * Math.abs(Math.sin(x / 130 + phase)) - amp * 0.4 * Math.sin(x / 47),
          );
        }
        c.lineTo(1000, 400);
        c.closePath();
        c.fill();
      };
      ridge("hsl(240 22% 18%)", 300, 70, 0.4);
      ridge("hsl(230 26% 10%)", 360, 50, 1.7);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
}
