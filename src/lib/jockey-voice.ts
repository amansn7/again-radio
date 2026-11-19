export type JockeyDelivery = "natural" | "bright" | "playful" | "reflective" | "warm";

export interface SpeechProfile {
  rate: number;
  pitch: number;
}

const PROFILES: Record<JockeyDelivery, SpeechProfile> = {
  natural: { rate: 1.01, pitch: 1 },
  bright: { rate: 1.04, pitch: 1.02 },
  playful: { rate: 1.02, pitch: 1.015 },
  reflective: { rate: 0.97, pitch: 0.99 },
  warm: { rate: 0.99, pitch: 0.99 },
};

export function speechProfile(delivery: JockeyDelivery = "natural"): SpeechProfile {
  return PROFILES[delivery];
}
