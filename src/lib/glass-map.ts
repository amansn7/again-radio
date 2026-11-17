export type GlassMaterial = "clear" | "regular";
export type GlassAppearance = "light" | "dark";

const MATERIALS = {
  clear: {
    light: { shadowLift: 0.18, highlightRolloff: 0 },
    dark: { shadowLift: 0.15, highlightRolloff: 0.2 },
  },
  regular: {
    blur: 4.5,
    light: { fillSigma: 15, fillOpacity: 0.34, tone: [0.36, 0.67, -0.1113, 1.1031] },
    dark: { fillSigma: 14, fillOpacity: 0.65, tone: [0.105, 0.83, -0.2091, 1.0648] },
  },
} as const;

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ponytail: rounded-rect SDF instead of the paste's tessellated squircle; matches CSS border-radius exactly.
function roundedRect(px: number, py: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const sx = px < 0 ? -1 : 1;
  const sy = py < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy);
    return { d: len - r, nx: (qx / len) * sx, ny: (qy / len) * sy };
  }
  return qx > qy ? { d: qx - r, nx: sx, ny: 0 } : { d: qy - r, nx: 0, ny: sy };
}

/** R/G encode the outward normal scaled by a circular bezel falloff; alpha is shape coverage. */
export function fieldURL(w: number, h: number, radius: number, bezel: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const hw = w / 2, hh = h / 2;
  const r = Math.min(radius, hw, hh);
  const bz = Math.max(1, Math.min(bezel, hw, hh));
  for (let j = 0; j < h; j++) {
    const py = j + 0.5 - hh;
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      const { d, nx, ny } = roundedRect(i + 0.5 - hw, py, hw, hh, r);
      if (d < -(bz + 4)) {
        data[o] = data[o + 1] = data[o + 2] = 128;
        data[o + 3] = 255;
        continue;
      }
      const depth = sat(-d / bz);
      const edge = 1 - sat(Math.sqrt((2 - depth) * depth));
      data[o] = Math.round(255 * (0.5 - nx * edge * 0.5));
      data[o + 1] = Math.round(255 * (0.5 - ny * edge * 0.5));
      data[o + 2] = 128;
      data[o + 3] = Math.round(255 * sat(0.5 - d));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function toneTable(material: GlassMaterial, appearance: GlassAppearance): string {
  const dark = appearance === "dark";
  const values = Array.from({ length: 33 }, (_, n) => {
    const v = n / 32;
    if (material === "regular") {
      const [a, b, q] = MATERIALS.regular[appearance].tone;
      const weight = dark ? 0.9 : 0.8;
      return weight * (a + b * v + q * v * v) + (1 - weight) * v;
    }
    const spec = MATERIALS.clear[appearance];
    const tone = v + spec.shadowLift * (1 - v) ** 3 - spec.highlightRolloff * v ** 3;
    const tinted = dark ? 0.38 * v + 0.2 : 0.78 * v + 0.26;
    const tintWeight = dark ? 0.14 : 0.06;
    return sat((1 - tintWeight) * tone + tintWeight * tinted);
  });
  return values.map((v) => v.toFixed(5)).join(" ");
}

/** The paste's per-lens chain: optional frost, bend through the field, tone, clip to the shape. */
export function filterMarkup(o: {
  w: number; h: number; field: string; material: GlassMaterial; appearance: GlassAppearance; refraction: number;
}): string {
  const dark = o.appearance === "dark";
  const parts = [
    `<feImage href="${o.field}" x="0" y="0" width="${o.w}" height="${o.h}" preserveAspectRatio="none" result="field"/>`,
  ];
  let base = "SourceGraphic";
  if (o.material === "regular") {
    const spec = MATERIALS.regular[o.appearance];
    parts.push(
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${MATERIALS.regular.blur}" result="frost"/>`,
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${spec.fillSigma}" result="fill"/>`,
      `<feBlend in="frost" in2="fill" mode="${dark ? "darken" : "lighten"}" result="blend"/>`,
      `<feComposite in="blend" in2="frost" operator="arithmetic" k2="${spec.fillOpacity}" k3="${1 - spec.fillOpacity}" result="mix"/>`,
    );
    base = "mix";
  }
  const table = toneTable(o.material, o.appearance);
  parts.push(
    `<feDisplacementMap in="${base}" in2="field" scale="${o.refraction * 2}" xChannelSelector="R" yChannelSelector="G" result="refracted"/>`,
    `<feComponentTransfer in="refracted" result="tone"><feFuncR type="table" tableValues="${table}"/><feFuncG type="table" tableValues="${table}"/><feFuncB type="table" tableValues="${table}"/></feComponentTransfer>`,
  );
  let color = "tone";
  if (o.material === "regular") {
    parts.push(`<feColorMatrix in="tone" type="saturate" values="${MATERIALS.regular[o.appearance].tone[3]}" result="color"/>`);
    color = "color";
  }
  parts.push(`<feComposite in="${color}" in2="field" operator="in"/>`);
  return parts.join("");
}
