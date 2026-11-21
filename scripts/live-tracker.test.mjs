import { parseYouTubeLiveHtml, isLiveNow, isScheduled, countdownText, liveStreamProgram } from "../src/lib/live-stream.ts";
import { mockLiveStream, clearLiveStream, readLiveStreamData } from "./live-tracker.mjs";

const fail = (m) => {
  console.error("✗", m);
  process.exit(1);
};
const assert = (c, m) => {
  if (!c) fail(m);
};

// 1. Offline test
const offlineHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.youtube.com/channel/UCXF6DMVLIVRr2OQAqyfEGeg">
      <title>Fred again . . - YouTube</title>
    </head>
    <body>Channel homepage with no active stream</body>
  </html>
`;
const offline = parseYouTubeLiveHtml(offlineHtml, "UCXF6DMVLIVRr2OQAqyfEGeg");
assert(offline.status === "offline", "offline status");
assert(offline.channelId === "UCXF6DMVLIVRr2OQAqyfEGeg", "offline channelId");
assert(offline.youtubeId === undefined, "offline youtubeId undefined");

// 2. Scheduled stream test
const scheduledHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.youtube.com/watch?v=c0-hvjV2A5Y">
      <meta property="og:title" content="Fred again.. Live from Delhi">
    </head>
    <body>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "videoId": "c0-hvjV2A5Y",
            "title": "Fred again.. Live from Delhi",
            "isLive": false
          },
          "microformat": {
            "playerMicroformatRenderer": {
              "liveBroadcastDetails": {
                "isLiveNow": false,
                "startTimestamp": "2026-12-05T15:00:00Z"
              }
            }
          }
        };
      </script>
    </body>
  </html>
`;
const beforeStart = Math.floor(Date.parse("2026-12-05T14:30:00Z") / 1000);
const sched = parseYouTubeLiveHtml(scheduledHtml, "UCXF6DMVLIVRr2OQAqyfEGeg", beforeStart);
assert(sched.status === "scheduled", "scheduled status before start");
assert(sched.youtubeId === "c0-hvjV2A5Y", "scheduled youtubeId");
assert(sched.title === "Fred again.. Live from Delhi", "scheduled title");
assert(sched.startTime === Math.floor(Date.parse("2026-12-05T15:00:00Z") / 1000), "scheduled startTime");
assert(sched.thumbnail === "https://i.ytimg.com/vi/c0-hvjV2A5Y/hqdefault.jpg", "scheduled thumbnail");

// 3. Time transition: at scheduled start time, status becomes live
const atStart = Math.floor(Date.parse("2026-12-05T15:00:00Z") / 1000);
const autoLive = parseYouTubeLiveHtml(scheduledHtml, "UCXF6DMVLIVRr2OQAqyfEGeg", atStart);
assert(autoLive.status === "live", "auto-live status at start time");

// 4. Active live stream test
const activeLiveHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.youtube.com/watch?v=c0-hvjV2A5Y">
      <meta name="title" content="Fred again.. Live Broadcast">
    </head>
    <body>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": { "videoId": "c0-hvjV2A5Y", "title": "Fred again.. Live Broadcast", "isLive": true },
          "microformat": {
            "playerMicroformatRenderer": {
              "liveBroadcastDetails": { "isLiveNow": true, "startTimestamp": "2026-11-20T01:00:00Z" }
            }
          }
        };
      </script>
    </body>
  </html>
