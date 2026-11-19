export function outroLeadSeconds(text: string, durationSeconds?: number): number {
  return (durationSeconds ?? text.length / 13) + 1.5;
}
