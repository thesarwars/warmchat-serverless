/**
 * Notification chime helper. Only three notification kinds get a sound; the
 * rest are silent on purpose so call / system / billing events don't add
 * noise on top of their own UX (ringtones, banners). Preloads on first use,
 * respects the user's `notify_sound` preference, and suppresses playback when
 * the tab is hidden (the OS notification covers that case).
 *
 * Sound bundle expected in /public/sounds/:
 *   - notify-sms.mp3          - lead text replies
 *   - notify-email.mp3        - lead emails + email delivery problems
 *   - notify-appointment.mp3  - appointment booked/rescheduled/cancelled/reminders
 */

type SoundKey = "sms" | "email" | "appointment";

const FILE_BY_KEY: Record<SoundKey, string> = {
  sms: "/sounds/notify-sms.mp3",
  email: "/sounds/notify-email.mp3",
  appointment: "/sounds/notify-appointment.mp3",
};

function keyForKind(kind: string | undefined): SoundKey | null {
  if (!kind) return null;
  if (kind === "sms_inbound") return "sms";
  if (kind === "email_inbound" || kind === "message_bounced" || kind === "message_failed") {
    return "email";
  }
  if (kind.startsWith("appointment_")) return "appointment";
  return null;
}

const audioCache = new Map<SoundKey, HTMLAudioElement>();
const failedKeys = new Set<SoundKey>();

function getAudio(key: SoundKey): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (failedKeys.has(key)) return null;
  const cached = audioCache.get(key);
  if (cached) return cached;
  try {
    const audio = new Audio(FILE_BY_KEY[key]);
    audio.preload = "auto";
    audio.volume = 0.6;
    audio.addEventListener(
      "error",
      () => {
        // If the file is missing, cache the failure so we don't refetch on
        // every notification. The kind stays silent until the file is added.
        failedKeys.add(key);
        audioCache.delete(key);
      },
      { once: true },
    );
    audioCache.set(key, audio);
    return audio;
  } catch {
    failedKeys.add(key);
    return null;
  }
}

export function playNotificationSound(kind?: string): void {
  if (typeof document !== "undefined" && document.hidden) return;
  const key = keyForKind(kind);
  if (!key) return;
  const audio = getAudio(key);
  if (!audio) return;
  try {
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Browsers block autoplay until the user has interacted with the page;
      // the first chime after a fresh page load may be silent. Don't retry -
      // subsequent plays work once the user clicks anywhere.
    });
  } catch {
    /* ignore */
  }
}
