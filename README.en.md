# Apex Rings Capture

[简体中文](README.md) | **English**

Save multi-stage ring-map screenshots from Apex Legends Status interactive match replays in an existing browser session. This project helps Apex players practice ring prediction and review matches for non-commercial learning.

**Version: 0.5.1 · MIT code license · Runs locally · Unofficial project**

All extension code, tests, and supporting scripts in this project were **generated and modified by OpenAI Codex from requirements**. This discloses how the code was developed; it does not imply human review, security certification, or official endorsement by OpenAI. Standard license text, referenced documentation, and third-party content are not original project code.

This project is not officially affiliated with or endorsed by EA, Respawn Entertainment, Apex Legends Status, or OpenAI.

> This project is not endorsed by or affiliated with EA or its licensors.

## Features

- Collect and deduplicate `Open interactive replay` links from a tournament overview.
- Open each replay, wait for its base map and multiple ring outlines, and check display settings and visual stability.
- Hide player information and selected overlays, crop to the complete map, and save a 1024 × 1024 PNG.
- Export a match-index CSV and resume saved progress within or across tournament lists.
- Retry ordinary failures a limited number of times; pause on verification timeouts, login requirements, or explicit access restrictions.
- Use a separate controller window with limited background recovery for batch tasks and an optional keep-awake setting.

The tool captures multiple ring stages recorded by the webpage, rather than only the final ring. It cannot guarantee that the webpage records every stage. It does not export precise ring centers, radii, or raw replay API data.

## Requirements

- Desktop Microsoft Edge based on Chromium. Other Chromium browsers may work, but compatibility is not guaranteed.
- Normal browser access to the tournament overview and its match replays.
- Keep both the match window and controller visible, with the original match tab active in its own window.
- Python, Anaconda, Node.js, and third-party packages are not needed to install or run the extension. Node.js is only needed for development checks.

The website's access rules and content rights are separate from the code license. Read the [disclaimer and content-rights statement](DISCLAIMER.md) and [security and privacy statement](SECURITY.md) before use. Those supporting documents are currently in Chinese; the MIT license text is in English.

## Installation

1. Download the repository ZIP and extract it into a permanent folder. Do not run directly from the archive.
2. Open `edge://extensions/` in Edge.
3. Enable **Developer mode**, then choose **Load unpacked**.
4. Select the folder that **directly contains `manifest.json`**.
5. Find the extension named **Apex 圈型截图（当前浏览器）** in the extensions menu and optionally pin it to the toolbar.

This is an unpacked extension installed from source. It is not presented as having passed browser-store review. You can inspect the source before installation.

The extension interface is currently in Chinese. The instructions below include the actual button labels and their English meanings; an English README does not change the interface language.

## Capture one sample first

1. Open a tournament overview in your regular browser, for example:

   <https://apexlegendsstatus.com/algs/Y6-Split2/Pro-League/APAC_S/Overview#tab_replaysandbans>

2. Confirm normal access, then click the extension icon from that tab to open the separate controller window.
3. Click **1. 收集当前列表** (Collect current list). Wait for collection to finish and check the match count.
4. Click **2. 采集第一场** (Capture first match). The extension opens the replay in the original tab and adjusts its display settings.
5. Wait for the download, then check that the image shows the complete base map and multiple ring outlines, with player labels and other targeted overlays hidden.
6. If the sample is correct, tick the sample-confirmation checkbox and click **3. 批量续跑（含后续列表）** (Run/resume batch, including subsequent lists).

During capture, do not close the original tab, switch its window to another tab, scroll the map, or change its zoom. Run only one controller at a time to avoid conflicting tasks.

### Display settings

| Setting | Target value |
| --- | --- |
| Player information | `All players hidden` |
| `Next ring` | On |
| `All rings` | On |
| `Care packages` | Off |
| `Respawn beacons` | Off |
| `Heatmap` | Off |
| `Pathing` | Off |
| Other dropdown menus | Keep the webpage's existing value |

