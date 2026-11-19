import { RADIO_TRACK, lastTrack, type TrackInfo } from "../lib/events.ts";
import {
  getClientId, setClientId, isConnected, disconnect,
  initiateLogin, handleCallback, syncTrack, searchSpotifyTrack,
  isTrackLiked, isAutoSaveEnabled, setAutoSave,
  SPOTIFY_CONNECTED_EVENT, type SpotifyTrack
} from "../lib/spotify.ts";

class SpotifySyncElement extends HTMLElement {
  private btn!: HTMLButtonElement;
  private stateLabel!: HTMLElement;
  private dialog!: HTMLDialogElement;
  private closeBtn!: HTMLButtonElement;
  private form!: HTMLFormElement;
  private input!: HTMLInputElement;
  private autoSaveCheck!: HTMLInputElement;
  private disconnectBtn!: HTMLButtonElement;
  private currentSpotifyTrack: SpotifyTrack | null = null;

  connectedCallback() {
    this.btn = this.querySelector(".sp-btn")!;
    this.stateLabel = this.querySelector(".sp-state")!;
    this.dialog = this.querySelector(".sp-dialog")!;
    this.closeBtn = this.querySelector(".sp-close")!;
    this.form = this.querySelector(".sp-form")!;
    this.input = this.querySelector(".sp-input")!;
    this.autoSaveCheck = this.querySelector(".sp-toggle-check")!;
    this.disconnectBtn = this.querySelector(".sp-disconnect")!;

    this.btn.addEventListener("click", () => this.onBtnClick());
    this.closeBtn.addEventListener("click", () => this.dialog.close());
    this.form.addEventListener("submit", (e) => this.onFormSubmit(e));
    this.disconnectBtn.addEventListener("click", () => this.onDisconnect());

    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    document.addEventListener(SPOTIFY_CONNECTED_EVENT, () => this.updateState());

    void handleCallback().then((connected) => {
      if (connected) this.updateState();
    });

    if (lastTrack) this.onTrack(lastTrack);
    this.updateState();
  }

  private updateState() {
    const connected = isConnected();
    this.disconnectBtn.hidden = !connected;
    this.btn.classList.toggle("connected", connected);
  }

  private async onTrack(info: TrackInfo) {
    if (info.entry.type !== "track") {
      this.style.display = "none";
      return;
    }
    this.style.display = "inline-flex";
    this.btn.removeAttribute("data-saved");
    this.stateLabel.textContent = "+";
    this.currentSpotifyTrack = null;

    if (!isConnected()) return;

    const track = await searchSpotifyTrack(info.entry.title || "", info.entry.artist);
    if (!track) return;
    this.currentSpotifyTrack = track;

    const liked = await isTrackLiked(track.id);
    if (liked) {
      this.btn.setAttribute("data-saved", "");
      this.stateLabel.textContent = "✓";
      this.btn.title = "Saved in Liked Songs (tap to open on Spotify)";
    }
  }

  private async onBtnClick() {
    if (!isConnected()) {
      this.input.value = getClientId();
      this.autoSaveCheck.checked = isAutoSaveEnabled();
      this.dialog.showModal();
      return;
    }

    if (this.btn.hasAttribute("data-saved") && this.currentSpotifyTrack?.url) {
      window.open(this.currentSpotifyTrack.url, "_blank", "noopener,noreferrer");
      return;
    }

    const info = lastTrack;
    if (!info?.entry?.title) return;

    this.btn.setAttribute("data-loading", "");
    this.stateLabel.textContent = "…";

    try {
      const res = await syncTrack(info.entry.title, info.entry.artist);
      if (res.success && res.track) {
        this.currentSpotifyTrack = res.track;
        this.btn.setAttribute("data-saved", "");
        this.stateLabel.textContent = "✓";
        this.btn.title = "Saved in Liked Songs (tap to open on Spotify)";
      } else {
        this.stateLabel.textContent = "!";
        setTimeout(() => { if (!this.btn.hasAttribute("data-saved")) this.stateLabel.textContent = "+"; }, 2000);
      }
    } finally {
      this.btn.removeAttribute("data-loading");
    }
  }

  private onFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    const clientId = this.input.value.trim();
    if (!clientId) {
      this.input.focus();
      return;
    }
    setClientId(clientId);
    setAutoSave(this.autoSaveCheck.checked);
    this.dialog.close();
    void initiateLogin(clientId);
  }

  private onDisconnect() {
    disconnect();
    this.btn.removeAttribute("data-saved");
    this.stateLabel.textContent = "+";
    this.updateState();
    this.dialog.close();
  }
}

if (!customElements.get("spotify-sync")) customElements.define("spotify-sync", SpotifySyncElement);
