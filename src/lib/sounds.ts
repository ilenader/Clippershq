/**
 * Sound utility — plays notification and chat sounds.
 * Handles browser autoplay policy by only playing after user interaction.
 */

let userHasInteracted = false;
let notifAudio: HTMLAudioElement | null = null;
let chatAudio: HTMLAudioElement | null = null;

if (typeof window !== "undefined") {
  const markInteracted = () => {
    userHasInteracted = true;
    window.removeEventListener("click", markInteracted);
    window.removeEventListener("keydown", markInteracted);
    window.removeEventListener("touchstart", markInteracted);
  };
  window.addEventListener("click", markInteracted);
  window.addEventListener("keydown", markInteracted);
  window.addEventListener("touchstart", markInteracted);
}

function getNotifAudio(): HTMLAudioElement {
  if (!notifAudio) {
    notifAudio = new Audio("/sounds/whoosh-notification-ding-betacut-1-00-01.mp3");
    notifAudio.volume = 0.5;
  }
  return notifAudio;
}

function getChatAudio(): HTMLAudioElement {
  if (!chatAudio) {
    chatAudio = new Audio("/sounds/chat-ping.wav");
    chatAudio.volume = 0.4;
  }
  return chatAudio;
}

export function playNotificationSound() {
  if (!userHasInteracted) return;
  try {
    const audio = getNotifAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}

export function playChatSound() {
  if (!userHasInteracted) return;
  try {
    const audio = getChatAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}