Settings are checked repeatedly while loading and checked again without modification before saving. If a control cannot be identified uniquely, the operation fails rather than guessing which control to click.

## Process multiple tournament lists

Enter one overview URL per line in the field labeled **当前列表完成后，依次采集这些赛事列表** (Process these lists after the current one). For example:

```text
https://apexlegendsstatus.com/algs/Y6-Split2/Pro-League/NA/Overview#tab_replaysandbans
https://apexlegendsstatus.com/algs/Y6-Split2/Pro-League/EMEA/Overview#tab_replaysandbans
```

The current list runs first, followed by the remaining URLs in order. Duplicate URLs are removed. Leave the field empty to process only the current list. Subsequent lists reuse the confirmed sample settings without another per-list confirmation.

Only HTTPS Apex Legends Status `Overview` URLs with the same origin as the original page are accepted. Access is not extended to other origins. Seasons, stages, and regions can vary, provided their page structure remains compatible.

## Output files

Files are saved under the **browser's current download directory**, independently of where the extension is installed:

```text
ApexRings/
├── images/
│   └── match_name__replay_url_identifier.png
├── index_event_and_region_url_identifier.csv
└── diagnostics/                # Only when failure diagnostics are explicitly enabled
    └── replay_url_identifier.json
```

Short identifiers are derived from replay or overview URLs to reduce filename collisions. They are not the website's original match IDs.

The CSV uses UTF-8 with a BOM and contains these fields in order:

| Field | Meaning |
| --- | --- |
| `id` | Short identifier derived from the replay URL |
| `name` | Match name |
| `map` | Map inferred from the match name; empty if unrecognized |
| `url` | Replay URL |
| `image` | Image path relative to the browser's download directory |
| `status` | `pending`, `running`, `success`, `failed`, or `paused` |
| `attempts` | Cumulative attempts; may exceed 3 after resuming |
| `rings` | Number of detected ring-outline SVG elements; **not an authoritative count of ring stages** |
| `error` | Most recent error message |

The CSV is exported when processing of the current list ends. You can also click **导出当前列表 CSV** (Export current list CSV). Downloads use an overwrite policy for the same path; back up files first if you need previous versions.

If the browser asks where to save every download, capture may wait for a save dialog. The extension does not change that browser setting.

## Pausing, retries, and resuming

- An ordinary match failure gets at most 3 attempts in one processing pass. Each retry reopens that replay and repeats the checks before taking a screenshot.
- Ordinary retry delays are approximately 8 and 16 seconds. Matches have an additional delay of about 8–10 seconds. Capture is sequential, not concurrent.
- Queues, success records, multi-list plans, and preferences are saved in the extension's `storage.local`.
- After pausing, use the batch button to resume the same confirmed plan and skip successful records.
- Do not collect the current list again merely to resume: doing so updates the queue and requires a new sample confirmation.
- After closing the controller, click the extension icon from a same-origin tournament page to restore saved local state.
- Uninstalling the extension, clearing its storage, or using a different browser profile loses local checkpoints. The CSV is not a checkpoint-import file.
- The tool does not detect whether successfully downloaded images were later moved or deleted.

### Website verification and access restrictions

When an automatic verification prompt appears, the tool waits passively. The default timeout is 90 seconds and can be set to 5–600 seconds. Verification waiting time is excluded from the roughly two-minute map-check budget.

The extension does not click CAPTCHA controls, solve challenges, read or inject cookies, disguise browser identity, or bypass login or payment restrictions. It pauses on verification timeouts, login requirements, or denied access. Complete any required human verification yourself on the normal webpage. If restrictions recur, stop capture and ask the website about permission.

### An unresponsive controller

During a batch, the controller sends a heartbeat every 15 seconds and the background checks approximately once per minute. After at least 120 seconds without a heartbeat, it attempts to reload the controller and resume the saved plan. Browser scheduling may delay this; recovery does not have a guaranteed deadline.

