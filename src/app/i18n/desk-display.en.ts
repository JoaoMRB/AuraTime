/**
 * English texts of the Desk Display feature and of the Windows app page (the USB screen page, the screen's own labels, the landing
 * section and the settings entry). Merged into the fallback dictionary of TranslationService; the same
 * keys exist in public/assets/i18n/*.json for every language (checked by a unit test).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DESK_DISPLAY_EN: any = {
  "SCREEN": {
    "NAME": "Desk Display",
    "LABELS": {
      "FOCUS": "FOCUS",
      "BREAK": "BREAK",
      "PAUSED": "PAUSED",
      "READY": "READY",
      "NO_TASKS": "No open tasks",
      "TODAY": "TODAY",
      "STREAK": "DAY STREAK",
      "MINUTES": "min",
      "LAST7": "LAST 7 DAYS",
      "NEXT_ALARM": "NEXT ALARM",
      "COUNTDOWN": "COUNTDOWN",
      "WORLD_CLOCKS": "WORLD CLOCKS",
      "DAY_TODAY": "Today",
      "DAY_TOMORROW": "Tomorrow",
      "IN": "in"
    },
    "WEATHER": {
      "SUNNY": "Clear sky",
      "CLEAR_NIGHT": "Clear night",
      "CLOUDY": "Cloudy",
      "RAINY": "Rain",
      "SNOWY": "Snow",
      "STORMY": "Thunderstorm"
    },
    "DEMO": {
      "TASK_1": "Write the weekly report",
      "TASK_2": "Review the open pull requests",
      "TASK_3": "Plan tomorrow",
      "ALARM": "Morning run",
      "COUNTDOWN": "Team meeting",
      "CITY": "Lisbon"
    },
    "VIEWS": {
      "AUTO": "Automatic rotation",
      "CLOCK": "Clock",
      "FOCUS": "Focus (Pomodoro + tasks)",
      "WEEK": "Week (last 7 days)",
      "ALARM": "Next alarm / countdown",
      "WORLD": "World clocks",
      "WEATHER": "Weather + quote"
    },
    "UI": {
      "NAV": "Desk Display navigation",
      "HERO": {
        "PREVIEW_NEXT": "Preview of the display. Activate to show the next view.",
        "TRANSPORT": "View controls",
        "PREVIOUS": "Previous view",
        "NEXT": "Next view",
        "PAUSE": "Pause rotation",
        "RESUME": "Resume rotation",
        "PAUSE_PINNED": "A pinned view already stays on screen",
        "PIN": "Pin this view",
        "UNPIN": "Unpin: back to the rotation",
        "PROGRESS": "Time on this view",
        "KEYS": "Keyboard: ← → change view · Space pauses",
        "STATE_ROTATING": "Rotating · next in {seconds} s",
        "STATE_PAUSED": "Rotation paused",
        "STATE_PINNED": "Pinned to this view",
        "STATE_HELD": "Held by a running Pomodoro",
        "STATE_SINGLE": "Only one view in the rotation"
      },
      "PILL": {
        "CONNECTED": "Connected",
        "CONNECTED_MODEL": "Connected · {model}"
      },
      "CC": {
        "NOT_CONNECTED": "No display connected: you are customising the demo preview.",
        "BACK_TO_SETUP": "Back to setup"
      },
      "SETUP": {
        "STEP3_TEXT": "Views, look and night schedule: all in the control centre.",
        "CUSTOMIZE": "Customise"
      },
      "VIEWS": {
        "EYEBROW": "What it shows",
        "TITLE": "Views",
        "HINT": "Switch views on or off, reorder them and choose how long each stays on screen.",
        "THUMB": "Thumbnail of the {view} view",
        "EMPTY_TITLE": "Nothing to show yet",
        "EMPTY": {
          "WEEK": "Complete a focus session and this week appears here.",
          "ALARM": "No alarm or countdown is set.",
          "WORLD": "You have no world clocks yet.",
          "WEATHER": "Weather is off or has no data yet."
        },
        "EMPTY_LINK": {
          "WEEK": "Start a focus session",
          "ALARM": "Set an alarm",
          "WORLD": "Add a world clock",
          "WEATHER": "Turn on weather"
        },
        "TOGGLE": "Show {view} in the rotation",
        "DURATION": "Time on screen",
        "DURATION_FOR": "Seconds on screen: {view}",
        "DRAG": "Drag to reorder",
        "MOVE_UP": "Move {view} up",
        "MOVE_DOWN": "Move {view} down",
        "MOVED": "{view} is now number {position} of {total}"
      },
      "APPEARANCE": {
        "EYEBROW": "Look",
        "TITLE": "Appearance",
        "FOLLOW": "Follow the app",
        "FOLLOW_ON": "The display uses the theme and font you picked in the clock.",
        "FOLLOW_OFF": "The display keeps its own theme and font, whatever the app does."
      },
      "SCHEDULE": {
        "EYEBROW": "Day and night",
        "TITLE": "Schedule",
        "NIGHT_STARTS": "Night starts",
        "NIGHT_ENDS": "Night ends",
        "SUMMARY": "Night from {from} to {to}, backlight {level}%.",
        "NO_NIGHT": "No night schedule: the backlight stays at the day level.",
        "BLACK_HINT": "At night the screen is completely black and the backlight off."
      },
      "HEALTH": {
        "EYEBROW": "Link",
        "TITLE": "Health",
        "STATE_OK": "All good",
        "STATE_WARN": "Needs attention",
        "WARNING": "The link had {count} new problem(s) (write timeouts or forced full redraws) since you opened this page. The display was redrawn in full each time.",
        "DISMISS": "Dismiss",
        "UPTIME": "Connected for",
        "FRAMES": "Frames",
        "LAST_FRAME": "Last frame",
        "PAUSE": "Pause per band",
        "TIMEOUTS": "Write timeouts",
        "REDRAWS": "Forced redraws",
        "RESYNCS": "Resyncs",
        "RESETS": "Display resets",
        "SPARK": "Frame time, last minutes",
        "SPARK_RANGE": "now {last} ms · peak {max} ms",
        "SPARK_LABEL": "Frame times over the last minutes: latest {last} ms, peak {max} ms",
        "SPARK_EMPTY": "No frames sent yet."
      }
    },
    "SEO": {
      "TITLE": "Desk Display | USB screen for AuraTime",
      "DESCRIPTION": "Turn a small USB screen into a live AuraTime dashboard: clock, Pomodoro focus, tasks, alarms, world clocks and weather. Runs in Chrome or Edge, no drivers needed."
    },
    "APP": {
      "TITLE": "Desk Display",
      "ON": "Connected",
      "OFF": "Not connected",
      "OPEN": "Open Desk Display",
      "HINT": "Show your clock and focus session on a USB screen."
    },
    "MSG": {
      "UNSUPPORTED": "This browser has no Web Serial support. Use Chrome or Edge on a computer.",
      "UNPLUGGED": "Display unplugged. Waiting for it to come back...",
      "BUSY": "Could not open the port. Is the display's original software (or another tab) using it? Close it and try again.",
      "STALLED": "The display is not accepting data. Try turning off flow control and reconnect.",
      "NOT_RESPONDING": "The display stopped responding.",
      "GENERIC": "Something went wrong while talking to the display.",
      "INSECURE": "Web Serial needs HTTPS or localhost.",
      "NO_HELLO": "The display did not answer the handshake. If the picture looks wrong, this may not be a supported model.",
      "OTHER_WINDOW": "Desk Display is active in another window."
    },
    "PAGE": {
      "BACK": "Back to the clock",
      "SUBTITLE": "Show your clock, focus session, tasks, alarms and weather on a small USB screen.",
      "LANGUAGE": "Language",
      "PREVIEW": {
        "LIVE": "Live preview",
        "DEMO": "Demo preview",
        "DEMO_NOTE": "Sample data. Connect a display to show your own.",
        "INFO": "View: {view} · backlight {level}%"
      },
      "STEP": "Step",
      "S1": {
        "TITLE": "Check your browser",
        "OK": "Great: this browser can talk to USB displays.",
        "TEXT": "Desk Display uses Web Serial, available in Google Chrome and Microsoft Edge on a computer."
      },
      "S2": {
        "TITLE": "Connect your display",
        "HINT": "Plug the display in with its USB cable and close the display's original software first: only one program can use it at a time.",
        "CONNECT": "Connect display",
        "CONNECTING": "Connecting...",
        "DISCONNECT": "Disconnect",
        "STATUS": "Status",
        "CONNECTED": "connected",
        "DISCONNECTED": "not connected",
        "ERROR": "error",
        "SENT": "{images} images · {kb} KB sent",
        "FIRST_TIME": "The browser asks you to pick the display once. After that it reconnects by itself.",
        "WINDOW_NOTE": "Keep this page in a window of its own and visible, or use the Windows startup launcher: browsers slow down hidden pages and the display would lag.",
        "HIDDEN_WARNING": "This page is hidden, so the browser is slowing it down and the display may lag. Bring the window to the front, or use the startup launcher.",
        "OS_NOTE": "Linux: your user must be in the dialout group. macOS: the display's CH34x USB-serial chip may need its driver."
      },
      "S3": {
        "TITLE": "Choose what to show",
        "VIEW_MODE": "Views",
        "VIEW_MODE_NOTE": "Automatic rotation changes view every 20 seconds; the focus view stays on while a Pomodoro is running.",
        "ROTATION": "In the automatic rotation",
        "ROTATION_NOTE": "Views with no data (no alarms, no active countdown, no world clocks, no focus this week) are skipped automatically.",
        "NO_DATA": "no data yet",
        "APPEARANCE": "Appearance",
        "THEME": "Theme",
        "FONT": "Font",
        "FOLLOW": "Follow the app",
        "FOLLOW_NOTE": "By default the display uses the same theme and font as the clock. Pick one to pin it.",
        "BACKLIGHT_DAY": "Backlight (day)",
        "NIGHT": "Night schedule",
        "FROM": "From",
        "TO": "To",
        "NIGHT_LEVEL": "Night backlight",
        "NIGHT_BLACK": "Black screen at night"
      },
      "ADV": {
        "TITLE": "Advanced",
        "FLOW": "Flow control (RTS/CTS)",
        "FULL": "Always send the full screen",
        "SLOW": "Slow send (3 ms per chunk)",
        "DEMO_TOGGLE": "Show sample data while no display is connected",
        "REDRAW": "Redraw everything",
        "HINT": "If glitches disappear with \"full screen\", the problem is in the partial updates; if they disappear with \"slow send\", the display needs more time between chunks.",
        "LAST_SEND": "Last image: {w}×{h} px · {bytes} B · {ms} ms · longest pause between chunks {gap} ms",
        "BAND_PAUSE": "Pause after each band",
        "COUNTERS": "Frames sent: {frames} · bands: {bands} · write timeouts: {timeouts} · forced full redraws: {redraws} · pause per band: {pause} ms"
      },
      "UNSUPPORTED": {
        "TITLE": "Desk Display needs Chrome or Edge on a computer",
        "TEXT": "This browser (Firefox, Safari or a phone browser) cannot talk to USB displays. Open AuraTime in Google Chrome or Microsoft Edge on a Windows, macOS or Linux computer to connect a display.",
        "PREVIEW": "This is what the display shows:"
      },
      "COMPAT": "Compatible with Turing Smart Screen 3.5\" class displays (USB 1A86:5722, rev. A).",
      "DISCLAIMER": "AuraTime is an independent project, not affiliated with any display manufacturer. Product names belong to their owners.",
      "OTHER_WINDOW": {
        "TITLE": "Desk Display active in another window",
        "TEXT": "Only one window can drive the display. Close the other one; this window takes over by itself when it is closed."
      },
      "INSECURE": {
        "TITLE": "Web Serial needs HTTPS or localhost",
        "TEXT": "This page is open over plain http from a network address, where browsers turn Web Serial off. Open it with https:// or from localhost (for example http://localhost:4200)."
      }
    },
    "APP_BANNER": {
      "TITLE": "New: AuraTime for Windows (beta)",
      "TEXT": "Drives this screen without a browser, starts with Windows and also shows your PC's sensors. Close this page while the app uses the screen.",
      "DOWNLOAD": "Download",
      "MORE": "Learn more"
    }
  },
  "LANDING": {
    "DESK": {
      "NAV": "Desk Display",
      "EYEBROW": "NEW · WINDOWS APP",
      "TITLE": "Your clock, on a screen of its own",
      "SUBTITLE": "AuraTime Desk Display turns a small USB screen next to your keyboard into a live dashboard: time, weather, world clocks, your focus session and, with the Windows app, your PC's own sensors.",
      "P1": "Follows your AuraTime theme and font",
      "P2": "Free Windows app that starts with your PC, or straight from Chrome and Edge",
      "P3": "Sends only what changes, so it stays smooth",
      "P4": "Night dimming and anti burn-in built in",
      "MOCK_CAPTION": "Live preview with sample data, drawn by the same engine that drives the screen.",
      "STEPS_TITLE": "Set it up in three steps",
      "S1_T": "Get the app",
      "S1_D": "Download AuraTime for Windows, or open Desk Display in Chrome or Edge.",
      "S2_T": "Connect the screen",
      "S2_D": "Plug in the USB display. The app finds it by itself; in the browser, press Connect and pick it once.",
      "S3_T": "Choose your views",
      "S3_D": "Pick what rotates, set the night schedule and let it run all day.",
      "COMPAT": "Compatible with Turing Smart Screen 3.5\" class displays (USB 1A86:5722, rev. A).",
      "DISCLAIMER": "AuraTime is an independent project, not affiliated with any display manufacturer. Product names belong to their owners.",
      "BROWSER_NOTE": "The browser version needs Google Chrome or Microsoft Edge on a computer.",
      "CTA": "Try it in the browser",
      "DOWNLOAD": "Download for Windows",
      "APP_LINK": "About the Windows app"
    }
  },
  "WEATHER": {
    "YOUR_LOCATION": "Your location",
    "DEFAULT_CITY": "Lisbon (default)",
    "REFRESH": "Click to refresh the weather",
    "CITY_TITLE": "Weather location",
    "CITY_CURRENT": "Showing",
    "CITY_PLACEHOLDER": "Search for a city",
    "CITY_SEARCH": "Search",
    "CITY_NO_RESULTS": "No city found",
    "CITY_ERROR": "The search is not available right now",
    "CITY_USE_LOCATION": "Use my location",
    "CITY_DEFAULT_HINT": "Your location is not available, so the weather shows Lisbon. Search for your city to change it."
  },
  "DESKTOP": {
    "NAV": "Windows app",
    "SEO": {
      "TITLE": "AuraTime for Windows (beta) | Desk screen app",
      "DESCRIPTION": "Free Windows app that drives a 3.5\" USB desk screen: clock, weather, world clocks and your PC's CPU, GPU, memory, disk and network. Starts with Windows, no browser needed."
    },
    "HERO": {
      "EYEBROW": "BETA · WINDOWS APP",
      "TITLE": "AuraTime for Windows",
      "SUBTITLE": "Your USB desk screen, always on. The app starts with Windows, waits quietly in the notification area and keeps the screen running: the time, the weather, other cities, and your PC's own numbers.",
      "DOWNLOAD": "Download for Windows",
      "TRY_WEB": "Try it in the browser",
      "META": "Version {version} beta · Windows 10 and 11, 64-bit · {size} MB · Free and open source",
      "IMAGE_ALT": "The AuraTime window: a live preview of the screen and its settings"
    },
    "FEATURES": {
      "TITLE": "Why the app",
      "F1_T": "Starts with Windows",
      "F1_D": "Turn it on once. From then on the screen comes to life when you sign in.",
      "F2_T": "No browser needed",
      "F2_D": "It talks to the screen directly. No tab to keep open, nothing slowed down when the window is hidden.",
      "F3_T": "Your PC at a glance",
      "F3_D": "CPU and GPU temperature and load, memory, disk, network speed and volume.",
      "F4_T": "Six system designs",
      "F4_D": "From three big numbers to a full dashboard, each with its own colours.",
      "F5_T": "Weather and world clocks",
      "F5_D": "The weather for your city, the quote of the day and the time in up to three cities.",
      "F6_T": "Light on your PC",
      "F6_D": "It waits in the notification area using little memory and processor. The sensors are only read while a system view is on."
    },
    "DESIGNS": {
      "TITLE": "What it shows",
      "SUBTITLE": "Every picture here was drawn by the app itself, with sample numbers.",
      "SYSTEM": "Six designs for your PC's sensors",
      "VIEWS": "And the views it shares with the browser version",
      "DASHBOARD": "Dashboard",
      "PANEL": "Full panel",
      "GAUGES": "Gauges",
      "BARS": "Bars",
      "GRAPHS": "Graphs",
      "MINIMAL": "Minimal",
      "CLOCK": "Clock",
      "WEATHER": "Weather and quote",
      "WORLD": "World clocks"
    },
    "COMPARE": {
      "TITLE": "App or browser?",
      "SUBTITLE": "Both drive the same screen. Use one at a time: only one program can talk to the display.",
      "APP": "Windows app",
      "WEB": "Browser",
      "R1": "Runs without a browser window",
      "R1_APP": "Yes",
      "R1_WEB": "No, the page must stay open",
      "R2": "Starts by itself",
      "R2_APP": "Yes, with Windows",
      "R2_WEB": "With a launcher script",
      "R3": "CPU, GPU, memory, disk, network",
      "R3_APP": "Yes",
      "R3_WEB": "No",
      "R4": "Focus session, tasks and alarms",
      "R4_APP": "Not yet",
      "R4_WEB": "Yes",
      "R5": "Install",
      "R5_APP": "{size} MB installer",
      "R5_WEB": "Nothing to install",
      "R6": "Works on",
      "R6_APP": "Windows 10 and 11",
      "R6_WEB": "Chrome or Edge on a computer"
    },
    "STEPS": {
      "TITLE": "Up and running in three steps",
      "S1_T": "Download and install",
      "S1_D": "Run the installer. It needs no administrator rights and adds AuraTime to the Start menu.",
      "S2_T": "Plug in the screen",
      "S2_D": "Close the screen's own software first, then connect it by USB. AuraTime finds it by itself.",
      "S3_T": "Pick what it shows",
      "S3_D": "Choose the views, the design and the colours. The preview shows exactly what the screen gets."
    },
    "FAQ": {
      "TITLE": "Questions",
      "Q1": "Why does the CPU show “–” instead of a temperature?",
      "A1": "Windows only lets programs read the CPU's own sensors with administrator rights and a small driver. Turn on “CPU temperature” in the app's System settings and install the free PawnIO driver:",
      "Q2": "How do I update?",
      "A2": "Download the new version and run it over the old one. Your settings are kept.",
      "Q3": "How do I uninstall it?",
      "A3": "Like any app: Settings → Apps → AuraTime → Uninstall. Your settings stay, in case you come back.",
      "Q4": "Does it send anything over the internet?",
      "A4": "Only to get the weather: the city you choose goes to Open-Meteo, with the position rounded to about 1 km. Nothing else leaves your PC.",
      "Q5": "Which screens work?",
      "A5": "3.5\" USB screens of the Turing Smart Screen class (USB 1A86:5722, rev. A), at 480×320.",
      "Q6": "Is it really free?",
      "A6": "Yes. AuraTime is open source under the MIT licence; the code of the app is on GitHub."
    },
    "SOURCE": "Source code on GitHub"
  }
};
