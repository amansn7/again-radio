import { RADIO_TIME, lastTrack, type TimeInfo } from "../lib/events.ts";
import { shareText, shareUrl } from "../lib/share.ts";

// The share button in the transport: the phone's share sheet where there is one, otherwise the
// link goes to the clipboard with a short confirmation.
const button = document.querySelector<HTMLButtonElement>("#rp-share");
const toast = document.querySelector<HTMLElement>(".rp-toast");
let now = 0;
let hide: ReturnType<typeof setTimeout> | undefined;

document.addEventListener(RADIO_TIME, (e) => (now = (e as CustomEvent<TimeInfo>).detail.current));

function confirm(text: string): void {
  if (!toast) return;
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(hide);
  hide = setTimeout(() => (toast.hidden = true), 2400);
}

button?.addEventListener("click", async () => {
  const t = lastTrack;
  if (!t) return;
  const url = shareUrl(location.origin, t.programId, now);
  const text = shareText(t.entry.title ?? t.programTitle, t.programTitle);
  if (navigator.share) {
    try {
      await navigator.share({ title: "again radio", text, url });
    } catch {
      /* dismissed */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    confirm("Link copied");
  } catch {
    confirm("Couldn't copy the link");
  }
});
