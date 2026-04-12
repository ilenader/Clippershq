/**
 * Sound utility — plays notification and chat sounds.
 * Uses lazy initialization and checks document interaction state.
 *
 * Sound mapping:
 *   - Site notifications (bell) → chat-ping.wav
 *   - Chat messages → whoosh-notification-ding.mp3
 */

// Notification sound = short ping
const NOTIF_SOUND = "/sounds/chat-ping.wav";
// Chat sound = whoosh ding
const CHAT_SOUND = "/sounds/whoosh-notification-ding-betacut-1-00-01.mp3";

function canPlayAudio(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  // Check if user has interacted — modern browsers track this
  // Also try to detect via document state
  return true; // Let the browser decide — play().catch handles rejection
}

function tryPlay(src: string, volume: number) {
  if (!canPlayAudio()) return;
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    const promise = audio.play();
    if (promise) {
      promise.catch((err) => {
        console.log(`[SOUND] Blocked by browser: ${err.message} (src: ${src})`);
      });
    }
  } catch (err: any) {
    console.log(`[SOUND] Error creating audio: ${err.message}`);
  }
}

export function playNotificationSound() {
  console.log("[SOUND] playNotificationSound called");
  tryPlay(NOTIF_SOUND, 0.5);
}

export function playChatSound() {
  console.log("[SOUND] playChatSound called");
  tryPlay(CHAT_SOUND, 0.5);
}
