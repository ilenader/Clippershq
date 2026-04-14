export function hapticLight() {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(5);
}
export function hapticMedium() {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
}
export function hapticHeavy() {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([10, 30, 10]);
}