Automatic recovery is limited to 3 attempts in 10 minutes. Manual pauses, closing the original tab or controller, verification timeouts, and explicit access restrictions are not intended to trigger ordinary stall recovery. Sample capture and list collection do not restart automatically.

The optional keep-awake checkbox requires separate permission for `power`. It requests that the computer and display remain awake during the task without changing permanent system power settings. It cannot prevent manual sleep, shutdown, or all lid-closing behavior. Capture cannot run while the computer is asleep, and background alarms cannot wake the computer.

## Security and privacy

- The release does not embed developer or user names, accounts, private email addresses, local computer paths, real execution logs, or browser sessions.
- There is no telemetry, remote analytics, background data upload, or remotely loaded extension script. Normal website access still creates requests made by the website and browser.
- Records and images stay local and may contain public match information. Local output is not automatically anonymous.
- **Failure diagnostics are disabled by default.** If enabled, they may save page titles, URLs, control text and selected values, element metadata, dimensions, and timestamps. Password input values are not exported, but arbitrary webpage metadata cannot be guaranteed free of sensitive information.
- Review logs, diagnostics, and screenshots before sharing. The release archive contains no collected images, CSV files, or real diagnostics.

See [SECURITY.md](SECURITY.md) for permissions, data flow, and vulnerability reporting. Codex-generated code is not a security guarantee.

## Limitations and validation

The current adapter expects one visible Leaflet map container, a complete base-map image, and white SVG ring outlines. The base map must be fully visible, at least two ring-outline elements must be detected, and consecutive screenshots must remain stable for at least 3 seconds.

Failures can result from changes to the website or controls, Canvas or tiled rendering, incomplete historical data, continuously animated overlays, browser zoom, small windows, frozen tabs, or website access restrictions.

1024 × 1024 standardizes image dimensions, not geographic scale across maps. A successful status does not replace a visual check of ring completeness.

Local automated tests cover origin boundaries, cropping, display settings, verification waiting, queues, basic failure-handling logic, and background recovery. Some tests use virtual time and **cannot replace a real, long-running unattended browser test**. Compatibility with every season, map, or browser is not guaranteed.

## Development checks

Node.js 22 or later is recommended for development checks. No npm dependencies need to be installed. Run these commands from this directory:

```sh
node --test tests.mjs
node scripts/check-release.mjs
```

If a restricted environment cannot create test subprocesses, use:

```sh
node --test --test-isolation=none tests.mjs
```

The release check examines the file list, version consistency, common sensitive-data patterns, and unexpected output files. It cannot identify every privacy or security issue. These commands are not required to run the extension.

## License, non-commercial purpose, and disclaimer

The project is intended as a free, non-commercial ring-learning and match-review tool. Its code and accompanying project documentation use the [MIT License](LICENSE). **MIT permits commercial reuse of the code; the project's non-commercial purpose adds no restriction to MIT.**

MIT grants no rights to maps, artwork, brands, webpages, match data, or screenshots owned by EA, Respawn, Apex Legends Status, or other third parties. Generating a screenshot with this tool does not make the underlying content freely licensed. Verify applicable permissions before publicly distributing a screenshot collection.

The software is provided as is, without guarantees of accuracy, continued availability, security, or fitness for a particular purpose. See [DISCLAIMER.md](DISCLAIMER.md) for content-rights and liability statements. Those statements do not exclude liability that applicable law does not allow to be excluded, or replace third-party permission.

## References and publishing

- Website and data source: [Apex Legends Status](https://apexlegendsstatus.com/)
- [EA content policy](https://help.ea.com/en/articles/security-and-rules/ea-content-policy/)
- Browser APIs: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [power](https://developer.chrome.com/docs/extensions/reference/api/power)
- GitHub upload instructions, currently in Chinese: [PUBLISHING.md](PUBLISHING.md)
