export function hapticLight() {
  try { navigator?.vibrate?.(5); } catch {}
}
export function hapticMedium() {
  try { navigator?.vibrate?.(15); } catch {}
}
export function hapticHeavy() {
  try { navigator?.vibrate?.([10, 30, 10]); } catch {}
}
