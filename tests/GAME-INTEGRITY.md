Score integrity protocol, version 1

- Ranked play starts only after the server returns a stored random seed.
- Only food generation uses that seed. Graphics retain independent randomness.
- The browser records effective direction changes with tick numbers. The finish request includes ticks and moves, never trusted progress data.
- The build extracts the exact rule constants and tick functions from game.html into a headless replay factory. Keep that extraction in sync when changing the game; increase RULES_VERSION when changing mechanics.
- The server replays movement, collisions, food expiration, effects and scoring; checks the final outcome and minimum elapsed time; and stores a verified result atomically. Proof attempts, run lifetime, request size and tick count are bounded.
- Account XP, quests, achievements, stats and personal records are derived from verified results. Only preferences can be written through /api/profile. Repeated completion cannot award twice.
- Old rows and legacy profile data are retained. Unverified rows and legacy progress fields are excluded from ranked scores and authoritative progress.
- Start quotas use an HMAC of the edge-supplied network address plus a player quota, enforced inside the same INSERT statement. IPv6 addresses share a /64 quota. Guests without a network identity share one bucket whose per-minute size is the SHARED_START_LIMIT_PER_MINUTE setting (default 120) and has no daily cap; the per-player quota still applies. The admin screen shows 24-hour starts, peak minute and rejected starts so the setting can follow measured traffic. No raw address is stored.
- Replay validates legal gameplay; it does not identify humans or prevent bots from making legal moves. For manual review, the moves of the 50 highest verified scores of at least 100 points are kept for 30 days (at most 128 KB each; larger lists are noted but not stored) and are readable only by the owner.
- Identity headers are honoured only when TRUST_PLATFORM_IDENTITY=1. That setting declares that the platform writes the headers; it is not authentication.

Run npm run test:security for backend regression checks. Browser QA additionally compared food/body/effect state and scores across all six maps and three difficulties, including startup waiting, guest/account persistence and pause/resume.
