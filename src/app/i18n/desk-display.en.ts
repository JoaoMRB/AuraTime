/**
 * English texts of the Desk Display feature (the USB screen page, the screen's own labels, the landing
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
      "GENERIC": "Something went wrong while talking to the display."
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
        "FIRST_TIME": "The browser asks you to pick the display once. After that it reconnects by itself."
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
        "LAST_SEND": "Last image: {w}×{h} px · {bytes} B · {ms} ms · longest pause between chunks {gap} ms"
      },
      "UNSUPPORTED": {
        "TITLE": "Desk Display needs Chrome or Edge on a computer",
        "TEXT": "This browser (Firefox, Safari or a phone browser) cannot talk to USB displays. Open AuraTime in Google Chrome or Microsoft Edge on a Windows, macOS or Linux computer to connect a display.",
        "PREVIEW": "This is what the display shows:"
      },
      "COMPAT": "Compatible with Turing Smart Screen 3.5\" (USB) displays.",
      "DISCLAIMER": "AuraTime is an independent project, not affiliated with any display manufacturer. Product names belong to their owners."
    }
  },
  "LANDING": {
    "DESK": {
      "NAV": "Desk Display",
      "EYEBROW": "NEW · USB SCREEN",
      "TITLE": "Your clock, on a screen of its own",
      "SUBTITLE": "AuraTime Desk Display turns a small USB screen next to your keyboard into a live dashboard: time, focus session, tasks, alarms, world clocks and weather.",
      "P1": "Follows your AuraTime theme and font",
      "P2": "Runs in Chrome or Edge: no drivers, no extra software",
      "P3": "Sends only what changes, so it stays smooth",
      "P4": "Night dimming and anti burn-in built in",
      "MOCK_CAPTION": "Live preview with sample data, drawn by the same engine that drives the screen.",
      "STEPS_TITLE": "Set it up in three steps",
      "S1_T": "Open Desk Display",
      "S1_D": "Use Chrome or Edge on your computer and press the Desk Display button.",
      "S2_T": "Connect the screen",
      "S2_D": "Plug in the USB display, press Connect and pick it from the list. It reconnects by itself next time.",
      "S3_T": "Choose your views",
      "S3_D": "Pick what rotates, set the night schedule and let it run all day.",
      "COMPAT": "Compatible with Turing Smart Screen 3.5\" (USB) displays.",
      "DISCLAIMER": "AuraTime is an independent project, not affiliated with any display manufacturer. Product names belong to their owners.",
      "BROWSER_NOTE": "Needs Google Chrome or Microsoft Edge on a computer.",
      "CTA": "Open Desk Display"
    }
  }
};
