// Thin wrappers around native iOS features. Inside the Capacitor app they use
// the native plugins; on the website they fall back to browser APIs or do nothing.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNativeApp = () => Capacitor.isNativePlatform();

export function tapFeedback() {
  if (!isNativeApp()) return;
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function turnFeedback() {
  if (!isNativeApp()) return;
  void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

export function resultFeedback(won: boolean) {
  if (!isNativeApp()) return;
  void Haptics.notification({ type: won ? NotificationType.Success : NotificationType.Warning }).catch(() => {});
}

export type ShareResult = "shared" | "copied" | "failed";

/** Opens the share sheet with the game code; falls back to copying it. */
export async function shareGameCode(gameId: string): Promise<ShareResult> {
  const text = `Wrestle me in Grapple! Game code: ${gameId}`;
  try {
    if (isNativeApp()) {
      await Share.share({ title: "Grapple game code", text, dialogTitle: "Invite a friend" });
      return "shared";
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Grapple game code", text });
      return "shared";
    }
  } catch (error) {
    // User closed the share sheet: not an error worth reporting.
    if (error instanceof Error && /cancel|abort/i.test(error.name + error.message)) return "failed";
  }
  try {
    await navigator.clipboard.writeText(gameId);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Light status bar text so the clock/battery are readable on the dark screens. */
export function setupNativeChrome() {
  if (!isNativeApp()) return;
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}
