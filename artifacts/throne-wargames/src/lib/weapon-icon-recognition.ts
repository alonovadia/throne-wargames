export type IconSignature = {
  pixels: number[];
  density: number;
};

export type WeaponTemplateBank = Record<string, IconSignature[]>;

export type WeaponSuggestion = {
  key: string | null;
  confidence: number;
  distance: number;
};

const signatureWidth = 12;
const signatureHeight = 16;

export function createWeaponTemplateBank(): WeaponTemplateBank {
  return {};
}

export function createIconSignature(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  channels = 4,
): IconSignature {
  const normalized: number[] = [];
  let active = 0;
  for (let targetY = 0; targetY < signatureHeight; targetY += 1) {
    for (let targetX = 0; targetX < signatureWidth; targetX += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((targetX + 0.5) / signatureWidth) * width));
      const sourceY = Math.min(height - 1, Math.floor(((targetY + 0.5) / signatureHeight) * height));
      const sourceIndex = (sourceY * width + sourceX) * channels;
      const red = pixels[sourceIndex] ?? 0;
      const green = pixels[sourceIndex + 1] ?? red;
      const blue = pixels[sourceIndex + 2] ?? red;
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      const value = luminance > 0.56 ? 1 : 0;
      normalized.push(value);
      active += value;
    }
  }
  return {
    pixels: normalized,
    density: active / normalized.length,
  };
}

export function compareIconSignatures(left: IconSignature, right: IconSignature) {
  if (left.pixels.length !== right.pixels.length || left.pixels.length === 0) return 1;
  let different = 0;
  for (let index = 0; index < left.pixels.length; index += 1) {
    if (left.pixels[index] !== right.pixels[index]) different += 1;
  }
  const densityDistance = Math.abs(left.density - right.density);
  return different / left.pixels.length * 0.85 + densityDistance * 0.15;
}

export function learnWeaponTemplate(
  bank: WeaponTemplateBank,
  key: string,
  signature: IconSignature,
): WeaponTemplateBank {
  if (!key) return bank;
  const existing = bank[key] ?? [];
  return {
    ...bank,
    [key]: [...existing, signature].slice(-8),
  };
}

export function suggestWeaponFromIcon(
  bank: WeaponTemplateBank,
  signature: IconSignature | null,
): WeaponSuggestion {
  if (!signature) return { key: null, confidence: 0, distance: 1 };
  const candidates = Object.entries(bank)
    .flatMap(([key, signatures]) =>
      signatures.map((template) => ({ key, distance: compareIconSignatures(signature, template) })),
    )
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  const runnerUp = candidates.find((candidate) => candidate.key !== best?.key);
  if (!best || best.distance > 0.34 || (runnerUp && runnerUp.distance - best.distance < 0.035)) {
    return { key: null, confidence: 0, distance: best?.distance ?? 1 };
  }
  return {
    key: best.key,
    confidence: Math.round(Math.max(0, Math.min(99, (1 - best.distance) * 100))),
    distance: best.distance,
  };
}

export function suggestWeaponPair(
  bank: WeaponTemplateBank,
  evidence: { main: IconSignature; off: IconSignature } | null,
) {
  return {
    main: suggestWeaponFromIcon(bank, evidence?.main ?? null),
    off: suggestWeaponFromIcon(bank, evidence?.off ?? null),
  };
}

export function learnedWeaponCount(bank: WeaponTemplateBank) {
  return Object.keys(bank).length;
}

export { signatureWidth, signatureHeight };