`;
const activeLive = parseYouTubeLiveHtml(activeLiveHtml, "UCXF6DMVLIVRr2OQAqyfEGeg");
assert(activeLive.status === "live", "active live status");
assert(activeLive.youtubeId === "c0-hvjV2A5Y", "active live youtubeId");

// 5. Helper tests: isLiveNow & isScheduled
assert(!isLiveNow(offline), "offline is not live");
assert(!isLiveNow(sched, beforeStart), "scheduled is not live before start");
assert(isLiveNow(sched, atStart), "scheduled is live at start");
assert(isLiveNow(activeLive), "active stream is live");

assert(isScheduled(sched, beforeStart), "scheduled is scheduled before start");
assert(!isScheduled(sched, atStart), "scheduled is not scheduled at start");
assert(!isScheduled(activeLive), "active stream is not scheduled");
assert(!isScheduled(offline), "offline is not scheduled");

// 6. Countdown text
assert(countdownText(100000, 100000) === "0:00", "countdown zero");
assert(countdownText(100000 + 45, 100000) === "0:45", "countdown seconds");
assert(countdownText(100000 + 150, 100000) === "2:30", "countdown minutes");
assert(countdownText(100000 + 3600 * 3 + 120, 100000) === "3h 2m", "countdown hours");
assert(countdownText(100000 + 86400 * 2 + 3600 * 5, 100000) === "2d 5h", "countdown days");

// 7. liveStreamProgram test
const prog = liveStreamProgram(sched);
assert(prog.id === "live-c0-hvjV2A5Y", "live program id");
assert(prog.youtubeId === "c0-hvjV2A5Y", "live program youtubeId");
assert(prog.entries.length === 1, "live program has 1 entry");
assert(prog.entries[0].type === "track", "entry type is track");
assert(prog.entries[0].title === "Fred again.. Live from Delhi", "entry title");
assert(prog.entries[0].artist === "Fred again..", "entry artist");
assert(prog.entries[0].offset === 0, "entry offset is 0");

// 8. Mock & clear file test
const mockData = mockLiveStream("c0-hvjV2A5Y", 600, "Test Stream");
assert(mockData.status === "scheduled", "mock is scheduled");
assert(readLiveStreamData()?.youtubeId === "c0-hvjV2A5Y", "mock file read matches");

const cleared = clearLiveStream();
assert(cleared.status === "offline", "cleared is offline");
assert(readLiveStreamData()?.status === "offline", "cleared file read matches");

// 9. Ended live stream test (with endTimestamp and isLiveNow: false)
const endedLiveHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.youtube.com/watch?v=q0CuV2PKAzE">
      <meta property="og:title" content="Fred again.. - One Day in Tokyo with Chihei Hatakeyama">
    </head>
    <body>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "videoId": "q0CuV2PKAzE",
            "title": "Fred again.. - One Day in Tokyo with Chihei Hatakeyama",
            "isLive": false,
            "isLiveContent": false
          },
          "microformat": {
            "playerMicroformatRenderer": {
              "liveBroadcastDetails": {
                "isLiveNow": false,
                "startTimestamp": "2026-11-21T17:00:08Z",
                "endTimestamp": "2026-11-21T18:04:56Z"
              }
            }
          }
        };
      </script>
    </body>
  </html>
`;
const afterEnd = Math.floor(Date.parse("2026-11-21T18:30:00Z") / 1000);
const ended = parseYouTubeLiveHtml(endedLiveHtml, "UCXF6DMVLIVRr2OQAqyfEGeg", afterEnd);
assert(ended.status === "offline", "ended stream status is offline");
assert(ended.youtubeId === undefined, "ended stream youtubeId is undefined");
assert(!isLiveNow(ended, afterEnd), "ended stream is not live now");
assert(!isScheduled(ended, afterEnd), "ended stream is not scheduled");

// 10. Ended stream with isPostLiveDvr or status ARCHIVED
const postLiveHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.youtube.com/watch?v=q0CuV2PKAzE">
    </head>
    <body>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": { "videoId": "q0CuV2PKAzE", "isPostLiveDvr": true, "isLive": false }
        };
      </script>
    </body>
  </html>
`;
const postLive = parseYouTubeLiveHtml(postLiveHtml, "UCXF6DMVLIVRr2OQAqyfEGeg");
assert(postLive.status === "offline", "postLive stream status is offline");
assert(!isLiveNow(postLive), "postLive is not live");

// 11. Stale scheduled stream well past startup grace period (e.g. 2 hours late without isLiveNow)
const staleSchedTime = Math.floor(Date.parse("2026-12-05T17:00:00Z") / 1000);
const staleSched = parseYouTubeLiveHtml(scheduledHtml, "UCXF6DMVLIVRr2OQAqyfEGeg", staleSchedTime);
assert(staleSched.status === "offline", "stale scheduled stream without liveNow becomes offline");
assert(!isLiveNow(staleSched, staleSchedTime), "stale scheduled stream is not live");

// 12. Non-live video with no startTimestamp and not live is never marked scheduled
const regularVideoHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.youtube.com/watch?v=2_64XAqYgJ0">
      <meta property="og:title" content="Regular Video">
    </head>
    <body>
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": { "videoId": "2_64XAqYgJ0", "title": "Regular Video", "isLive": false }
        };
      </script>
    </body>
  </html>
`;
const regVideo = parseYouTubeLiveHtml(regularVideoHtml, "UCXF6DMVLIVRr2OQAqyfEGeg");
assert(regVideo.status === "offline", "regular video is offline, never scheduled");
assert(!isScheduled(regVideo), "regular video is not scheduled");

console.log("✓ live-tracker tests passed");
