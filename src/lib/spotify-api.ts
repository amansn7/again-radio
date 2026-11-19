// Spotify Web API calls for track search, Liked Songs, and Playlist curation.
import { getValidToken } from "./spotify-auth.ts";

export const SPOTIFY_SAVED_EVENT = "spotify:saved";
const KEY_PLAYLIST_ID = "again:spotify:playlist";
const KEY_AUTO_SAVE = "again:spotify:autosave";

export const isAutoSaveEnabled = (): boolean =>
  typeof localStorage !== "undefined" && localStorage.getItem(KEY_AUTO_SAVE) === "true";

export const setAutoSave = (enabled: boolean): void => {
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY_AUTO_SAVE, enabled ? "true" : "false");
};

export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*remix[^)]*\)/i, "")
    .replace(/\s*\([^)]*edit[^)]*\)/i, "")
    .replace(/\s*\(feat\.[^)]*\)/i, "")
    .replace(/[–—]/g, "-")
    .trim();
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  uri: string;
  url: string;
}

export async function searchSpotifyTrack(title: string, artist?: string): Promise<SpotifyTrack | null> {
  const token = await getValidToken();
  if (!token) return null;

  const clean = cleanTrackTitle(title);
  const isFred = !artist || /fred again/i.test(artist);
  const queries = [
    `track:"${clean}" artist:"${isFred ? "Fred again.." : artist}"`,
    `track:${clean} ${isFred ? "Fred again" : artist}`,
    `${clean} ${isFred ? "Fred again" : artist}`
  ];

  for (const q of queries) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        tracks?: {
          items?: Array<{ id: string; name: string; uri: string; artists: Array<{ name: string }>; external_urls: { spotify: string } }>;
        };
      };
      const item = data.tracks?.items?.[0];
      if (item) {
        return {
          id: item.id,
          name: item.name,
          artist: item.artists.map((a) => a.name).join(", "),
          uri: item.uri,
          url: item.external_urls.spotify
        };
      }
    } catch {
      // Continue to next query format
    }
  }
  return null;
}

export async function isTrackLiked(trackId: string): Promise<boolean> {
  const token = await getValidToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return false;
    const [saved] = (await res.json()) as [boolean];
    return Boolean(saved);
  } catch {
    return false;
  }
}

export async function saveToLikedSongs(trackId: string): Promise<boolean> {
  const token = await getValidToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getOrCreateRadioPlaylist(): Promise<string | null> {
  const token = await getValidToken();
  if (!token) return null;
  const cached = localStorage.getItem(KEY_PLAYLIST_ID);
  if (cached) return cached;

  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) return null;
    const me = (await meRes.json()) as { id: string };

    const createRes = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Again Radio · On Air",
        description: "Tracks caught live on Again Radio (again-radio.pages.dev)",
        public: true
      })
    });
    if (!createRes.ok) return null;
    const playlist = (await createRes.json()) as { id: string };
    localStorage.setItem(KEY_PLAYLIST_ID, playlist.id);
    return playlist.id;
  } catch {
    return null;
  }
}

export async function syncTrack(title: string, artist?: string): Promise<{ success: boolean; track?: SpotifyTrack; error?: string }> {
  const track = await searchSpotifyTrack(title, artist);
  if (!track) return { success: false, error: "not_found" };

  const saved = await saveToLikedSongs(track.id);
  if (!saved) return { success: false, error: "save_failed", track };

  if (isAutoSaveEnabled()) {
    const playlistId = await getOrCreateRadioPlaylist();
    if (playlistId) {
      void fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await getValidToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [track.uri] })
      });
    }
  }

  document.dispatchEvent(new CustomEvent(SPOTIFY_SAVED_EVENT, { detail: track }));
  return { success: true, track };
}
