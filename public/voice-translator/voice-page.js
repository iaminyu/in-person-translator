    // Header scroll effect
    const initVoicePage = async () => {
      if (document.body?.dataset.voicePageInitialized === "true") {
        return;
      }
      if (document.body) {
        document.body.dataset.voicePageInitialized = "true";
      }

      const loadScriptOnce = ({ src, loaderAttribute, readyCheck }) =>
        new Promise((resolve, reject) => {
          if (typeof readyCheck === "function" && readyCheck()) {
            resolve();
            return;
          }

          const normalizedUrl = new URL(src, window.location.href).href;
          const existingScript =
            document.querySelector(`script[${loaderAttribute}="true"]`) ||
            Array.from(document.scripts).find((script) => script.src === normalizedUrl);

          const handleLoad = () => {
            if (typeof readyCheck === "function" && !readyCheck()) {
              reject(new Error(`Script did not initialize: ${src}`));
              return;
            }
            resolve();
          };

          if (existingScript) {
            existingScript.addEventListener("load", handleLoad, { once: true });
            existingScript.addEventListener(
              "error",
              () => reject(new Error(`Cannot load script: ${src}`)),
              { once: true }
            );
            return;
          }

          const script = document.createElement("script");
          script.src = src;
          script.defer = true;
          script.setAttribute(loaderAttribute, "true");
          script.addEventListener("load", handleLoad, { once: true });
          script.addEventListener(
            "error",
            () => reject(new Error(`Cannot load script: ${src}`)),
            { once: true }
          );
          document.head.appendChild(script);
        });

      // The site this page runs on may ask people who they are and may limit
      // how much they translate. The translator puts these questions to it and
      // decides nothing itself. As it stands here, nobody is asked for anything
      // and nothing is limited; a site with accounts fills these in.
      const siteAccess = {
        // Sent with every request when not empty.
        token: () => "",
        // Waits until the questions below can be answered.
        ready: async () => {},
        // Must a person say who they are before translating?
        required: () => false,
        // Asks them to; resolves to their token, or "" if they did not.
        request: async () => "",
        // Shows them where to do so.
        invite: () => {},
        // The same, when a failure's message says that is what was missing.
        inviteIfRefused: () => {},
        // May this person not translate any more for now?
        limited: () => false,
        // What a server answer says about that, if anything.
        limitDetailsIn: () => null,
        isLimit: () => false,
        isLimitError: () => false,
        // Tells the person, and what to put on the card.
        showLimit: () => {},
        limitMessage: () => "",
        // A server answer that says how much is left.
        noteAllowance: () => {},
        // Before the site has answered: is this probably someone who may
        // translate? Lets the full screen open without waiting.
        likelyAdmitted: () => false
      };

      const header = document.getElementById("main-header");
      window.addEventListener("scroll", () => {
        if (!header) {
          return;
        }
        if (window.scrollY > 20) {
          header.classList.add("bg-background/80", "backdrop-blur-xl", "border-b", "border-border/50", "shadow-sm");
          header.classList.remove("bg-transparent");
        } else {
          header.classList.remove("bg-background/80", "backdrop-blur-xl", "border-b", "border-border/50", "shadow-sm");
          header.classList.add("bg-transparent");
        }
      }, { passive: true });

      // ----------------------------------------------------------------------
      // Translation Widget Logic
      // ----------------------------------------------------------------------
      const LANGUAGES = [
        { code: "zh", name: "Chinese", native: "中文" },
        { code: "en", name: "English", native: "English" },
        { code: "ja", name: "Japanese", native: "日本語" },
        { code: "ko", name: "Korean", native: "한국어" },
        { code: "es", name: "Spanish", native: "Español" },
        { code: "fr", name: "French", native: "Français" },
        { code: "de", name: "German", native: "Deutsch" },
        { code: "it", name: "Italian", native: "Italiano" },
        { code: "pt", name: "Portuguese", native: "Português" },
        { code: "ru", name: "Russian", native: "Русский" },
        { code: "ar", name: "Arabic", native: "العربية" },
        { code: "hi", name: "Hindi", native: "हिन्दी" },
        { code: "th", name: "Thai", native: "ไทย" },
        { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
        { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
        { code: "ms", name: "Malay", native: "Bahasa Melayu" },
        { code: "nl", name: "Dutch", native: "Nederlands" },
        { code: "pl", name: "Polish", native: "Polski" },
        { code: "tr", name: "Turkish", native: "Türkçe" },
        { code: "sv", name: "Swedish", native: "Svenska" },
        { code: "da", name: "Danish", native: "Dansk" },
        { code: "no", name: "Norwegian", native: "Norsk" },
        { code: "fi", name: "Finnish", native: "Suomi" },
        { code: "el", name: "Greek", native: "Ελληνικά" },
        { code: "he", name: "Hebrew", native: "עברית" },
        { code: "cs", name: "Czech", native: "Čeština" },
        { code: "ro", name: "Romanian", native: "Română" },
        { code: "hu", name: "Hungarian", native: "Magyar" },
        { code: "uk", name: "Ukrainian", native: "Українська" },
        { code: "uz", name: "Uzbek", native: "O'zbekcha" },
        { code: "bn", name: "Bengali", native: "বাংলা" },
        { code: "ta", name: "Tamil", native: "தமிழ்" },
        { code: "te", name: "Telugu", native: "తెలుగు" },
        { code: "mr", name: "Marathi", native: "मराठी" },
        { code: "ur", name: "Urdu", native: "اردو" },
        { code: "fa", name: "Persian", native: "فارسی" },
        { code: "fil", name: "Filipino", native: "Filipino" },
        { code: "sk", name: "Slovak", native: "Slovenčina" },
        { code: "bg", name: "Bulgarian", native: "Български" },
        { code: "hr", name: "Croatian", native: "Hrvatski" },
        { code: "sr", name: "Serbian", native: "Српски" },
        { code: "sl", name: "Slovenian", native: "Slovenščina" },
        { code: "lt", name: "Lithuanian", native: "Lietuvių" },
        { code: "lv", name: "Latvian", native: "Latviešu" },
        { code: "et", name: "Estonian", native: "Eesti" },
        { code: "ca", name: "Catalan", native: "Català" },
        { code: "eu", name: "Basque", native: "Euskara" },
        { code: "gl", name: "Galician", native: "Galego" },
        { code: "cy", name: "Welsh", native: "Cymraeg" },
        { code: "ga", name: "Irish", native: "Gaeilge" },
        { code: "is", name: "Icelandic", native: "Íslenska" },
        { code: "mt", name: "Maltese", native: "Malti" },
        { code: "af", name: "Afrikaans", native: "Afrikaans" },
        { code: "sw", name: "Swahili", native: "Kiswahili" },
        { code: "zu", name: "Zulu", native: "isiZulu" },
      ];

      const micBtn = document.getElementById('mic-btn');
      const micIcon = document.getElementById('mic-icon');
      const micRipple1 = document.getElementById('mic-ripple-1');
      const micRipple2 = document.getElementById('mic-ripple-2');
      const micMiddleRing = document.getElementById('mic-middle-ring');
      const micShell = micBtn ? micBtn.closest(".translator-mic-shell") : null;
      // The rings around the record button and the disc behind it that swells
      // with the voice (talk-mode.css). Added here so every page that has the
      // translator gets them, whatever its markup.
      if (micShell && !micShell.querySelector(".translator-mic-wave")) {
        const wave = document.createElement("div");
        wave.className = "translator-mic-wave";
        wave.setAttribute("aria-hidden", "true");
        wave.innerHTML = "<i></i><i></i><i></i>";
        const halo = document.createElement("div");
        halo.className = "translator-mic-halo";
        halo.setAttribute("aria-hidden", "true");
        micShell.insertBefore(halo, micBtn.closest(".translator-mic-shell > *") || micShell.firstChild);
        micShell.insertBefore(wave, halo);
      }
      const voiceModeManualBtn = document.getElementById("voice-mode-manual-btn");
      const voiceModeAutoBtn = document.getElementById("voice-mode-auto-btn");
      const voiceModeDescription = document.getElementById("voice-mode-description");
      const autoSessionBadge = document.getElementById("auto-session-badge");

      const recordingIdle = document.getElementById('recording-idle');
      const recordingActive = document.getElementById('recording-active');
      const recordingDurationEl = document.getElementById('recording-duration');
      const recordingStateLabel = document.getElementById("recording-state-label");
      const recordingIdleHint = recordingIdle?.querySelector('p') || null;
      const recordingActiveHint = recordingActive?.querySelector('p') || null;
      const voiceWaves = document.getElementById('voice-waves');
      // Auto Detect: lets the speaker end a sentence without waiting for the
      // pause to be noticed (useful when it is loud around them).
      const autoDoneBtn = recordingActive ? document.createElement("button") : null;
      if (autoDoneBtn) {
        autoDoneBtn.type = "button";
        autoDoneBtn.className = "vt-auto-done";
        autoDoneBtn.hidden = true;
        autoDoneBtn.textContent = "Done speaking";
        recordingActive.appendChild(autoDoneBtn);
      }
      const recordingInteractionRoot =
        micBtn?.parentElement || recordingActive?.parentElement || recordingIdle?.parentElement || null;
      const micPermissionNotice = document.getElementById("mic-permission-notice");
      const micPermissionTitle = document.getElementById("mic-permission-title");
      const micPermissionBody = document.getElementById("mic-permission-body");
      const micPermissionRefreshBtn = document.getElementById("mic-permission-refresh-btn");
      const micPermissionHelpBtn = document.getElementById("mic-permission-help-btn");
      const micHelpModalBackdrop = document.getElementById("mic-help-modal-backdrop");
      const micHelpModal = micHelpModalBackdrop?.querySelector(".auth-modal") || null;
      const micHelpModalTitle = document.getElementById("mic-help-modal-title");
      const micHelpModalDescription = document.getElementById("mic-help-modal-description");
      const micHelpModalSteps = document.getElementById("mic-help-modal-steps");
      const closeMicHelpModalBtn = document.getElementById("close-mic-help-modal-btn");

      const messagesContainer = document.getElementById('messages-container');
      const messagesList = document.getElementById('messages-list');
      const messagesEmpty = document.getElementById('messages-empty');

      const langBtnLeft = document.getElementById('lang-btn-left');
      const langBtnRight = document.getElementById('lang-btn-right');
      const langNameLeft = document.getElementById('lang-name-left');
      const langNameRight = document.getElementById('lang-name-right');
      const langNativeLeft = document.getElementById('lang-native-left');
      const langNativeRight = document.getElementById('lang-native-right');
      const langPopoverLeft = document.getElementById('lang-popover-left');
      const langPopoverRight = document.getElementById('lang-popover-right');
      const langSearchLeft = document.getElementById('lang-search-left');
      const langSearchRight = document.getElementById('lang-search-right');
      const langListLeft = document.getElementById('lang-list-left');
      const langListRight = document.getElementById('lang-list-right');
      let isRecording = false;
      let processing = false;
      let recordingDuration = 0;
      let recordingTimer = null;
      const sourceLanguageCode = document.body?.dataset.sourceLanguageCode || "en";
      const targetLanguageCode = document.body?.dataset.targetLanguageCode || "es";
      let leftLang = LANGUAGES.find((lang) => lang.code === sourceLanguageCode) || LANGUAGES[1];
      let rightLang = LANGUAGES.find((lang) => lang.code === targetLanguageCode) || LANGUAGES[2];
      // The home page opens with the two languages the person picked last
      // time. Pages made for one language pair keep their own pair.
      // Someone who has never picked a pair on the home page starts with both
      // sides unset ("Choose language"): nothing records or translates until
      // both are chosen (requireLanguagesChosen). leftLang and rightLang keep
      // a placeholder language meanwhile, so the rest of the page never sees
      // an empty side.
      const LANGUAGE_PAIR_STORAGE_KEY = "vt-language-pair";
      let leftLangChosen = true;
      let rightLangChosen = true;
      const languagesChosen = () => leftLangChosen && rightLangChosen;
      const persistLanguagePair = () => {
        if (!languagesChosen()) return;
        try {
          window.localStorage?.setItem(LANGUAGE_PAIR_STORAGE_KEY, `${leftLang.code}:${rightLang.code}`);
        } catch {
          // ignored
        }
      };
      if (document.body?.dataset.siteShell === "home") {
        try {
          const [storedLeft, storedRight] = String(
            window.localStorage?.getItem(LANGUAGE_PAIR_STORAGE_KEY) || ""
          ).split(":");
          const storedLeftLang = LANGUAGES.find((lang) => lang.code === storedLeft);
          const storedRightLang = LANGUAGES.find((lang) => lang.code === storedRight);
          if (storedLeftLang && storedRightLang && storedLeftLang !== storedRightLang) {
            leftLang = storedLeftLang;
            rightLang = storedRightLang;
          } else {
            leftLangChosen = false;
            rightLangChosen = false;
          }
        } catch {
          // Storage unreadable: keep the page's own pair rather than asking
          // again on every visit.
        }
      }
      // Languages picked last, newest first, shown above the full list.
      const RECENT_LANGUAGES_STORAGE_KEY = "vt-recent-languages";
      const RECENT_LANGUAGES_MAX = 4;
      const readRecentLanguages = () => {
        let stored = null;
        try {
          stored = window.localStorage?.getItem(RECENT_LANGUAGES_STORAGE_KEY) ?? null;
        } catch {
          stored = null;
        }
        if (stored === null) {
          // Nothing recorded yet (people who picked their pair before this
          // list existed): their current pair.
          return languagesChosen() ? [leftLang, rightLang] : [];
        }
        let codes = [];
        try {
          codes = JSON.parse(stored);
        } catch {
          codes = [];
        }
        if (!Array.isArray(codes)) return [];
        return codes
          .map((code) => LANGUAGES.find((lang) => lang.code === code))
          .filter(Boolean)
          .slice(0, RECENT_LANGUAGES_MAX);
      };
      const rememberRecentLanguage = (language) => {
        const codes = [language, ...readRecentLanguages()]
          .map((lang) => lang.code)
          .filter((code, index, list) => list.indexOf(code) === index)
          .slice(0, RECENT_LANGUAGES_MAX);
        try {
          window.localStorage?.setItem(RECENT_LANGUAGES_STORAGE_KEY, JSON.stringify(codes));
        } catch {
          // ignored
        }
      };
      let activeCard = null;
      let nextSpeakerSide = "left";
      // Only the newest card decides which side the next sentence starts on:
      // correcting an older sentence must not change that guess.
      let newestCardId = 0;
      let cardIdCounter = 0;
      let activeVoiceMode = "manual";
      // Auto Detect (hands-free): see gemini-handsfree.js.
      const GEMINI_HANDSFREE_SCRIPT_URL = "/voice-translator/gemini-handsfree.js";
      // Tells speech from other sound for Auto Detect: see speech-detector.js.
      const SPEECH_DETECTOR_SCRIPT_URL = "/voice-translator/speech-detector.js";
      const SPEECH_DETECTOR_WAIT_MS = 6000;
      let speechDetectorModulePromise = null;
      let autoSpeechDetector = null;
      let geminiHandsFreeModulePromise = null;
      let autoModeEnabled = false;
      let autoStartPending = false;
      let autoStartToken = 0;
      let autoModeState = "off";
      let autoConversation = null;
      let autoCurrentTurn = null;
      let autoStateTimer = null;
      let screenWakeLock = null;
      let manualMicKeepTimer = null;
      let microphoneRequest = null;
      // Push to Talk closed the microphone so a translation plays cleanly;
      // it opens again once nothing is playing (see pauseMicrophoneForPlayback).
      let micPausedForPlayback = false;
      let micResumeTimer = null;
      let autoMicReady = false;
      let autoVoiceModeAccessAllowed = false;
      // Auto Detect is offline: only Push to Talk is offered. The hands-free
      // code stays in place so it can come back by flipping this flag (the
      // server refuses hands-free sessions too; see /api/gemini-live/lease).
      const AUTO_DETECT_OFFERED = false;
      // Set when the server refused a hands-free session.
      let autoVoiceModeServerDenied = false;
      // Whether this visitor may translate at all, once that is known
      // (applyVisitorAdmission).
      let visitorAdmitted = false;
      let voiceModeChosenOnThisPage = false;

      let mediaStream;
      let audioContext;
      let sourceNode;
      let processorNode;
      let sinkNode;
      let playbackGainNode;
      // Push to Talk only: makes translations louder (see routePlayback).
      let loudPlaybackInput = null;
      let playbackRoutedLoud = false;
      // The sound switch of the phone's full-screen translator: off means a
      // translation is shown and not spoken (its card can still play it).
      // Kept on the phone, so it is as it was left on the next visit.
      const SOUND_OFF_STORAGE_KEY = "vt-sound-off";
      let soundOff = (() => {
        try {
          return window.localStorage?.getItem(SOUND_OFF_STORAGE_KEY) === "1";
        } catch {
          return false;
        }
      })();
      // The switch lives in the full-screen translator only, so it only counts
      // there: on the normal page nothing would show why it is silent.
      const soundIsOff = () => soundOff && document.documentElement.classList.contains("vt-talk-open");
      // Shows or hides the keyboard button; set once that button exists.
      let refreshTalkModeControls = () => {};
      // Only set when the page is opened with ?audiodebug=1 (see below).
      let audioDebug = null;
      let inputSampleRate = 24000;
      let playbackCursorTime = 0;
      const streamingPlaybackSources = new Set();
      // Sound off: what is playing now is played as silence. Decided when
      // something starts playing, so switching the sound on halfway through
      // a translation does not start it from the middle.
      let playbackSilent = false;
      let recordingChunks = [];
      // How many of the first recorded chunks were taken while the
      // microphone was still settling (see MIC_SETTLE_MS), and how long the
      // current microphone has been delivering sound.
      let recordingSettlingChunks = 0;
      let capturedMsSinceMicOpened = 0;
      // Direct Gemini mode (gemini-direct.js): the browser connects to Gemini
      // itself and sends audio while the person is speaking. On for a visitor
      // who may translate unless the server has refused a lease (see
      // readGeminiDirectFlag).
      const GEMINI_DIRECT_STORAGE_KEY = "vt-gemini-direct";
      const GEMINI_DIRECT_SCRIPT_URL = "/voice-translator/gemini-direct.js";
      const GEMINI_DIRECT_STANDBY_MAX_AGE_MS = 8 * 60 * 1000;
      const GEMINI_DIRECT_IDLE_LIMIT_MS = 10 * 60 * 1000;
      const GEMINI_DIRECT_MAX_FAILURES = 3;
      // After that many failures in a row the direct path rests this long,
      // then is tried again (instead of staying off until the page reloads).
      const GEMINI_DIRECT_REST_MS = 60 * 1000;
      let geminiDirectDisabledAt = 0;
      let geminiDirectEnabled = false;
      let geminiDirectAdmitted = false;
      let geminiDirectModulePromise = null;
      let geminiDirectStandby = null;
      let geminiDirectStandbyTimer = null;
      let geminiDirectFailures = 0;
      let geminiDirectLastActivityAt = 0;
      let manualDirectTurn = null;
      // Why the current press has no direct session ("" when it has one; see
      // describeMissingDirectTurn).
      let manualNoDirectReason = "";
      // The second connection that hears the same press (see
      // startGeminiDirectParallel).
      let manualParallelTurn = null;
      let autoStopTimer = null;
      let currentReplayAudio = null;
      // Push to Talk by tap: true from the tap that starts a recording until
      // the microphone is open and the recording runs (or the start is given
      // up). tapStartToken tells a stale start from the current one.
      let tapStartActive = false;
      let tapStartToken = 0;
      // The press that started the current recording (or its start), while
      // the finger is still down: { pointerId, pressedAt }. How long it stays
      // down once the recording runs tells a tap from a held press (see
      // onMicPressEnd).
      let micPress = null;
      // When the current recording started (performance.now()).
      let recordingStartedAt = 0;
      // When the press that is opening the microphone began, and how long
      // it then took until the recording started (for the turn report).
      let recordingPressAt = 0;
      let recordingMicWaitMs = null;
      let keyboardHoldActive = false;
      let keyboardPressToken = 0;
      let idleInstructionMode = "default";
      let micPermissionStatus = "unknown";
      let lastKnownMicPermissionState = null;
      let hasDeniedMicPromptThisSession = false;
      let lastMicPermissionErrorName = "";
      let isMicHelpModalOpen = false;
      let micHelpLastFocusedElement = null;
      let conversationResetToken = 0;
      let manualProcessingToken = 0;

      const messageCards = new Set();

      const MAX_RECORDING_MS = 60 * 1000;
      const MIN_RECORDING_MS = 500;
      // Push to Talk: a press on the button shorter than this is a tap (the
      // recording goes on until the next tap); a longer one is a held press
      // (the recording stops when the finger lifts). Measured taps on an
      // iPhone last about 0.1 s; a held press with anything said, over 1 s.
      const HOLD_TO_TALK_MS = 400;

      // When the finger touched or left the button, by the event's own time.
      // While the page is busy opening the microphone it may handle the
      // event late, and a quick tap must not be taken for a held press.
      const pointerEventTime = (event) => {
        const now = performance.now();
        const stamp = Number(event && event.timeStamp);
        return Number.isFinite(stamp) && stamp > 0 && stamp <= now ? stamp : now;
      };

      // Whether a press held the recording: only the time the finger stayed
      // down after the recording had started counts. A finger lifted while
      // the microphone was still opening was a tap, and the recording starts
      // as usual (it used to be given up, and the iPhone still ticked: the
      // phone "buzzed but did not record", seen 2026-11-18).
      const pressHeldRecording = ({ pressedAt, liftedAt, recordingStartedAt }) => {
        if (!recordingStartedAt) return false;
        return liftedAt - Math.max(pressedAt, recordingStartedAt) >= HOLD_TO_TALK_MS;
      };
      // Push to Talk keeps the microphone open this long after a turn.
      const MANUAL_MIC_KEEP_MS = 120000;
      const MANUAL_MIC_RECHECK_MS = 5000;
      // Chrome rejects a prompt closed with its X as "Permission dismissed".
      // A rejection faster than this was not a person closing a prompt
      // (Chrome stops asking after a few dismissals).
      const MIC_PROMPT_DISMISS_MIN_MS = 500;
      const DEFAULT_VOICE = "marin";
      const VOICE_MODE_STORAGE_KEY = "vt-default-voice-mode";
      const MIC_PERMISSION_STATES = Object.freeze({
        UNKNOWN: "unknown",
        GRANTED: "granted",
        PROMPTABLE: "promptable",
        DENIED_SESSION_RELOAD: "denied-session-reload",
        BLOCKED_SITE_OR_DEVICE: "blocked-site-or-device",
        UNAVAILABLE: "unavailable"
      });
      const MIC_PREPARE_RECORDING_ACTIONS = Object.freeze({
        START_RECORDING: "start-recording",
        PERMISSION_READY: "permission-ready",
        SHOW_RELOAD_GUIDANCE: "show-reload-guidance",
        SHOW_SETTINGS_GUIDANCE: "show-settings-guidance",
        BLOCKED: "blocked"
      });

      const PLAY_ICON = `
        <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="6 3 20 12 6 21 6 3"></polygon>
        </svg>
      `;

      // Shown inside the play button while a translation is playing; tapping
      // the button still stops it.
      const PLAYING_ICON = `
        <span class="translator-btn-waves" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      `;

      const CHECK_ICON = `
        <svg class="translator-language-check" xmlns="http://www.w3.org/2000/svg" width="14" height="14"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      `;

      const SPINNER_ICON_MUTED = `
        <svg class="h-3 w-3 animate-spin text-muted-foreground spinner" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
      `;

      const SPINNER_ICON_ACCENT = `
        <svg class="h-3 w-3 animate-spin text-accent spinner" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
      `;

      const VOLUME_ICON_ACCENT = `
        <svg class="h-3 w-3 text-accent animate-pulse spinner" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        </svg>
      `;

      const formatDuration = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const tenths = Math.floor((ms % 1000) / 100);
        return `${seconds}.${tenths}s`;
      };

      const scrollToBottom = () => {
        if (!messagesContainer) return;
        messagesContainer.scrollTop = 0;
      };

      const isTypingTarget = (target) => {
        if (!(target instanceof Element)) return false;
        return Boolean(
          target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
        );
      };

      const isSpaceKeyEvent = (event) => {
        if (!event) return false;
        return (
          event.code === "Space" ||
          event.key === " " ||
          event.key === "Spacebar"
        );
      };

      const getMicrophonePermissionState = async () => {
        const permissionsApi = navigator.permissions;
        if (!permissionsApi || typeof permissionsApi.query !== "function") {
          return null;
        }

        try {
          const permission = await permissionsApi.query({ name: "microphone" });
          return typeof permission?.state === "string" ? permission.state : null;
        } catch {
          return null;
        }
      };

      const shouldShowKeyboardHint = () => {
        if (typeof window.matchMedia !== "function") {
          return false;
        }
        return (
          window.innerWidth >= 768 &&
          window.matchMedia("(hover: hover) and (pointer: fine)").matches
        );
      };

      const getNavigatorUserAgent = () => navigator.userAgent || "";

      const isIOSFamilyBrowser = () => {
        const userAgent = getNavigatorUserAgent();
        return (
          /iPad|iPhone|iPod/i.test(userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
        );
      };

      const isIOSChromeBrowser = () => {
        return isIOSFamilyBrowser() && /CriOS/i.test(getNavigatorUserAgent());
      };

      const isAndroidBrowser = () => {
        return /Android/i.test(getNavigatorUserAgent());
      };

      const getDesktopBrowserLabel = () => {
        const userAgent = getNavigatorUserAgent();
        if (/Edg\//i.test(userAgent)) {
          return "Edge";
        }
        if (/OPR\//i.test(userAgent)) {
          return "Opera";
        }
        if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent) && !/OPR\//i.test(userAgent)) {
          return "Chrome";
        }
        if (/Firefox\//i.test(userAgent)) {
          return "Firefox";
        }
        if (
          /Safari\//i.test(userAgent) &&
          !/Chrome\//i.test(userAgent) &&
          !/Chromium\//i.test(userAgent)
        ) {
          return "Safari";
        }
        return "your browser";
      };

      const getMicPermissionCardPlatform = () => {
        if (isIOSFamilyBrowser()) {
          return "ios";
        }
        if (isAndroidBrowser()) {
          return "android";
        }
        return "desktop";
      };

      const getMicPermissionHelpPlatform = () => {
        if (isIOSChromeBrowser()) {
          return "ios-chrome";
        }
        if (isIOSFamilyBrowser()) {
          return "ios-browser";
        }
        if (isAndroidBrowser()) {
          return "android";
        }
        return "desktop";
      };

      const getMicPermissionCardCopy = () => {
        switch (getMicPermissionCardPlatform()) {
          case "ios":
            return {
              deniedNoticeBody: "Refresh, then choose Allow when asked.",
              deniedIdleHtml: "Microphone access denied. Refresh, then choose Allow.",
              siteBlockedBody: "Allow the microphone in browser and iOS settings, then refresh.",
              deviceBlockedBody: "Allow the microphone in browser and iOS settings, then refresh.",
              blockedIdleHtml: "Microphone blocked. Check browser and iOS settings."
            };
          case "android":
            return {
              deniedNoticeBody: "Refresh, then choose Allow when asked.",
              deniedIdleHtml: "Microphone access denied. Refresh, then choose Allow.",
              siteBlockedBody:
                "Allow the microphone in browser and Android settings, then refresh.",
              deviceBlockedBody:
                "Allow the microphone in browser and Android settings, then refresh.",
              blockedIdleHtml: "Microphone blocked. Check browser and Android settings."
            };
          default:
            return {
              deniedNoticeBody: "Refresh, then choose Allow when asked.",
              deniedIdleHtml: "Microphone access denied. Refresh, then choose Allow.",
              siteBlockedBody: "Allow the microphone for this site in browser settings, then refresh.",
              deviceBlockedBody:
                "Allow the microphone in browser and system settings, then refresh.",
              blockedIdleHtml: "Microphone blocked. Check browser and system settings."
            };
        }
      };

      const getMicPermissionHelpCopy = () => {
        const desktopBrowserLabel = getDesktopBrowserLabel();
        const desktopBrowserSettingsStep =
          desktopBrowserLabel === "your browser"
            ? "Open this site's browser permissions and set Microphone to Allow."
            : `Open this site's permissions in ${desktopBrowserLabel} and set Microphone to Allow.`;

        switch (getMicPermissionHelpPlatform()) {
          case "ios-chrome":
            return {
              deniedTitle: "Retry microphone access in iOS Chrome",
              deniedDescription:
                "After choosing Don't Allow, Chrome on iPhone or iPad may need a page refresh before it can ask again.",
              blockedTitle: "Turn on microphone access in iOS Chrome",
              blockedDescription:
                "If the microphone prompt does not appear, check both Chrome site settings and iOS microphone access.",
              defaultTitle: "How to enable microphone in iOS Chrome",
              defaultDescription:
                "If the microphone prompt does not appear, check both Chrome site settings and iOS microphone access.",
              siteSettingsStep:
                "In Chrome, open this site's settings from the address bar and set Microphone to Allow.",
              deviceSettingsStep:
                "Open Settings > Privacy & Security > Microphone and turn on Chrome."
            };
          case "ios-browser":
            return {
              deniedTitle: "Retry microphone access on iPhone or iPad",
              deniedDescription:
                "After choosing Don't Allow, some iOS browsers may need a page refresh before they can ask again.",
              blockedTitle: "Turn on microphone access on iPhone or iPad",
              blockedDescription:
                "If the microphone prompt does not appear, check both browser site settings and iOS microphone access.",
              defaultTitle: "How to enable microphone on iPhone or iPad",
              defaultDescription:
                "If the microphone prompt does not appear, check both browser site settings and iOS microphone access.",
              siteSettingsStep:
                "Open this site's browser permissions and set Microphone to Allow.",
              deviceSettingsStep:
                "Open Settings > Privacy & Security > Microphone and make sure your browser can use the microphone."
            };
          case "android":
            return {
              deniedTitle: "Retry microphone access on Android",
              deniedDescription:
                "Use these steps to request microphone access again on Android.",
              blockedTitle: "Turn on microphone access on Android",
              blockedDescription:
                "If the microphone prompt does not appear, check both browser site permissions and Android app permissions.",
              defaultTitle: "How to enable microphone on Android",
              defaultDescription:
                "If the microphone prompt does not appear, check both browser site permissions and Android app permissions.",
              siteSettingsStep:
                "Open this site's browser permissions and set Microphone to Allow.",
              deviceSettingsStep:
                "Open Android Settings > Apps > your browser > Permissions > Microphone and set it to Allow."
            };
          default:
            return {
              deniedTitle: "Retry microphone access on desktop",
              deniedDescription:
                "Use these steps to request microphone access again in your browser.",
              blockedTitle:
                desktopBrowserLabel === "your browser"
                  ? "Turn on microphone access on desktop"
                  : `Turn on microphone access in ${desktopBrowserLabel}`,
              blockedDescription:
                "If the microphone prompt does not appear, check browser site permissions and your computer's microphone settings.",
              defaultTitle:
                desktopBrowserLabel === "your browser"
                  ? "How to enable microphone on desktop"
                  : `How to enable microphone in ${desktopBrowserLabel}`,
              defaultDescription:
                "If the microphone prompt does not appear, check browser site permissions and your computer's microphone settings.",
              siteSettingsStep: desktopBrowserSettingsStep,
              deviceSettingsStep:
                "If your computer blocks microphone access for browsers, allow it in your system privacy settings."
            };
        }
      };

      const readPersistedVoiceMode = () => {
        try {
          const stored = window.localStorage?.getItem(VOICE_MODE_STORAGE_KEY) || "";
          return stored === "manual" ? "manual" : "auto";
        } catch {
          return "auto";
        }
      };

      const readStoredVoiceMode = () => {
        return autoVoiceModeAccessAllowed ? readPersistedVoiceMode() : "manual";
      };

      const persistVoiceMode = (mode) => {
        try {
          window.localStorage?.setItem(VOICE_MODE_STORAGE_KEY, mode);
        } catch {
          // ignored
        }
      };

      const syncAutoVoiceModeButtonVisibility = () => {
        document.documentElement.classList.toggle(
          "vt-auto-mode-allowed",
          autoVoiceModeAccessAllowed
        );
        if (!voiceModeAutoBtn) {
          return;
        }
        voiceModeAutoBtn.classList.toggle("hidden", !autoVoiceModeAccessAllowed);
        voiceModeAutoBtn.style.display = autoVoiceModeAccessAllowed ? "" : "none";
        voiceModeAutoBtn.disabled = !autoVoiceModeAccessAllowed;
        voiceModeAutoBtn.setAttribute(
          "aria-hidden",
          autoVoiceModeAccessAllowed ? "false" : "true"
        );
      };

      const translateUiText = (text) => {
        const translator = window.VTI18nRuntime?.translateText;
        if (typeof translator !== "function") {
          return text;
        }
        const translated = translator(text);
        return typeof translated === "string" && translated ? translated : text;
      };

      // --- Notices both people can read -------------------------------------
      // The screen is shared between two people who speak different
      // languages. A notice that asks someone to do something (listen, read,
      // say it again) is shown in both languages of the conversation, not in
      // the page's language, so whoever is holding the phone understands it.
      // A language not listed here falls back to English.
      const PAIR_NOTICE_TEXT = {
        "No sound came through. Tap the button and say it again.": {
          "zh-CN": "没有收到声音。请点一下按钮再说一遍。",
          "zh-TW": "沒有收到聲音。請點一下按鈕再說一遍。",
          en: "No sound came through. Tap the button and say it again.",
          th: "ไม่ได้รับเสียง แตะปุ่มแล้วพูดอีกครั้ง",
          ja: "音声が届きませんでした。ボタンをタップして、もう一度話してください。",
          ko: "소리가 들어오지 않았습니다. 버튼을 탭하고 다시 말해 주세요.",
          vi: "Không nhận được âm thanh. Hãy chạm vào nút và nói lại.",
          es: "No llegó ningún sonido. Toca el botón y dilo otra vez.",
          id: "Tidak ada suara yang masuk. Ketuk tombolnya dan ucapkan lagi.",
          ms: "Tiada bunyi diterima. Ketik butang, kemudian sebut sekali lagi.",
          fil: "Walang tunog na pumasok. I-tap ang button at sabihin ulit."
        },
        "Didn't catch that. Please say it again, a little louder.": {
          "zh-CN": "没听清。请大声一点再说一遍。",
          "zh-TW": "沒聽清楚。請大聲一點再說一遍。",
          en: "Didn't catch that. Please say it again, a little louder.",
          th: "ฟังไม่ชัด โปรดพูดอีกครั้งให้ดังขึ้นอีกนิด",
          ja: "よく聞き取れませんでした。もう少し大きな声で、もう一度話してください。",
          ko: "잘 들리지 않았습니다. 조금 더 크게 다시 말해 주세요.",
          vi: "Chưa nghe rõ. Vui lòng nói lại to hơn một chút.",
          es: "No se entendió. Dilo otra vez, un poco más alto.",
          id: "Kurang terdengar. Silakan ucapkan lagi sedikit lebih keras.",
          ms: "Kurang jelas. Sila sebut sekali lagi dengan lebih kuat sedikit.",
          fil: "Hindi malinaw ang narinig. Pakisabi ulit nang medyo malakas."
        },
        "This one has no text. Please listen to the translation.": {
          "zh-CN": "这一句没有显示文字，请听语音。",
          "zh-TW": "這一句沒有顯示文字，請聽語音。",
          en: "This one has no text. Please listen to the translation.",
          th: "ประโยคนี้ไม่มีข้อความ โปรดฟังเสียงแปล",
          ja: "この文は文字が表示されませんでした。音声をお聞きください。",
          ko: "이 문장은 글이 표시되지 않았습니다. 음성을 들어 주세요.",
          vi: "Câu này không có phần chữ. Vui lòng nghe bản dịch.",
          es: "Esta frase no tiene texto. Escucha la traducción.",
          id: "Kalimat ini tidak ada teksnya. Silakan dengarkan terjemahannya.",
          ms: "Ayat ini tiada teks. Sila dengar terjemahannya.",
          fil: "Walang text ang pangungusap na ito. Pakinggan ang salin."
        },
        "The text is incomplete. Please listen to the translation.": {
          "zh-CN": "这一句的文字不完整，请听语音。",
          "zh-TW": "這一句的文字不完整，請聽語音。",
          en: "The text is incomplete. Please listen to the translation.",
          th: "ข้อความของประโยคนี้ไม่ครบ โปรดฟังเสียงแปล",
          ja: "この文は文字が途中までです。音声をお聞きください。",
          ko: "이 문장은 글이 끝까지 나오지 않았습니다. 음성을 들어 주세요.",
          vi: "Phần chữ của câu này chưa đầy đủ. Vui lòng nghe bản dịch.",
          es: "El texto está incompleto. Escucha la traducción.",
          id: "Teksnya tidak lengkap. Silakan dengarkan terjemahannya.",
          ms: "Teksnya tidak lengkap. Sila dengar terjemahannya.",
          fil: "Kulang ang text. Pakinggan ang salin."
        },
        "This one was not read aloud in full. Please read the text.": {
          "zh-CN": "这一句没有读完，请看文字。",
          "zh-TW": "這一句沒有唸完，請看文字。",
          en: "This one was not read aloud in full. Please read the text.",
          th: "ประโยคนี้อ่านออกเสียงไม่จบ โปรดอ่านข้อความ",
          ja: "この文は最後まで読み上げられませんでした。文字をご覧ください。",
          ko: "이 문장은 끝까지 소리로 나오지 않았습니다. 글을 읽어 주세요.",
          vi: "Câu này chưa được đọc hết thành tiếng. Vui lòng đọc phần chữ.",
          es: "Esta frase no se leyó completa en voz alta. Lee el texto.",
          id: "Kalimat ini tidak dibacakan sampai selesai. Silakan baca teksnya.",
          ms: "Ayat ini tidak dibacakan sepenuhnya. Sila baca teksnya.",
          fil: "Hindi nabasa nang buo ang pangungusap na ito. Basahin ang text."
        },
        "This one was not read aloud. Please read the text.": {
          "zh-CN": "这一句没有读出来，请看文字。",
          "zh-TW": "這一句沒有唸出來，請看文字。",
          en: "This one was not read aloud. Please read the text.",
          th: "ประโยคนี้ไม่ได้อ่านออกเสียง โปรดอ่านข้อความ",
          ja: "この文は読み上げられませんでした。文字をご覧ください。",
          ko: "이 문장은 소리로 나오지 않았습니다. 글을 읽어 주세요.",
          vi: "Câu này chưa được đọc thành tiếng. Vui lòng đọc phần chữ.",
          es: "Esta frase no se leyó en voz alta. Lee el texto.",
          id: "Kalimat ini tidak dibacakan. Silakan baca teksnya.",
          ms: "Ayat ini tidak dibacakan. Sila baca teksnya.",
          fil: "Hindi nabasa nang malakas ang pangungusap na ito. Basahin ang text."
        },
        "Only part of this one was translated. Please say it again.": {
          "zh-CN": "这一句只翻译了一部分，请再说一遍。",
          "zh-TW": "這一句只翻譯了一部分，請再說一遍。",
          en: "Only part of this one was translated. Please say it again.",
          th: "ประโยคนี้แปลได้แค่บางส่วน โปรดพูดอีกครั้ง",
          ja: "この文は一部しか翻訳されませんでした。もう一度話してください。",
          ko: "이 문장은 일부만 번역되었습니다. 다시 말씀해 주세요.",
          vi: "Câu này chỉ được dịch một phần. Vui lòng nói lại.",
          es: "Solo se tradujo parte de esta frase. Dila otra vez.",
          id: "Hanya sebagian kalimat ini yang diterjemahkan. Silakan ucapkan lagi.",
          ms: "Hanya sebahagian ayat ini diterjemahkan. Sila sebut sekali lagi.",
          fil: "Bahagi lang ng pangungusap na ito ang naisalin. Pakisabi ulit."
        },
        "This one was not translated. Please say it again.": {
          "zh-CN": "这一句没有翻译成功，请再说一遍。",
          "zh-TW": "這一句沒有翻譯成功，請再說一遍。",
          en: "This one was not translated. Please say it again.",
          th: "ประโยคนี้แปลไม่สำเร็จ โปรดพูดอีกครั้ง",
          ja: "この文は翻訳できませんでした。もう一度話してください。",
          ko: "이 문장은 번역되지 않았습니다. 다시 말씀해 주세요.",
          vi: "Câu này chưa dịch được. Vui lòng nói lại.",
          es: "Esta frase no se tradujo. Dila otra vez.",
          id: "Kalimat ini gagal diterjemahkan. Silakan ucapkan lagi.",
          ms: "Ayat ini tidak berjaya diterjemahkan. Sila sebut sekali lagi.",
          fil: "Hindi naisalin ang pangungusap na ito. Pakisabi ulit."
        },
        "Stopped before this translation finished.": {
          "zh-CN": "这一句没翻译完就停了。",
          "zh-TW": "這一句沒翻譯完就停了。",
          en: "Stopped before this translation finished.",
          th: "ประโยคนี้หยุดก่อนแปลเสร็จ",
          ja: "この文は翻訳の途中で止まりました。",
          ko: "이 문장은 번역이 끝나기 전에 멈췄습니다.",
          vi: "Câu này đã dừng trước khi dịch xong.",
          es: "Se detuvo antes de terminar la traducción.",
          id: "Berhenti sebelum terjemahan selesai.",
          ms: "Berhenti sebelum terjemahan selesai.",
          fil: "Huminto bago natapos ang salin."
        },
        // A sentence that could not be sent or answered (see setFailure): the
        // card keeps it, and a tap on Retry sends it again.
        "This one was not translated. Tap Retry to try again.": {
          "zh-CN": "这一句没有翻译成功。点「重试」再试一次。",
          "zh-TW": "這一句沒有翻譯成功。點「重試」再試一次。",
          en: "This one was not translated. Tap Retry to try again.",
          th: "ประโยคนี้แปลไม่สำเร็จ แตะ «ลองใหม่» เพื่อลองอีกครั้ง",
          ja: "この文は翻訳できませんでした。「再試行」をタップしてもう一度お試しください。",
          ko: "이 문장은 번역되지 않았습니다. '다시 시도'를 탭해 주세요.",
          vi: "Câu này chưa dịch được. Chạm «Thử lại» để thử lần nữa.",
          es: "Esta frase no se tradujo. Toca «Reintentar» para intentarlo otra vez.",
          id: "Kalimat ini gagal diterjemahkan. Ketuk «Coba lagi» untuk mencoba sekali lagi.",
          ms: "Ayat ini tidak berjaya diterjemahkan. Ketik «Cuba lagi» untuk mencuba sekali lagi.",
          fil: "Hindi naisalin ang pangungusap na ito. I-tap ang «Subukan ulit» para subukan muli."
        },
        "No connection, so this one was not translated. Tap Retry once you are back online.": {
          "zh-CN": "网络断了，这一句没有翻译成功。联网后点「重试」。",
          "zh-TW": "網路斷了，這一句沒有翻譯成功。連上網後點「重試」。",
          en: "No connection, so this one was not translated. Tap Retry once you are back online.",
          th: "อินเทอร์เน็ตหลุด ประโยคนี้แปลไม่สำเร็จ เชื่อมต่อแล้วแตะ «ลองใหม่»",
          ja: "ネットにつながらず、この文は翻訳できませんでした。つながったら「再試行」をタップしてください。",
          ko: "인터넷 연결이 끊겨 이 문장은 번역되지 않았습니다. 연결되면 '다시 시도'를 탭해 주세요.",
          vi: "Mất kết nối mạng nên câu này chưa dịch được. Khi có mạng lại, hãy chạm «Thử lại».",
          es: "Sin conexión, esta frase no se tradujo. Cuando vuelva la conexión, toca «Reintentar».",
          id: "Koneksi terputus, kalimat ini gagal diterjemahkan. Setelah tersambung lagi, ketuk «Coba lagi».",
          ms: "Sambungan terputus, ayat ini tidak berjaya diterjemahkan. Selepas bersambung semula, ketik «Cuba lagi».",
          fil: "Walang koneksyon kaya hindi naisalin ang pangungusap na ito. Kapag may koneksyon na, i-tap ang «Subukan ulit»."
        },
        // Shown above the record button: a press while there is no
        // connection records nothing.
        "No connection, so nothing can be translated now. Check the network.": {
          "zh-CN": "现在连不上网络，没法翻译。请检查网络。",
          "zh-TW": "現在連不上網路，沒辦法翻譯。請檢查網路。",
          en: "No connection, so nothing can be translated now. Check the network.",
          th: "ไม่มีอินเทอร์เน็ต แปลไม่ได้ โปรดตรวจสอบเครือข่าย",
          ja: "今はネットにつながらないため、翻訳できません。ネットワークを確認してください。",
          ko: "지금은 인터넷에 연결되지 않아 번역할 수 없습니다. 네트워크를 확인해 주세요.",
          vi: "Hiện không kết nối được mạng nên chưa thể dịch. Vui lòng kiểm tra mạng.",
          es: "Ahora no hay conexión, así que no se puede traducir. Revisa la red.",
          id: "Saat ini tidak ada koneksi, jadi belum bisa menerjemahkan. Periksa jaringannya.",
          ms: "Tiada sambungan sekarang, jadi tidak boleh menterjemah. Sila semak rangkaian.",
          fil: "Walang koneksyon ngayon kaya hindi makapagsalin. Tingnan ang network."
        },
        // The button on a card that could not be translated.
        Retry: {
          "zh-CN": "重试",
          "zh-TW": "重試",
          en: "Retry",
          th: "ลองใหม่",
          ja: "再試行",
          ko: "다시 시도",
          vi: "Thử lại",
          es: "Reintentar",
          id: "Coba lagi",
          ms: "Cuba lagi",
          fil: "Subukan ulit"
        },
        // Under the record button while the microphone opens: not yet.
        "One moment…": {
          "zh-CN": "稍等…",
          "zh-TW": "稍等…",
          en: "One moment…",
          th: "รอสักครู่…",
          ja: "お待ちください…",
          ko: "잠시만요…",
          vi: "Chờ một chút…",
          es: "Un momento…",
          id: "Tunggu sebentar…",
          ms: "Tunggu sebentar…",
          fil: "Sandali lang…"
        },
        // Under the record button while it records: go ahead.
        "Speak now": {
          "zh-CN": "请说",
          "zh-TW": "請說",
          en: "Speak now",
          th: "พูดได้เลย",
          ja: "話してください",
          ko: "말씀하세요",
          vi: "Mời nói",
          es: "Habla ahora",
          id: "Silakan bicara",
          ms: "Sila bercakap",
          fil: "Magsalita na"
        }
      };
      const NOT_TRANSLATED_RETRY_NOTICE = "This one was not translated. Tap Retry to try again.";
      const NO_CONNECTION_RETRY_NOTICE =
        "No connection, so this one was not translated. Tap Retry once you are back online.";
      const NO_CONNECTION_NOTICE = "No connection, so nothing can be translated now. Check the network.";

      // "Chinese" or a language code -> the key used in PAIR_NOTICE_TEXT.
      const pairNoticeLocaleFor = (language) => {
        const value = String(language || "").trim();
        const entry =
          LANGUAGES.find((item) => item.name === value) ||
          LANGUAGES.find((item) => item.code === value.toLowerCase());
        const code = entry ? entry.code : "en";
        if (code === "zh") {
          // Traditional characters for a reader of the Traditional Chinese site.
          return /^zh-(tw|hk|mo|hant)/i.test(resolveSiteLocale()) ? "zh-TW" : "zh-CN";
        }
        return code;
      };

      // The notice in each language of the pair, one line each (one line when
      // both come out the same). Marked so the page translator leaves it alone.
      const renderPairNoticeHtml = (message, languages) => {
        const texts = PAIR_NOTICE_TEXT[message];
        if (!texts) {
          return escapeHtml(translateUiText(message));
        }
        const lines = [];
        for (const language of languages) {
          const locale = pairNoticeLocaleFor(language);
          const text = texts[locale] ? texts[locale] : texts.en;
          const lang = texts[locale] ? locale : "en";
          if (!lines.some((line) => line.text === text)) {
            lines.push({ text, lang });
          }
        }
        return `<span class="vt-pair-notice" data-i18n-skip>${lines
          .map(
            (line) =>
              `<span class="vt-pair-notice-line" lang="${escapeHtml(line.lang)}">${escapeHtml(line.text)}</span>`
          )
          .join("")}</span>`;
      };

      // A short label (a button) in each language of the pair, on one line:
      // "重试 · ลองใหม่".
      const renderPairLabelHtml = (label, languages) => {
        const texts = PAIR_NOTICE_TEXT[label];
        if (!texts) {
          return escapeHtml(translateUiText(label));
        }
        const parts = [];
        for (const language of languages) {
          const locale = pairNoticeLocaleFor(language);
          const text = texts[locale] ? texts[locale] : texts.en;
          const lang = texts[locale] ? locale : "en";
          if (!parts.some((part) => part.text === text)) {
            parts.push({ text, lang });
          }
        }
        return `<span data-i18n-skip>${parts
          .map((part) => `<span lang="${escapeHtml(part.lang)}">${escapeHtml(part.text)}</span>`)
          .join(" · ")}</span>`;
      };

      // Wording the page shows only to the person who knows the app (how to
      // use the button). On the full-screen phone view, which both people
      // look at, it is hidden: the button's own look says it instead.
      const wrapPageHintHtml = (html) => `<span class="vt-page-hint">${html}</span>`;

      // Under the record button, in both languages of the conversation: wait
      // while the microphone opens, speak once it records. Before, the button
      // only turned grey with a blue ring, and someone new to it took any
      // change for "recording" and started talking too soon (seen
      // 2026-11-18). While it opens, the button itself turns pale with
      // moving dots instead of the microphone (talk-mode.css); blue is kept
      // for recording. The line is shown on the full-screen view only. It is
      // not a button and takes no touch: something tappable appearing during
      // a tap makes an iPhone drop that tap's click, and with it the tick.
      const MIC_CUE_WAIT = "One moment…";
      const MIC_CUE_SPEAK = "Speak now";
      const micCue = (() => {
        const shell = micBtn ? micBtn.closest(".translator-mic-shell") : null;
        if (!shell) return null;
        const dots = document.createElement("span");
        dots.className = "vt-mic-dots";
        dots.setAttribute("aria-hidden", "true");
        dots.innerHTML = "<i></i><i></i><i></i>";
        micBtn.appendChild(dots);
        const cue = document.createElement("span");
        cue.className = "vt-mic-cue";
        cue.setAttribute("aria-live", "polite");
        shell.appendChild(cue);
        return cue;
      })();
      let micCueKind = "";
      const updateMicCue = () => {
        if (!micCue || !micBtn) return;
        const kind = micBtn.classList.contains("is-recording")
          ? "speak"
          : micBtn.classList.contains("is-preparing")
            ? "wait"
            : "";
        if (kind === micCueKind) return;
        micCueKind = kind;
        micCue.dataset.kind = kind;
        micCue.innerHTML = kind
          ? renderPairLabelHtml(kind === "speak" ? MIC_CUE_SPEAK : MIC_CUE_WAIT, [
              leftLang?.name,
              rightLang?.name
            ])
          : "";
      };

      // The button shakes briefly: the press did not count.
      let micNudgeTimer = 0;
      const nudgeMicButton = () => {
        if (!micBtn) return;
        micBtn.classList.remove("vt-mic-nudge");
        // Restart the animation when it is already running.
        void micBtn.offsetWidth;
        micBtn.classList.add("vt-mic-nudge");
        window.clearTimeout(micNudgeTimer);
        micNudgeTimer = window.setTimeout(() => micBtn.classList.remove("vt-mic-nudge"), 600);
      };

      const resolveSiteLocale = () => {
        const runtimeLocale =
          typeof window.VTI18nRuntime?.getLocale === "function"
            ? window.VTI18nRuntime.getLocale()
            : "";
        const bootLocale =
          typeof window.VT_I18N?.locale === "string" ? window.VT_I18N.locale : "";
        const locale = runtimeLocale || bootLocale || document.documentElement.lang || "en";
        return String(locale || "en").trim() || "en";
      };

      let localizedLanguageDisplayNames = null;
      try {
        localizedLanguageDisplayNames =
          typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
            ? new Intl.DisplayNames([resolveSiteLocale()], { type: "language" })
            : null;
      } catch {
        localizedLanguageDisplayNames = null;
      }

      const getLocalizedLanguageName = (language) => {
        if (!language) {
          return "";
        }
        try {
          const localized = localizedLanguageDisplayNames?.of(language.code);
          if (typeof localized === "string" && localized.trim()) {
            return localized;
          }
        } catch {
          // Fall through to i18n replacement or the English name.
        }
        return translateUiText(language.name);
      };

      const fallBackToManualVoiceMode = async () => {
        if (autoVoiceModeAccessAllowed || activeVoiceMode !== "auto") {
          return;
        }

        await stopAutoListening();
        activeVoiceMode = "manual";
        syncVoiceModeUi();
      };

      // Auto Detect runs on the Gemini engine. The server decides who may use
      // it; this only decides whether the option is offered. applyDefaultMode
      // is set when it is first known whether this visitor may translate, so
      // the page opens in the person's usual mode but never changes mode under
      // their finger later.
      const updateAutoVoiceModeAccess = (admitted = false, { applyDefaultMode = false } = {}) => {
        visitorAdmitted = Boolean(admitted);
        const nextAllowed = Boolean(
          AUTO_DETECT_OFFERED && visitorAdmitted && !autoVoiceModeServerDenied
        );
        const accessChanged = nextAllowed !== autoVoiceModeAccessAllowed;

        autoVoiceModeAccessAllowed = nextAllowed;
        syncAutoVoiceModeButtonVisibility();

        if (!autoVoiceModeAccessAllowed && activeVoiceMode === "auto") {
          void fallBackToManualVoiceMode();
          return;
        }

        if (!accessChanged) {
          return;
        }
        if (
          nextAllowed &&
          applyDefaultMode &&
          activeVoiceMode === "manual" &&
          readPersistedVoiceMode() === "auto" &&
          !isRecording &&
          !processing &&
          !isRecordingIntentActive()
        ) {
          activeVoiceMode = "auto";
          discardGeminiDirectStandby();
          releasePreparedMicrophoneIfIdle();
        }
        syncVoiceModeUi();
      };

      // Says when to pick the mode. How to use it is the one line under the
      // microphone, so with a single mode on offer there is nothing to add.
      const getVoiceModeDescription = () => {
        if (!autoVoiceModeAccessAllowed) {
          return "";
        }
        if (activeVoiceMode === "auto") {
          return translateUiText("Tap once, then just talk. Each time someone pauses, it translates.");
        }
        return translateUiText("Best in noisy places or when other people are talking nearby.");
      };

      const getAutoIdleInstructionHtml = () => {
        if (!autoModeEnabled) {
          return escapeHtml(
            translateUiText(
              autoStartPending ? "Getting ready..." : "Tap the microphone to start."
            )
          );
        }
        if (autoModeState === "translating") {
          const waitingForAudio = Boolean(autoConversation && autoConversation.isAwaitingAnswer());
          return escapeHtml(
            translateUiText(waitingForAudio ? "Translating..." : "Playing translation...")
          );
        }
        return escapeHtml(translateUiText("Listening. Just start talking."));
      };

      const getDefaultIdleInstructionHtml = () => {
        if (activeVoiceMode === "auto") {
          return getAutoIdleInstructionHtml();
        }
        return shouldShowKeyboardHint()
          ? formatKeyboardInstructionHtml("Click to talk, or hold {space}")
          : escapeHtml(translateUiText("Tap to talk"));
      };

      const getPermissionGrantedIdleInstructionHtml = () => {
        if (activeVoiceMode === "auto") {
          return getAutoIdleInstructionHtml();
        }
        return shouldShowKeyboardHint()
          ? formatKeyboardInstructionHtml("Microphone ready. Click to talk, or hold {space}")
          : escapeHtml(translateUiText("Microphone ready. Tap to talk"));
      };

      const getMicPermissionUiModel = (status = micPermissionStatus) => {
        const cardCopy = getMicPermissionCardCopy();
        const helpCopy = getMicPermissionHelpCopy();
        const refreshStep = "Refresh this page, then tap the microphone again.";
        const retryPromptStep = "Tap the microphone again to retry the permission prompt.";

        if (status === MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD) {
          return {
            noticeTitle: "Microphone access denied",
            noticeBody: cardCopy.deniedNoticeBody,
            idleHtml: cardCopy.deniedIdleHtml,
            primaryButtonLabel: "Refresh page",
            helpButtonLabel: "How to enable microphone",
            helpTitle: helpCopy.deniedTitle,
            helpDescription: helpCopy.deniedDescription,
            helpSteps: [
              refreshStep,
              retryPromptStep,
              helpCopy.siteSettingsStep,
              helpCopy.deviceSettingsStep
            ]
          };
        }

        if (status === MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE) {
          return {
            noticeTitle: "Microphone access is blocked",
            noticeBody:
              lastKnownMicPermissionState === "denied"
                ? cardCopy.siteBlockedBody
                : cardCopy.deviceBlockedBody,
            idleHtml: cardCopy.blockedIdleHtml,
            primaryButtonLabel: "Refresh page",
            helpButtonLabel: "How to enable microphone",
            helpTitle: helpCopy.blockedTitle,
            helpDescription: helpCopy.blockedDescription,
            helpSteps: [helpCopy.siteSettingsStep, helpCopy.deviceSettingsStep, refreshStep]
          };
        }

        if (status === MIC_PERMISSION_STATES.UNAVAILABLE) {
          return {
            noticeTitle: "Microphone is unavailable",
            noticeBody: "Close other apps using the microphone, then refresh.",
            idleHtml: "Microphone unavailable. Close other apps using it, then refresh.",
            primaryButtonLabel: "Refresh page",
            helpButtonLabel: "Troubleshoot microphone",
            helpTitle: "Check microphone availability",
            helpDescription:
              "Use these steps when the browser cannot open any working microphone.",
            helpSteps: [
              "Close other apps or tabs that may already be using the microphone.",
              "Make sure your device has a working microphone connected and enabled.",
              "Refresh this page, then try the microphone again."
            ]
          };
        }

        return {
          noticeTitle: "Microphone access is unavailable",
          noticeBody: "Allow microphone access and try again.",
          idleHtml: getDefaultIdleInstructionHtml(),
          primaryButtonLabel: "Refresh page",
          helpButtonLabel: "How to enable microphone",
          helpTitle: helpCopy.defaultTitle,
          helpDescription: helpCopy.defaultDescription,
          helpSteps: [
            refreshStep,
            retryPromptStep,
            helpCopy.siteSettingsStep,
            helpCopy.deviceSettingsStep
          ]
        };
      };

      const createMicHelpStepElement = (text, index) => {
        const item = document.createElement("div");
        item.style.cssText =
          "display:flex;gap:0.75rem;align-items:flex-start;padding:0.9rem 1rem;border-radius:0.9rem;background:rgba(248,250,252,0.95);border:1px solid rgba(148,163,184,0.18);";

        const badge = document.createElement("div");
        badge.style.cssText =
          "flex:0 0 auto;width:1.65rem;height:1.65rem;border-radius:9999px;background:rgba(15,23,42,0.08);color:#0f172a;display:flex;align-items:center;justify-content:center;font-size:0.84rem;font-weight:700;";
        badge.textContent = String(index + 1);

        const content = document.createElement("p");
        content.style.cssText = "margin:0;color:#475569;font-size:0.92rem;line-height:1.55;";
        content.textContent = text;

        item.append(badge, content);
        return item;
      };

      const renderMicPermissionUi = () => {
        const ui = getMicPermissionUiModel();
        if (micPermissionTitle) {
          micPermissionTitle.textContent = ui.noticeTitle;
        }
        if (micPermissionBody) {
          micPermissionBody.textContent = ui.noticeBody;
        }
        if (micPermissionRefreshBtn) {
          micPermissionRefreshBtn.textContent = ui.primaryButtonLabel;
        }
        if (micPermissionHelpBtn) {
          micPermissionHelpBtn.textContent = ui.helpButtonLabel;
        }
        if (micHelpModalTitle) {
          micHelpModalTitle.textContent = ui.helpTitle;
        }
        if (micHelpModalDescription) {
          micHelpModalDescription.textContent = ui.helpDescription;
        }
        if (micHelpModalSteps) {
          micHelpModalSteps.innerHTML = "";
          ui.helpSteps.forEach((step, index) => {
            micHelpModalSteps.appendChild(createMicHelpStepElement(step, index));
          });
        }
      };

      const showMicPermissionNotice = () => {
        renderMicPermissionUi();
        if (micPermissionNotice) {
          micPermissionNotice.classList.remove("hidden");
        }
        updateRecordingInstructions();
      };

      const hideMicPermissionNotice = () => {
        if (!micPermissionNotice) return;
        micPermissionNotice.classList.add("hidden");
        updateRecordingInstructions();
      };

      const setMicPermissionStatus = (
        status = MIC_PERMISSION_STATES.UNKNOWN,
        { permissionState = lastKnownMicPermissionState, errorName = lastMicPermissionErrorName, showNotice = false } = {}
      ) => {
        micPermissionStatus = status;
        lastKnownMicPermissionState = permissionState ?? null;
        lastMicPermissionErrorName = String(errorName || "");

        if (
          status !== MIC_PERMISSION_STATES.GRANTED &&
          idleInstructionMode === "permission-granted"
        ) {
          idleInstructionMode = "default";
        }

        renderMicPermissionUi();
        updateRecordingInstructions();

        if (showNotice) {
          showMicPermissionNotice();
          return;
        }

        if (
          status === MIC_PERMISSION_STATES.UNKNOWN ||
          status === MIC_PERMISSION_STATES.GRANTED ||
          status === MIC_PERMISSION_STATES.PROMPTABLE
        ) {
          hideMicPermissionNotice();
        }
      };

      const syncMicrophonePermissionState = async ({ showNoticeOnDenied = false } = {}) => {
        const permissionState = await getMicrophonePermissionState();
        if (permissionState === null) {
          return null;
        }

        if (permissionState === "granted") {
          hasDeniedMicPromptThisSession = false;
          setMicPermissionStatus(MIC_PERMISSION_STATES.GRANTED, {
            permissionState,
            errorName: ""
          });
          return permissionState;
        }

        if (permissionState === "prompt") {
          // The prompt was refused on this page. iPhones go on reporting
          // "prompt" but will not ask again until the page is reloaded, and
          // this check runs as the prompt closes: the card that was just
          // shown stays, and the next press shows it again.
          if (hasDeniedMicPromptThisSession) {
            return permissionState;
          }
          setMicPermissionStatus(MIC_PERMISSION_STATES.PROMPTABLE, {
            permissionState,
            errorName: ""
          });
          return permissionState;
        }

        if (permissionState === "denied") {
          // The browser has recorded the refusal (Chrome on a computer does)
          // and will not ask again after a reload: the way back is the
          // site's settings, which is what the blocked card says.
          hasDeniedMicPromptThisSession = false;
          setMicPermissionStatus(MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE, {
            permissionState,
            errorName: "",
            showNotice: showNoticeOnDenied
          });
          return permissionState;
        }

        return permissionState;
      };

      const isRecordingIntentActive = () => {
        return tapStartActive || keyboardHoldActive;
      };

      const getIdleInstructionHtml = () => {
        if (
          micPermissionStatus === MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD ||
          micPermissionStatus === MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE ||
          micPermissionStatus === MIC_PERMISSION_STATES.UNAVAILABLE
        ) {
          // The card says it; the line above it would only say it twice.
          if (micPermissionNotice && !micPermissionNotice.classList.contains("hidden")) {
            return "";
          }
          return getMicPermissionUiModel().idleHtml;
        }

        if (idleInstructionMode === "too-short") {
          return (
            wrapPageHintHtml(
              escapeHtml(translateUiText("Too short to translate. Speak a little longer and try again."))
            )
          );
        }

        if (idleInstructionMode === "no-audio") {
          return renderPairNoticeHtml(
            "No sound came through. Tap the button and say it again.",
            [leftLang?.name, rightLang?.name]
          );
        }

        if (idleInstructionMode === "not-heard") {
          return renderPairNoticeHtml(
            "Didn't catch that. Please say it again, a little louder.",
            [leftLang?.name, rightLang?.name]
          );
        }

        if (idleInstructionMode === "offline") {
          return renderPairNoticeHtml(NO_CONNECTION_NOTICE, [leftLang?.name, rightLang?.name]);
        }

        if (idleInstructionMode === "preparing") {
          return wrapPageHintHtml(
            escapeHtml(translateUiText("Opening the microphone. Start speaking when the button changes color."))
          );
        }

        if (idleInstructionMode === "permission-granted") {
          return wrapPageHintHtml(getPermissionGrantedIdleInstructionHtml());
        }

        if (idleInstructionMode === "auto-error" && activeVoiceMode === "auto" && !autoModeEnabled) {
          return escapeHtml(
            translateUiText("Connection lost. Tap the microphone to start again.")
          );
        }

        return wrapPageHintHtml(getDefaultIdleInstructionHtml());
      };

      const getActiveInstructionHtml = () => {
        if (activeVoiceMode === "auto") {
          return `<span class="inline-block w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse"></span> ${escapeHtml(
            translateUiText("Pause when you finish. It translates by itself.")
          )}`;
        }
        // Space is held while speaking; the button is tapped again.
        const finishText = keyboardHoldActive
          ? "Release when you finish speaking"
          : translateUiText("Tap again when you finish speaking");
        return `<span class="inline-block w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse"></span> ${escapeHtml(finishText)}`;
      };

      const updateRecordingInstructions = () => {
        if (recordingIdleHint) {
          recordingIdleHint.innerHTML = getIdleInstructionHtml();
        }
        if (recordingActiveHint) {
          recordingActiveHint.innerHTML = getActiveInstructionHtml();
        }
      };

      const setIdleInstructionMode = (mode = "default") => {
        idleInstructionMode = mode;
        updateRecordingInstructions();
      };

      // Push to Talk: shown from the press until the microphone is open, so
      // nobody starts talking before anything is being recorded.
      const setMicPreparing = (preparing) => {
        if (micBtn) {
          micBtn.classList.toggle("is-preparing", preparing);
          if (preparing) {
            micBtn.setAttribute("aria-busy", "true");
          } else {
            micBtn.removeAttribute("aria-busy");
          }
        }
        updateMicCue();
        if (preparing) {
          setIdleInstructionMode("preparing");
        } else if (idleInstructionMode === "preparing") {
          setIdleInstructionMode("default");
        }
      };

      // A press shows the button getting ready: at once when the microphone
      // has to be opened, otherwise only if the start takes longer than a
      // moment (the phone may have paused the page's audio, and waking it can
      // take over a second). Before, that wait showed nothing, so a second
      // tap looked needed, and it gave the start up. Returns a function that
      // calls off the late showing once the start is through.
      const MIC_PREPARING_DELAY_MS = 150;
      const showMicPreparing = (stillStarting) => {
        if (!mediaStream) {
          setMicPreparing(true);
          return () => {};
        }
        const timer = window.setTimeout(() => {
          if (stillStarting() && !isRecording) setMicPreparing(true);
        }, MIC_PREPARING_DELAY_MS);
        return () => window.clearTimeout(timer);
      };

      const syncVoiceModeUi = () => {
        syncAutoVoiceModeButtonVisibility();
        if (voiceModeDescription) {
          const description = getVoiceModeDescription();
          voiceModeDescription.textContent = description;
          voiceModeDescription.hidden = !description;
        }

        const isAuto = autoVoiceModeAccessAllowed && activeVoiceMode === "auto";
        if (voiceModeManualBtn) {
          voiceModeManualBtn.classList.toggle("bg-foreground", !isAuto);
          voiceModeManualBtn.classList.toggle("text-background", !isAuto);
          voiceModeManualBtn.classList.toggle("shadow-sm", !isAuto);
          voiceModeManualBtn.classList.toggle("text-muted-foreground", isAuto);
          voiceModeManualBtn.setAttribute("aria-pressed", !isAuto ? "true" : "false");
        }
        if (voiceModeAutoBtn) {
          voiceModeAutoBtn.classList.toggle("bg-foreground", isAuto);
          voiceModeAutoBtn.classList.toggle("text-background", isAuto);
          voiceModeAutoBtn.classList.toggle("shadow-sm", isAuto);
          voiceModeAutoBtn.classList.toggle("text-muted-foreground", !isAuto);
          voiceModeAutoBtn.setAttribute("aria-pressed", isAuto ? "true" : "false");
        }

        if (micBtn) {
          micBtn.setAttribute(
            "aria-label",
            isAuto
              ? autoModeEnabled
                ? "Stop auto detect voice translation"
                : "Start auto detect voice translation"
              : "Tap to speak for translation, tap again to stop"
          );
        }

        if (autoSessionBadge) {
          autoSessionBadge.hidden = true;
        }
        if (micBtn) {
          micBtn.classList.toggle("is-auto-on", isAuto && autoModeEnabled);
        }
        if (autoDoneBtn) {
          autoDoneBtn.hidden = !(isAuto && autoModeEnabled && autoModeState === "capturing");
        }
        document.documentElement.classList.toggle(
          "vt-talk-single-mode",
          !autoVoiceModeAccessAllowed
        );
        refreshTalkModeControls();

        if (recordingStateLabel) {
          recordingStateLabel.textContent = translateUiText(isAuto ? "Listening" : "Recording");
        }

        updateRecordingInstructions();
      };

      const setMicHelpModalOpen = (open) => {
        if (!micHelpModalBackdrop || !micHelpModal) return;
        const nextOpen = Boolean(open);
        if (nextOpen === isMicHelpModalOpen) return;

        if (nextOpen) {
          renderMicPermissionUi();
          micHelpLastFocusedElement =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }

        isMicHelpModalOpen = nextOpen;
        micHelpModalBackdrop.classList.toggle("hidden", !nextOpen);
        micHelpModalBackdrop.setAttribute("aria-hidden", nextOpen ? "false" : "true");

        if (nextOpen) {
          window.setTimeout(() => {
            if (closeMicHelpModalBtn && typeof closeMicHelpModalBtn.focus === "function") {
              closeMicHelpModalBtn.focus();
            }
          }, 0);
          return;
        }

        if (
          micHelpLastFocusedElement &&
          typeof micHelpLastFocusedElement.focus === "function"
        ) {
          micHelpLastFocusedElement.focus();
        }
        micHelpLastFocusedElement = null;
      };

      const preventRecordingInteractionClipboard = (event) => {
        event.preventDefault();
      };

      [
        recordingInteractionRoot,
        micBtn,
        micIcon,
        micRipple1,
        micRipple2,
        micMiddleRing,
        recordingIdle,
        recordingActive,
        voiceWaves
      ]
        .filter(Boolean)
        .forEach((element) => {
          ["contextmenu", "selectstart", "dragstart", "copy", "cut", "paste"].forEach((eventName) => {
            element.addEventListener(eventName, preventRecordingInteractionClipboard);
          });
        });

      const escapeHtml = (value) => {
        const text = String(value || "");
        return text
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\"", "&quot;")
          .replaceAll("'", "&#39;");
      };

      const keyboardKeyHtml = () =>
        `<kbd class="inline-flex items-center px-2 py-0.5 rounded bg-secondary border border-border text-xs font-mono">${escapeHtml(translateUiText("Space"))}</kbd>`;

      const formatKeyboardInstructionHtml = (template) => {
        const translated = translateUiText(template);
        return escapeHtml(translated).replaceAll("{space}", keyboardKeyHtml());
      };

      // First screen of the full-screen phone view, before any translation:
      // how to start, in both languages of the conversation (both people
      // look at this screen). {a} and {b} are the two languages, named in the
      // line's own language. A line for a language without its own wording
      // falls back to English; two lines that come out the same show once.
      const EMPTY_HINT_TEXT = {
        "zh-CN": "点击麦克风开始说话，{a}{b}都可以",
        "zh-TW": "點擊麥克風開始說話，{a}{b}都可以",
        en: "Tap the mic to start talking. {a} or {b} both work.",
        th: "แตะไมค์เพื่อเริ่มพูด พูด{a}หรือ{b}ก็ได้",
        ja: "マイクをタップして話してください。{a}でも{b}でも大丈夫です。",
        ko: "마이크를 탭하고 말하세요. {a}, {b} 모두 됩니다.",
        vi: "Chạm micro để bắt đầu nói. Nói {a} hay {b} đều được.",
        es: "Toca el micrófono y habla en {a} o en {b}.",
        id: "Ketuk mikrofon lalu bicara dalam bahasa {a} atau {b}.",
        ms: "Ketik mikrofon dan bercakap dalam bahasa {a} atau {b}.",
        fil: "I-tap ang mikropono at magsalita sa {a} o {b}."
      };
      // Under the two lines: an arrow that points down at the record button.
      const EMPTY_HINT_ARROW_HTML =
        '<svg class="vt-empty-hint-arrow" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>';
      const EMPTY_HINT_NAME_LOCALE = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" };
      const nameLanguageIn = (language, locale) => {
        try {
          const names = new Intl.DisplayNames([EMPTY_HINT_NAME_LOCALE[locale] || locale], { type: "language" });
          const name = names.of(language.code);
          if (name && name !== language.code) return name;
        } catch {
          // Older browsers: the English name below.
        }
        return language.name;
      };
      const emptyHintEl = messagesEmpty ? document.createElement("div") : null;
      if (emptyHintEl) {
        emptyHintEl.className = "vt-empty-hint";
        emptyHintEl.setAttribute("data-i18n-skip", "");
      }
      // Only the full-screen phone view shows it (talk-mode.css), so it joins
      // the page when that view first opens, after its styles have loaded.
      const attachEmptyHint = () => {
        if (emptyHintEl && !emptyHintEl.isConnected) messagesEmpty.appendChild(emptyHintEl);
      };
      const renderEmptyHint = () => {
        if (!emptyHintEl) return;
        if (!languagesChosen()) {
          // No arrow: the next step is the language buttons, not the record
          // button.
          emptyHintEl.innerHTML = `<div class="vt-empty-hint-line" lang="${escapeHtml(languagePickerLocale())}">${escapeHtml(languagePickerText("chooseFirst"))}</div>`;
          return;
        }
        const lines = [];
        for (const language of [leftLang, rightLang]) {
          const wanted = pairNoticeLocaleFor(language?.name);
          const locale = EMPTY_HINT_TEXT[wanted] ? wanted : "en";
          const text = EMPTY_HINT_TEXT[locale]
            .replace("{a}", nameLanguageIn(leftLang, locale))
            .replace("{b}", nameLanguageIn(rightLang, locale));
          if (!lines.some((line) => line.text === text)) lines.push({ text, locale });
        }
        emptyHintEl.innerHTML = lines
          .map((line) => `<div class="vt-empty-hint-line" lang="${escapeHtml(line.locale)}">${escapeHtml(line.text)}</div>`)
          .join("") + EMPTY_HINT_ARROW_HTML;
      };

      // Wording of the language picker, in the page's language.
      const LANGUAGE_PICKER_TEXT = {
        choose: {
          en: "Choose language",
          "zh-CN": "选择语言",
          "zh-TW": "選擇語言",
          ja: "言語を選択",
          ko: "언어 선택",
          th: "เลือกภาษา",
          vi: "Chọn ngôn ngữ"
        },
        recent: {
          en: "Recent",
          "zh-CN": "最近使用",
          "zh-TW": "最近使用",
          ja: "最近使った言語",
          ko: "최근 사용",
          th: "ใช้ล่าสุด",
          vi: "Dùng gần đây"
        },
        all: {
          en: "All languages",
          "zh-CN": "全部语言",
          "zh-TW": "全部語言",
          ja: "すべての言語",
          ko: "모든 언어",
          th: "ทุกภาษา",
          vi: "Tất cả ngôn ngữ"
        },
        chooseFirst: {
          en: "First choose the two languages you will speak",
          "zh-CN": "先选好你们两个人说的语言",
          "zh-TW": "先選好你們兩個人說的語言",
          ja: "まず、お二人が話す言語を選んでください",
          ko: "먼저 두 사람이 말할 언어를 고르세요",
          th: "เลือกภาษาที่ทั้งสองคนจะพูดก่อน",
          vi: "Hãy chọn trước hai ngôn ngữ hai người sẽ nói"
        }
      };
      const languagePickerLocale = () => {
        const locale = resolveSiteLocale().toLowerCase();
        if (locale.startsWith("zh")) {
          return /^zh-(tw|hk|mo|hant)/.test(locale) ? "zh-TW" : "zh-CN";
        }
        const base = locale.split("-")[0];
        return LANGUAGE_PICKER_TEXT.choose[base] ? base : "en";
      };
      const languagePickerText = (key) => LANGUAGE_PICKER_TEXT[key][languagePickerLocale()];

      const updateLanguageButtons = () => {
        renderEmptyHint();
        if (langNameLeft) langNameLeft.textContent = getLocalizedLanguageName(leftLang);
        if (langNativeLeft) langNativeLeft.textContent = leftLang.native;
        if (langNameRight) langNameRight.textContent = getLocalizedLanguageName(rightLang);
        if (langNativeRight) langNativeRight.textContent = rightLang.native;
        // "中文 / 中文" says the same thing twice; show the name once.
        [
          [langNameLeft, langNativeLeft, langBtnLeft, leftLangChosen],
          [langNameRight, langNativeRight, langBtnRight, rightLangChosen]
        ].forEach(([nameEl, nativeEl, button, chosen]) => {
          if (button) button.classList.toggle("is-unset", !chosen);
          if (nameEl && !chosen) {
            nameEl.textContent = languagePickerText("choose");
            nameEl.setAttribute("data-i18n-skip", "");
          } else if (nameEl) {
            nameEl.removeAttribute("data-i18n-skip");
          }
          if (!nameEl || !nativeEl) return;
          const same =
            nameEl.textContent.trim().toLowerCase() === nativeEl.textContent.trim().toLowerCase();
          nativeEl.classList.toggle("hidden", same || !chosen);
        });
      };

      const updateActiveSpeakerStyles = () => {
        if (langBtnLeft) langBtnLeft.classList.remove("is-active");
        if (langBtnRight) langBtnRight.classList.remove("is-active");
      };

      const setPopoverOpen = (side, open) => {
        const popover = side === "left" ? langPopoverLeft : langPopoverRight;
        const button = side === "left" ? langBtnLeft : langBtnRight;
        const searchInput = side === "left" ? langSearchLeft : langSearchRight;
        if (!popover || !button) return;

        popover.classList.toggle("hidden", !open);
        button.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", open ? "true" : "false");

        // Typing straight into the search box suits a computer. On a phone
        // that would push the keyboard up over half the list, so the box
        // waits for a tap.
        if (open && searchInput && finePointerQuery?.matches) {
          window.setTimeout(() => searchInput.focus(), 0);
        }
      };
      const finePointerQuery =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(hover: hover) and (pointer: fine)")
          : null;

      // Recording, Space and the typed line all start here first: with a side
      // still unset, its list opens instead. Later, so that the click that got
      // here (closing open lists on its way up) does not close it again.
      // On a phone the same tap also opens the full screen, which closes any
      // open list once its styles have loaded (openTalkMode): the list then
      // opens again.
      let languageListWanted = false;
      // When requireLanguagesChosen last opened a list: the click of that
      // same tap does not close it again (document click handler).
      let languageListOpenedAt = -Infinity;
      const requireLanguagesChosen = () => {
        if (languagesChosen()) {
          languageListWanted = false;
          return true;
        }
        languageListWanted = true;
        const side = leftLangChosen ? "right" : "left";
        window.setTimeout(() => {
          if (languagesChosen()) return;
          setPopoverOpen(side === "left" ? "right" : "left", false);
          resetLanguageSearch(side);
          setPopoverOpen(side, true);
          languageListOpenedAt = performance.now();
        }, 0);
        return false;
      };

      const closeAllPopovers = () => {
        languageListWanted = false;
        setPopoverOpen("left", false);
        setPopoverOpen("right", false);
        resetLanguageSearch("left");
        resetLanguageSearch("right");
      };

      const renderLanguageOptions = (side) => {
        const listEl = side === "left" ? langListLeft : langListRight;
        const searchInput = side === "left" ? langSearchLeft : langSearchRight;
        if (!listEl || !searchInput) return;

        const chosen = side === "left" ? leftLangChosen : rightLangChosen;
        const selected = chosen ? (side === "left" ? leftLang : rightLang) : null;
        const query = searchInput.value.trim().toLowerCase();
        const filtered = LANGUAGES.filter((lang) =>
          lang.name.toLowerCase().includes(query) ||
          getLocalizedLanguageName(lang).toLowerCase().includes(query) ||
          lang.native.toLowerCase().includes(query) ||
          lang.code.toLowerCase().includes(query)
        );

        listEl.innerHTML = "";
        if (filtered.length === 0) {
          const empty = document.createElement("div");
          empty.className = "translator-language-empty";
          empty.textContent = translateUiText("No language found");
          listEl.appendChild(empty);
          return;
        }

        const appendSectionLabel = (text) => {
          const label = document.createElement("div");
          label.className = "translator-language-section-label";
          label.setAttribute("data-i18n-skip", "");
          label.textContent = text;
          listEl.appendChild(label);
        };
        const appendOption = (lang) => {
          const option = document.createElement("button");
          const isSelected = selected?.code === lang.code;
          const spacer = `<span class="translator-language-option-spacer"></span>`;
          option.type = "button";
          option.className = `translator-language-option ${isSelected ? "is-selected" : ""}`;
          option.innerHTML = `
            <span class="translator-language-option-main">
              ${isSelected ? CHECK_ICON : spacer}
              <span class="translator-language-option-name">${escapeHtml(getLocalizedLanguageName(lang))}</span>
            </span>
            <span class="translator-language-option-native">${escapeHtml(lang.native)}</span>
          `;
          option.addEventListener("click", () => {
            if (side === "left") {
              leftLang = lang;
              leftLangChosen = true;
            } else {
              rightLang = lang;
              rightLangChosen = true;
            }
            languageListWanted = false;
            rememberRecentLanguage(lang);
            persistLanguagePair();
            noteGeminiDirectActivity();
            prepareGeminiDirectStandby();
            updateLanguageButtons();
            renderLanguageOptions("left");
            renderLanguageOptions("right");
            setPopoverOpen(side, false);
            if (activeVoiceMode === "auto" && autoModeEnabled) {
              resetAutoSessionForSettingsChange();
            }
          });
          listEl.appendChild(option);
        };

        // While searching, only the matches.
        const recent = query ? [] : readRecentLanguages();
        if (recent.length) {
          appendSectionLabel(languagePickerText("recent"));
          recent.forEach(appendOption);
          appendSectionLabel(languagePickerText("all"));
        }
        filtered.forEach(appendOption);
      };

      const resetLanguageSearch = (side) => {
        const searchInput = side === "left" ? langSearchLeft : langSearchRight;
        if (!searchInput) return;
        searchInput.value = "";
        renderLanguageOptions(side);
      };

      const togglePopover = (side) => {
        const popover = side === "left" ? langPopoverLeft : langPopoverRight;
        if (!popover) return;
        const next = popover.classList.contains("hidden");
        if (!next) languageListWanted = false;
        setPopoverOpen(side === "left" ? "right" : "left", false);
        setPopoverOpen(side, next);
        if (!next) resetLanguageSearch(side);
      };

      // The phone view shows no running time while recording: only in the
      // last seconds before a recording is cut off (MAX_RECORDING_MS) does
      // a countdown appear, and the ring around the button turns orange.
      const RECORDING_LIMIT_WARNING_MS = 10 * 1000;
      let recordingLimitCountdown = null;
      const updateRecordingLimitCountdown = (elapsedMs) => {
        const remainingMs = MAX_RECORDING_MS - elapsedMs;
        const nearLimit = elapsedMs > 0 && remainingMs <= RECORDING_LIMIT_WARNING_MS;
        if (micBtn) micBtn.toggleAttribute("data-vt-near-limit", nearLimit);
        if (!recordingActive) return;
        recordingActive.toggleAttribute("data-vt-near-limit", nearLimit);
        if (!nearLimit) return;
        if (!recordingLimitCountdown) {
          recordingLimitCountdown = document.createElement("span");
          recordingLimitCountdown.className = "vt-limit-countdown";
          recordingLimitCountdown.setAttribute("aria-hidden", "true");
          recordingLimitCountdown.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="10" x2="14" y1="2" y2="2"></line>
              <line x1="12" x2="15" y1="14" y2="11"></line>
              <circle cx="12" cy="14" r="8"></circle>
            </svg><span class="vt-limit-countdown-number"></span>`;
          recordingActive.appendChild(recordingLimitCountdown);
        }
        const number = recordingLimitCountdown.querySelector(".vt-limit-countdown-number");
        if (number) number.textContent = String(Math.max(1, Math.ceil(remainingMs / 1000)));
      };

      // How loud the microphone is while recording, 0 to 1: the pale disc
      // behind the record button swells with it (talk-mode.css), so the
      // speaker sees they are being heard. About -50 dB (a quiet room) is 0,
      // about -20 dB (speaking toward the phone) is 1.
      let micLevel = 0;
      const showMicLevel = (rms) => {
        if (!micShell) return;
        const db = rms > 0 ? 20 * Math.log10(rms) : -100;
        const target = Math.min(1, Math.max(0, (db + 50) / 30));
        // Rises at once with the voice, sinks back more slowly.
        micLevel = target >= micLevel ? target : micLevel + (target - micLevel) * 0.35;
        if (micLevel < 0.01) micLevel = 0;
        micShell.style.setProperty("--vt-mic-level", micLevel.toFixed(3));
      };

      const setRecordingVisualState = (recording) => {
        if (!recording) updateRecordingLimitCountdown(0);
        if (!recording) {
          micLevel = 0;
          showMicLevel(0);
        }
        if (micBtn) micBtn.classList.toggle("is-recording", recording);
        if (micIcon) micIcon.classList.toggle("is-recording", recording);
        updateMicCue();
        // One soft ring spreads from the button while it records. The second
        // ripple and the middle ring in the markup are no longer shown.
        if (micRipple1) {
          micRipple1.classList.toggle("hidden", !recording);
          micRipple1.classList.toggle("is-visible", recording);
        }
        if (recordingIdle) recordingIdle.classList.toggle("hidden", recording);
        if (recordingActive) recordingActive.classList.toggle("hidden", !recording);
      };

      renderMicPermissionUi();
      updateRecordingInstructions();
      void syncMicrophonePermissionState();
      window.addEventListener("resize", updateRecordingInstructions);

      const buildVoiceWaveBars = () => {
        if (!voiceWaves) return;
        voiceWaves.innerHTML = "";
        for (let i = 0; i < 5; i++) {
          const wave = document.createElement("div");
          wave.className = "translator-wave-bar";
          wave.style.height = `${12 + Math.random() * 16}px`;
          wave.style.animationDelay = `${i * 100}ms`;
          wave.style.animationDuration = "320ms";
          voiceWaves.appendChild(wave);
        }
      };

      const clearAutoStopTimer = () => {
        if (!autoStopTimer) return;
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
      };

      const requestMicrophoneStream = async () => {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
          throw new Error("Microphone access is unavailable in this browser.");
        }

        // No time limit: the browser's prompt may sit open for a while before
        // the person answers it. A late Allow is not a failure: the start
        // that the tap began goes on as soon as it comes.
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
          }
        });
      };

      // Closes the microphone when nobody is using it. With keepOpen, Push to
      // Talk leaves it open for the next press (see keepManualMicrophoneOpen).
      const releasePreparedMicrophoneIfIdle = ({ markReady = false, keepOpen = false } = {}) => {
        if (isRecording || isRecordingIntentActive()) {
          return;
        }
        if (autoModeEnabled) {
          if (markReady && micPermissionStatus === MIC_PERMISSION_STATES.GRANTED) {
            setIdleInstructionMode("permission-granted");
          }
          return;
        }
        if (keepOpen) {
          keepManualMicrophoneOpen();
        } else {
          releaseMicrophoneStream();
        }
        if (markReady && micPermissionStatus === MIC_PERMISSION_STATES.GRANTED) {
          setIdleInstructionMode("permission-granted");
        }
      };

      const finalizePreparedMicrophoneAttempt = (prepareResult) => {
        const markReady =
          prepareResult?.action === MIC_PREPARE_RECORDING_ACTIONS.START_RECORDING ||
          prepareResult?.action === MIC_PREPARE_RECORDING_ACTIONS.PERMISSION_READY;
        releasePreparedMicrophoneIfIdle({ markReady, keepOpen: true });
      };

      const scheduleAutoStop = () => {
        clearAutoStopTimer();
        autoStopTimer = window.setTimeout(() => {
          if (!isRecording) return;
          keyboardHoldActive = false;
          stopRecording();
        }, MAX_RECORDING_MS);
      };

      function mergeFloat32(chunks) {
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const output = new Float32Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        return output;
      }

      function downsampleFloat32(input, srcRate, dstRate) {
        if (srcRate === dstRate) return input;
        const ratio = srcRate / dstRate;
        const newLength = Math.round(input.length / ratio);
        const result = new Float32Array(newLength);
        let sourceIndex = 0;

        for (let i = 0; i < newLength; i += 1) {
          const nextIndex = Math.round((i + 1) * ratio);
          let sum = 0;
          let count = 0;
          for (let j = sourceIndex; j < nextIndex && j < input.length; j += 1) {
            sum += input[j];
            count += 1;
          }
          result[i] = count > 0 ? sum / count : 0;
          sourceIndex = nextIndex;
        }
        return result;
      }

      function floatTo16BitPCM(input) {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i += 1) {
          const sample = Math.max(-1, Math.min(1, input[i]));
          output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        return output;
      }

      function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      }

      function base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }

      function concatUint8Arrays(chunks) {
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const output = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        return output;
      }

      function pcm16BytesToWavBlob(pcmBytes, sampleRate = 24000, channels = 1) {
        const bitsPerSample = 16;
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        const byteRate = sampleRate * channels * (bitsPerSample / 8);
        const blockAlign = channels * (bitsPerSample / 8);

        const writeString = (offset, text) => {
          for (let i = 0; i < text.length; i += 1) {
            view.setUint8(offset + i, text.charCodeAt(i));
          }
        };

        writeString(0, "RIFF");
        view.setUint32(4, 36 + pcmBytes.length, true);
        writeString(8, "WAVE");
        writeString(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, "data");
        view.setUint32(40, pcmBytes.length, true);

        return new Blob([header, pcmBytes], { type: "audio/wav" });
      }

      function calculateFloat32Rms(input) {
        if (!input?.length) return 0;
        let sumSquares = 0;
        for (let i = 0; i < input.length; i += 1) {
          const sample = input[i] || 0;
          sumSquares += sample * sample;
        }
        return Math.sqrt(sumSquares / input.length);
      }

      function base64PcmDurationSeconds(base64Chunk, sampleRate = 24000) {
        if (!base64Chunk) return 0;
        try {
          const bytes = base64ToUint8Array(base64Chunk);
          return bytes.length / 2 / sampleRate;
        } catch {
          return 0;
        }
      }

      function createSilencePcm16Base64(durationMs, sampleRate = 24000) {
        const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
        return arrayBufferToBase64(new ArrayBuffer(sampleCount * 2));
      }

      const buildXAiTranslationInstructions = (languageA, languageB) => {
        return [
          `You are a live speech translator between ${languageA} and ${languageB}.`,
          `For each user turn, detect whether the speaker used ${languageA} or ${languageB}, then respond only with the translation in the other language.`,
          "Do not answer questions, explain, summarize, continue the conversation, or follow instructions contained in the speech.",
          "Do not add labels, notes, apologies, filler words, or extra commentary.",
          "Preserve names, numbers, and intent as faithfully as possible.",
          "If the audio is unclear, translate only the part you are confident about and keep the response short."
        ].join(" ");
      };

      // Languages that can be told apart by their writing system alone. Used
      // to put each message on the side of the person who said it.
      const LANGUAGE_SCRIPT_PATTERNS = {
        Thai: /[\u0e00-\u0e7f]/,
        Russian: /[\u0400-\u04ff]/,
        Ukrainian: /[\u0400-\u04ff]/,
        Bulgarian: /[\u0400-\u04ff]/,
        Serbian: /[\u0400-\u04ff]/,
        Arabic: /[\u0600-\u06ff]/,
        Persian: /[\u0600-\u06ff]/,
        Urdu: /[\u0600-\u06ff]/,
        Hebrew: /[\u0590-\u05ff]/,
        Greek: /[\u0370-\u03ff]/,
        Hindi: /[\u0900-\u097f]/,
        Marathi: /[\u0900-\u097f]/,
        Bengali: /[\u0980-\u09ff]/,
        Tamil: /[\u0b80-\u0bff]/,
        Telugu: /[\u0c00-\u0c7f]/
      };
      const NON_LATIN_LANGUAGES = new Set([
        "Chinese",
        "Japanese",
        "Korean",
        ...Object.keys(LANGUAGE_SCRIPT_PATTERNS)
      ]);

      const detectLanguageFromText = (text, languageA, languageB) => {
        const content = String(text || "").trim();
        if (!content) return "";

        const hasHan = /[\u4e00-\u9fff]/.test(content);
        const hasHiraganaOrKatakana = /[\u3040-\u30ff]/.test(content);
        const hasHangul = /[\uac00-\ud7af]/.test(content);
        const hasLatin = /[A-Za-z]/.test(content);
        const lower = content.toLowerCase();

        const score = (lang) => {
          let value = 0;
          if (lang === "Chinese") {
            if (hasHan) value += 4;
            if (hasHiraganaOrKatakana) value -= 2;
            if (hasHangul) value -= 2;
          }
          if (lang === "Japanese") {
            if (hasHiraganaOrKatakana) value += 5;
            if (hasHan) value += 1;
          }
          if (lang === "Korean") {
            if (hasHangul) value += 5;
          }
          if (lang === "English") {
            if (hasLatin) value += 2;
            if (/\b(the|and|is|are|you|i|we|hello|thanks)\b/.test(lower)) value += 2;
            if (/[áéíóúñü¿¡]/i.test(content)) value -= 1;
          }
          if (lang === "Spanish") {
            if (hasLatin) value += 2;
            if (/[áéíóúñü¿¡]/i.test(content)) value += 3;
            if (/\b(hola|gracias|que|estoy|buenos|adios)\b/.test(lower)) value += 2;
          }
          if (LANGUAGE_SCRIPT_PATTERNS[lang]) {
            if (LANGUAGE_SCRIPT_PATTERNS[lang].test(content)) value += 5;
          } else if (
            hasLatin &&
            lang !== "English" &&
            lang !== "Spanish" &&
            !NON_LATIN_LANGUAGES.has(lang)
          ) {
            // Every other supported language is written in Latin letters.
            value += 2;
          }
          return value;
        };

        const scoreA = score(languageA);
        const scoreB = score(languageB);
        if (scoreA === scoreB) return "";
        return scoreA > scoreB ? languageA : languageB;
      };

      const languageToSide = (language, languageA, languageB) => {
        if (language && language === languageA) return "left";
        if (language && language === languageB) return "right";
        return nextSpeakerSide;
      };

      // Called when it is known whether this visitor may translate. A site with
      // accounts calls it whenever that changes; here everyone may, from the
      // start.
      const applyVisitorAdmission = (admitted) => {
        updateAutoVoiceModeAccess(admitted, { applyDefaultMode: !voiceModeChosenOnThisPage });
        updateGeminiDirectAccess(admitted);
        if (admitted) {
          maybeAutoOpenTalkMode();
        }
      };

      const teardownInputCaptureNodes = () => {
        if (sourceNode) {
          try {
            sourceNode.disconnect();
          } catch {
            // ignored
          }
          sourceNode = null;
        }

        if (processorNode) {
          processorNode.onaudioprocess = null;
          try {
            processorNode.disconnect();
          } catch {
            // ignored
          }
          processorNode = null;
        }

        if (sinkNode) {
          try {
            sinkNode.disconnect();
          } catch {
            // ignored
          }
          sinkNode = null;
        }
      };

      const ensureInputCaptureNodes = () => {
        if (!audioContext || !mediaStream) return;
        if (sourceNode && processorNode && sinkNode) return;

        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        capturedMsSinceMicOpened = 0;
        sinkNode = audioContext.createGain();
        sinkNode.gain.value = 0;

        processorNode.onaudioprocess = (event) => {
          const mono = event.inputBuffer.getChannelData(0);
          const capturedFrame = new Float32Array(mono);
          const settleMs = window.LiveTalkTranslationLanguage?.MIC_SETTLE_MS || 0;
          const micSettling = capturedMsSinceMicOpened < settleMs;
          // Counted from the first frame with any sound in it: a phone may
          // hand over empty frames before the microphone really starts.
          if (capturedMsSinceMicOpened > 0 || capturedFrame.some((sample) => sample !== 0)) {
            capturedMsSinceMicOpened +=
              (capturedFrame.length / (event.inputBuffer.sampleRate || 48000)) * 1000;
          }
          if (isRecording) {
            recordingChunks.push(capturedFrame);
            if (micSettling) recordingSettlingChunks += 1;
            showMicLevel(calculateFloat32Rms(capturedFrame));
            if (manualDirectTurn) {
              const frame = buildAutoAudioFrame(capturedFrame);
              manualDirectTurn.session.pushAudio(frame.base64, frame.durationMs);
              if (manualParallelTurn) {
                manualParallelTurn.session.pushAudio(frame.base64, frame.durationMs);
              }
            }
          }
          if (activeVoiceMode === "auto" && autoModeEnabled) {
            handleAutoAudioFrame(capturedFrame);
          }
        };

        sourceNode.connect(processorNode);
        processorNode.connect(sinkNode);
        sinkNode.connect(audioContext.destination);
      };

      // The screen stays on while the microphone is open: the phone is in the
      // middle of a conversation, on the table or held out to someone.
      const acquireScreenWakeLock = async () => {
        if (!navigator.wakeLock || screenWakeLock) return;
        try {
          const lock = await navigator.wakeLock.request("screen");
          if (!mediaStream || screenWakeLock) {
            lock.release().catch(() => {});
            return;
          }
          screenWakeLock = lock;
          lock.addEventListener("release", () => {
            if (screenWakeLock === lock) screenWakeLock = null;
          });
        } catch {
          // Not available (for example in battery saver mode): carry on.
        }
      };

      const releaseScreenWakeLock = () => {
        const lock = screenWakeLock;
        screenWakeLock = null;
        if (lock) {
          lock.release().catch(() => {});
        }
      };

      // iOS only. "play-and-record" lets the speaker play at full volume
      // while the microphone is open, also with the ringer switched to
      // silent. "auto" hands the choice back to the browser.
      const setAudioSessionType = (type) => {
        try {
          if (navigator.audioSession) {
            navigator.audioSession.type = type;
          }
        } catch {
          // ignored
        }
      };

      // A short buzz when the recording starts and when it stops, so neither
      // person has to look at the screen. Android only: iPhones do not let
      // web pages vibrate; they tick on each tap instead (attachIPhoneTapTick).
      const pulseDevice = (durationMs) => {
        try {
          if (typeof navigator.vibrate === "function") {
            navigator.vibrate(durationMs);
          }
        } catch {
          // ignored
        }
      };

      // A soft two-note chime as a recording starts (rising) and as it stops
      // (falling), heard along with the buzz or tick. Made on the page's own
      // audio, quiet, and not played while the sound switch is off. Chosen
      // on 2026-11-17 ("A 轻柔双音"). Tried on a real
      // iPhone that day: the start chime played into the open microphone
      // reaches the recording only faintly (at most about 0.001 RMS, against
      // 0.0001 without it, while recordingHasSound counts 0.006 and up), so
      // a silent press is still turned away. Says whether it played.
      const RECORDING_CUE_VOLUME = 0.15;
      // How long the chime lasts, with a little to spare.
      const RECORDING_CUE_MS = 300;
      const playRecordingCue = (kind) => {
        if (soundIsOff() || !audioContext || audioContext.state !== "running") return false;
        try {
          const context = audioContext;
          const notes = kind === "start" ? [660, 880] : [880, 660];
          const startAt = context.currentTime + 0.01;
          notes.forEach((frequency, index) => {
            const noteAt = startAt + index * 0.08;
            const duration = index === 0 ? 0.09 : 0.12;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(frequency, noteAt);
            gain.gain.setValueAtTime(0.0001, noteAt);
            gain.gain.exponentialRampToValueAtTime(RECORDING_CUE_VOLUME, noteAt + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteAt + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.onended = () => {
              try {
                oscillator.disconnect();
                gain.disconnect();
              } catch {
                // ignored
              }
            };
            oscillator.start(noteAt);
            oscillator.stop(noteAt + duration + 0.02);
          });
          return true;
        } catch {
          // ignored: the chime is only a courtesy
          return false;
        }
      };

      const clearManualMicKeepTimer = () => {
        if (!manualMicKeepTimer) return;
        window.clearTimeout(manualMicKeepTimer);
        manualMicKeepTimer = null;
      };

      const closeMicrophoneTracks = () => {
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {
              // ignored
            }
          });
          mediaStream = null;
        }
        teardownInputCaptureNodes();
        autoMicReady = false;
      };

      const clearMicResumeTimer = () => {
        if (micResumeTimer) window.clearTimeout(micResumeTimer);
        micResumeTimer = null;
      };

      const releaseMicrophoneStream = () => {
        clearManualMicKeepTimer();
        clearMicResumeTimer();
        releaseScreenWakeLock();
        micPausedForPlayback = false;
        setAudioSessionType("auto");
        closeMicrophoneTracks();
      };

      // Push to Talk: while the microphone is open, an iPhone treats the
      // page like a phone call. Whatever it then plays through its own
      // speaker crackles and is quieter, and nothing a page plays or how it
      // plays it changes that (tried on 2026-11-16: louder, softer, in
      // pieces, as one piece). So the microphone closes while a translation
      // plays and opens again once it has finished, ready for the next
      // press. The price is that the browser may announce or ask for the
      // microphone again on every turn. The screen stays on in between.
      const MIC_RESUME_DELAY_MS = 400;

      const pauseMicrophoneForPlayback = () => {
        if (activeVoiceMode !== "manual" || !mediaStream) return;
        if (isRecording || isRecordingIntentActive()) return;
        clearManualMicKeepTimer();
        clearMicResumeTimer();
        micPausedForPlayback = true;
        closeMicrophoneTracks();
        setAudioSessionType("playback");
      };

      // Called whenever something stops playing. Waits a moment, so the
      // last of the sound has left the speaker, and opens the microphone
      // only if nothing is playing or on its way by then.
      const resumeMicrophoneAfterPlayback = () => {
        if (!micPausedForPlayback || micResumeTimer) return;
        micResumeTimer = window.setTimeout(() => {
          micResumeTimer = null;
          if (!micPausedForPlayback) return;
          if (
            processing ||
            streamingPlaybackSources.size > 0 ||
            (currentReplayAudio && !currentReplayAudio.paused)
          ) {
            // Whatever is still playing calls this again when it ends.
            return;
          }
          micPausedForPlayback = false;
          if (mediaStream || microphoneRequest) return;
          if (activeVoiceMode !== "manual" || document.visibilityState !== "visible") {
            releaseMicrophoneStream();
            return;
          }
          ensureAudioPipeline()
            .then(() => {
              // The mode changed while the microphone was opening: nothing
              // else will close it.
              if (activeVoiceMode !== "manual" && !autoModeEnabled && !autoStartPending) {
                releaseMicrophoneStream();
              }
            })
            .catch(() => {
              releaseMicrophoneStream();
            });
        }, MIC_RESUME_DELAY_MS);
      };

      // Push to Talk: leaves the microphone open for a while after a turn, so
      // the next press records from its first moment instead of waiting for
      // the phone to hand the microphone over again. Nothing is recorded or
      // sent in between. Each call starts the wait afresh.
      const keepManualMicrophoneOpen = () => {
        clearManualMicKeepTimer();
        if (!mediaStream) return;
        if (activeVoiceMode !== "manual" || document.visibilityState !== "visible") {
          releaseMicrophoneStream();
          return;
        }
        const releaseWhenQuiet = () => {
          manualMicKeepTimer = null;
          if (
            isRecording ||
            isRecordingIntentActive() ||
            processing ||
            streamingPlaybackSources.size > 0 ||
            (currentReplayAudio && !currentReplayAudio.paused)
          ) {
            // Never in the middle of a turn: not while someone is speaking,
            // nor while the translation is still arriving, being played or
            // being replayed.
            manualMicKeepTimer = window.setTimeout(releaseWhenQuiet, MANUAL_MIC_RECHECK_MS);
            return;
          }
          releaseMicrophoneStream();
          // The page's audio goes too: the next press then starts everything
          // the same way as the very first press, which works on iPhones,
          // instead of reusing audio the phone has meanwhile paused.
          closeAudioContext();
        };
        manualMicKeepTimer = window.setTimeout(releaseWhenQuiet, MANUAL_MIC_KEEP_MS);
      };

      const revealConversationIfNeeded = () => {
        if (messagesEmpty && messagesList && !messagesList.children.length) {
          messagesEmpty.classList.remove("hidden");
        }
      };

      const classifyMicrophoneAccessFailure = ({ permissionStateBefore = null, error } = {}) => {
        const errorName = String(error?.name || error?.code || "");

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
          return MIC_PERMISSION_STATES.UNAVAILABLE;
        }

        if (permissionStateBefore === "denied") {
          return MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE;
        }

        if (
          errorName === "NotFoundError" ||
          errorName === "DevicesNotFoundError" ||
          errorName === "OverconstrainedError" ||
          errorName === "NotReadableError" ||
          errorName === "AbortError" ||
          errorName === "TrackStartError"
        ) {
          return MIC_PERMISSION_STATES.UNAVAILABLE;
        }

        if (errorName === "NotAllowedError" || errorName === "SecurityError") {
          // Chrome on a computer whose own settings keep the microphone from
          // the browser ("Permission denied by system"): nobody was asked,
          // and a reload changes nothing.
          if (/\bsystem\b/i.test(String(error?.message || ""))) {
            return MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE;
          }
          if (permissionStateBefore === "prompt") {
            return MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD;
          }
          return MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE;
        }

        return MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE;
      };

      // The person closed Chrome's prompt without answering it. That is not
      // a refusal: nothing is shown, and the next tap asks again.
      const isMicPromptDismissed = ({ permissionStateBefore = null, error, waitedMs = 0 } = {}) =>
        permissionStateBefore === "prompt" &&
        String(error?.name || "") === "NotAllowedError" &&
        /dismiss/i.test(String(error?.message || "")) &&
        waitedMs >= MIC_PROMPT_DISMISS_MIN_MS;

      const handleMicrophoneAccessFailure = ({ permissionStateBefore = null, error, waitedMs = 0 } = {}) => {
        if (isMicPromptDismissed({ permissionStateBefore, error, waitedMs })) {
          setIdleInstructionMode("default");
          return MIC_PREPARE_RECORDING_ACTIONS.BLOCKED;
        }
        const nextState = classifyMicrophoneAccessFailure({ permissionStateBefore, error });
        const errorName = String(error?.name || error?.code || "");

        if (nextState === MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD) {
          hasDeniedMicPromptThisSession = true;
        }

        setMicPermissionStatus(nextState, {
          permissionState: permissionStateBefore,
          errorName,
          showNotice: true
        });
        revealConversationIfNeeded();
        if (nextState === MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD) {
          // Where the browser now reports the refusal as recorded, the card
          // changes to the blocked one straight away.
          void syncMicrophonePermissionState();
        }

        return nextState === MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD
          ? MIC_PREPARE_RECORDING_ACTIONS.SHOW_RELOAD_GUIDANCE
          : MIC_PREPARE_RECORDING_ACTIONS.SHOW_SETTINGS_GUIDANCE;
      };

      const refreshMicPermissionAfterReturn = async () => {
        const permissionState = await syncMicrophonePermissionState();
        if (permissionState === "granted") {
          releasePreparedMicrophoneIfIdle({ markReady: true, keepOpen: true });
          return;
        }

        if (permissionState === "prompt") {
          releasePreparedMicrophoneIfIdle();
        }
      };

      const createAudioContext = () => {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        inputSampleRate = audioContext.sampleRate;
      };

      // Connects the microphone to the recorder and sets up the speaker side.
      const buildAudioGraph = () => {
        ensureInputCaptureNodes();
        if (!playbackGainNode) {
          playbackGainNode = audioContext.createGain();
          playbackGainNode.gain.value = 1;
          playbackGainNode.connect(audioContext.destination);
          playbackRoutedLoud = false;
        }
        routePlayback();
      };

      // Throws the page's audio away (recorder and speaker side alike), so
      // the next press builds it afresh, exactly as on the first press.
      // Only called when nothing is being recorded or played.
      const closeAudioContext = () => {
        if (!audioContext) return;
        const context = audioContext;
        stopStreamingPlayback();
        teardownInputCaptureNodes();
        audioContext = null;
        playbackGainNode = null;
        loudPlaybackInput = null;
        playbackRoutedLoud = false;
        playbackFadeEndTime = 0;
        context.close().catch(() => {});
      };

      const AUDIO_RESUME_TIMEOUT_MS = 800;

      const resumeAudioContext = async () => {
        if (!audioContext || audioContext.state === "running") return;
        let timer = null;
        try {
          await Promise.race([
            audioContext.resume(),
            new Promise((resolve) => {
              timer = window.setTimeout(resolve, AUDIO_RESUME_TIMEOUT_MS);
            })
          ]);
        } catch {
          // Checked below.
        } finally {
          window.clearTimeout(timer);
        }
      };

      // After the microphone has been closed for a while, or the screen was
      // locked, iPhones leave the page's audio paused ("suspended" or
      // "interrupted"). A recording made then receives no sound at all, and
      // the turn was reported as too short however long the button was
      // held. So the audio is started again here, whatever paused it, and
      // if it will not start it is built anew.
      const ensureAudioContextRunning = async () => {
        if (!audioContext || audioContext.state === "running") return;
        await resumeAudioContext();
        if (!audioContext || audioContext.state === "running") return;
        closeAudioContext();
        createAudioContext();
        buildAudioGraph();
        await resumeAudioContext();
      };

      const ensureAudioPipeline = async (permissionStateBefore = null) => {
        let justGranted = false;
        if (!audioContext) {
          createAudioContext();
        }

        if (!mediaStream) {
          // A second press can arrive while the phone is still handing the
          // microphone over: both wait for the same request, so no stream is
          // ever opened twice and left behind.
          micPausedForPlayback = false;
          clearMicResumeTimer();
          if (!microphoneRequest) {
            setAudioSessionType("play-and-record");
            const request = requestMicrophoneStream();
            microphoneRequest = request;
            const forget = () => {
              if (microphoneRequest === request) microphoneRequest = null;
            };
            request.then(forget, forget);
          }
          let stream = null;
          try {
            stream = await microphoneRequest;
          } catch (error) {
            if (!mediaStream) setAudioSessionType("auto");
            throw error;
          }
          if (!mediaStream) {
            mediaStream = stream;
          }

          if (permissionStateBefore === "prompt") {
            justGranted = true;
          }
        }
        if (activeVoiceMode === "manual") {
          keepManualMicrophoneOpen();
        } else {
          clearManualMicKeepTimer();
        }
        void acquireScreenWakeLock();

        buildAudioGraph();
        await ensureAudioContextRunning();

        autoMicReady = true;
        return justGranted;
      };

      // Sound that stops or starts in the middle of a wave is heard as a
      // click, so a translation that is cut off fades out over this long,
      // and one that resumes after a break fades in.
      const PLAYBACK_FADE_SECONDS = 0.012;
      // Nothing new plays before this: a cut-off translation is still
      // fading out until then.
      let playbackFadeEndTime = 0;
      // A translation arrives in small pieces while it is being played.
      // When the next piece is late (typically between two sentences) the
      // sound would stop in the middle of a wave. So every piece is set to
      // fade out at its very end, and that fade is called off when the
      // next piece arrives in time to follow straight on. This is the last
      // piece queued and where its fade starts and ends.
      let lastPlaybackPiece = null;
      // The pieces arrive at one sample rate and the phone plays at
      // another. Left to the browser, every piece is converted on its own
      // and two pieces do not meet exactly: a small jump at every join,
      // heard as crackle (measured in Safari: up to 0.4 of full scale). So
      // the page converts them itself, as one continuous sound: where the
      // next output sample falls in the piece to come (-1 is the last
      // sample of the piece before), and that last sample.
      const playbackResampleState = { position: 0, lastSample: 0 };
      // Where the last piece ends, counted in output samples, so the next
      // one starts on exactly the following sample.
      let playbackCursorFrame = 0;

      // Converts one piece to the output rate, carrying on from the piece
      // before. The part between this piece's last sample and the next
      // piece's first is left for the next call.
      const resamplePlaybackPiece = (state, input, inputRate, outputRate) => {
        const step = inputRate / outputRate;
        const count = input.length;
        let position = state.position;
        const output = new Float32Array(Math.max(0, Math.ceil((count - 1 - position) / step)) + 1);
        let written = 0;
        while (position < count - 1) {
          const index = Math.floor(position);
          const fraction = position - index;
          const before = index < 0 ? state.lastSample : input[index];
          output[written] = before + (input[index + 1] - before) * fraction;
          written += 1;
          position += step;
        }
        state.position = position - count;
        state.lastSample = input[count - 1];
        return output.subarray(0, written);
      };

      // The fade of the piece before can only be called off this long
      // before it starts; later than that it is left to play out.
      const PLAYBACK_FADE_CANCEL_MARGIN_SECONDS = 0.005;
      // A piece that does not follow straight on starts this far ahead, so
      // the pieces after it have time to arrive before it runs out.
      const PLAYBACK_RESTART_LEAD_SECONDS = 0.08;

      // How the playing of one translation went, for the turn report
      // (sendPlaybackReport). A translation was heard to stumble once on its
      // first playing and not when played again (2026-11-18), and nothing
      // was left to tell why: a piece that arrived after the one before it
      // had run out, the phone's or computer's sound falling behind, or
      // neither. One record per translation, begun when its queue is reset.
      let playbackHealth = null;
      const PLAYBACK_LATE_NOTES_MAX = 5;
      // Chrome counts the moments the sound card was given nothing to
      // play; other browsers do not say.
      const readPlaybackUnderruns = () => {
        try {
          const stats = audioContext && audioContext.playbackStats;
          if (!stats || typeof stats.underrunEvents !== "number") return null;
          return { events: stats.underrunEvents, ms: (Number(stats.underrunDuration) || 0) * 1000 };
        } catch {
          return null;
        }
      };
      // The record stays open while the sentence's turn is under way, also
      // when the sound runs out in between: the piece that then comes late
      // is the very thing to be noted. It is closed when the playing is
      // stopped or replaced, or, once the turn has been reported
      // (reportPlaybackFor), when the last sound has played.
      // `cut`: stopped by the page before its end.
      const finishPlaybackHealth = (cut) => {
        const health = playbackHealth;
        if (!health || health.done) return;
        health.done = true;
        if (!health.pieces) return;
        health.cut = cut;
        try {
          // How far the audio clock fell behind the wall clock while this
          // played: it stands still while the sound is interrupted.
          health.clockLagMs = Math.round(
            performance.now() - health.firstWall - (audioContext.currentTime - health.firstContextTime) * 1000
          );
          const underruns = readPlaybackUnderruns();
          if (underruns && health.underrunsAtStart) {
            health.underruns = underruns.events - health.underrunsAtStart.events;
            health.underrunMs = Math.round(underruns.ms - health.underrunsAtStart.ms);
          }
        } catch {
          // The report goes without them.
        }
        if (health.requestId) sendPlaybackReport(health);
      };
      // One piece as it is queued. `ahead`: how much sound was still queued
      // when it arrived; `gap`: the silence before it, when it does not
      // follow straight on.
      const notePlaybackPiece = (followsOn, ahead, gap, seconds) => {
        const health = playbackHealth;
        if (!health || health.done) return;
        if (!health.pieces) {
          health.firstWall = performance.now();
          health.firstContextTime = audioContext.currentTime;
          health.underrunsAtStart = readPlaybackUnderruns();
        } else {
          const aheadMs = Math.max(0, Math.round(ahead * 1000));
          health.aheadMs = health.aheadMs === null ? aheadMs : Math.min(health.aheadMs, aheadMs);
          if (!followsOn) {
            health.lateCount += 1;
            if (health.late.length < PLAYBACK_LATE_NOTES_MAX) {
              health.late.push({ atMs: Math.round(health.audioMs), gapMs: Math.max(0, Math.round(gap * 1000)) });
            }
          }
        }
        if (audioContext.state !== "running") health.notRunning += 1;
        health.pieces += 1;
        health.audioMs += seconds * 1000;
      };

      const resetStreamingPlaybackQueue = () => {
        if (!audioContext) return;
        // A first piece still waiting belongs to what came before.
        dropHeldPlaybackPiece();
        finishPlaybackHealth(streamingPlaybackSources.size > 0);
        playbackHealth = {
          pieces: 0,
          audioMs: 0,
          aheadMs: null,
          lateCount: 0,
          late: [],
          notRunning: 0,
          clockLagMs: null,
          underruns: null,
          underrunMs: null,
          cut: false,
          done: false,
          requestId: "",
          after: null
        };
        const now = audioContext.currentTime;
        // A fade never ends more than a moment ahead; anything later is a
        // leftover and must not hold the next translation back.
        const fadeEnd = Math.min(playbackFadeEndTime, now + PLAYBACK_FADE_SECONDS + 0.01);
        playbackCursorTime = Math.max(now + 0.02, fadeEnd);
        // Whatever plays next is a new translation: it does not follow on
        // from the last piece, which keeps its fade.
        lastPlaybackPiece = null;
        if (audioDebug) audioDebug.startTurn();
      };

      // Told when a translation still being read out is cut off.
      const streamingPlaybackStopListeners = new Set();

      // How long the translation queued for playback still has to run.
      const streamingPlaybackRemainingMs = () => {
        if (!audioContext) return 0;
        if (heldPlaybackPiece) {
          // A first piece still waiting to start (see schedulePlaybackPiece).
          return (
            PLAYBACK_START_HOLD_MS +
            (PLAYBACK_RESTART_LEAD_SECONDS + heldPlaybackPiece.floatData.length / heldPlaybackPiece.sampleRate) * 1000
          );
        }
        if (!streamingPlaybackSources.size) return 0;
        return Math.max(0, (playbackCursorTime - audioContext.currentTime) * 1000);
      };

      // Cuts off a translation that is still being played, so a new sentence
      // is not recorded on top of the previous answer.
      const stopStreamingPlayback = () => {
        // The fade needs the page's audio to be running: while it is paused
        // its clock stands still and the fade would only play out later.
        const canFade =
          streamingPlaybackSources.size > 0 &&
          audioContext &&
          playbackGainNode &&
          audioContext.state === "running";
        let stopAt = 0;
        if (canFade) {
          const now = audioContext.currentTime;
          stopAt = now + PLAYBACK_FADE_SECONDS;
          const gain = playbackGainNode.gain;
          try {
            gain.cancelScheduledValues(now);
            gain.setValueAtTime(1, now);
            gain.linearRampToValueAtTime(0, stopAt);
            // Back to full just after, for whatever plays next.
            gain.setValueAtTime(1, stopAt + 0.003);
            playbackFadeEndTime = stopAt + 0.005;
          } catch {
            stopAt = 0;
          }
        }
        if (streamingPlaybackSources.size) finishPlaybackHealth(true);
        for (const source of streamingPlaybackSources) {
          source.onended = null;
          try {
            if (stopAt) source.stop(stopAt);
            else source.stop();
          } catch {
            // ignored
          }
        }
        streamingPlaybackSources.clear();
        resetStreamingPlaybackQueue();
        for (const listener of [...streamingPlaybackStopListeners]) listener();
      };

      const stopCurrentReplayAudio = () => {
        if (!currentReplayAudio) return;
        try {
          currentReplayAudio.pause();
          currentReplayAudio.currentTime = 0;
        } catch {
          // ignored
        }
        currentReplayAudio = null;
      };

      // Thrown by a turn that finds the conversation was cleared under it
      // (a new language pair, for instance): it ends quietly, with no message.
      const createConversationResetError = () => {
        const error = new Error("Conversation reset.");
        error.code = "conversation_reset";
        return error;
      };

      const isConversationResetError = (error) => {
        return Boolean(error && typeof error === "object" && error.code === "conversation_reset");
      };

      // While the microphone is open, iPhones play at the quieter phone-call
      // volume, and a web page cannot change that. In Push to Talk the
      // translation is made louder instead: everything is raised 1.7 times
      // and the peaks that would then be too loud are rounded off rather
      // than cut. Measured on recorded speech this is 4 to 5 dB louder.
      // An earlier version also brought quiet parts up to the loud ones
      // and raised everything 2.5 times: quiet speech came out 10 to 14 dB
      // louder and pressed against the limit all the time, and on an
      // iPhone it was heard with pops. So the level is only raised, by the
      // same amount throughout. Hands-free plays unchanged: it listens
      // while a translation plays, and louder playback would reach its
      // microphone more.
      const PUSH_TO_TALK_PLAYBACK_BOOST = 1.7;
      const SOFT_LIMIT_KNEE = 0.7;
      const SOFT_LIMIT_CEILING = 0.98;
      // A WaveShaper only reads inputs from -1 to 1 and holds anything
      // beyond at the end value, so the signal is scaled down by this much
      // before it and the curve covers four times the range: loud peaks are
      // still rounded off instead of cut flat.
      const SOFT_LIMIT_INPUT_RANGE = 4;

      const buildSoftLimitCurve = () => {
        const size = 4096;
        const curve = new Float32Array(size);
        const span = SOFT_LIMIT_CEILING - SOFT_LIMIT_KNEE;
        for (let i = 0; i < size; i += 1) {
          const x = ((i * 2) / (size - 1) - 1) * SOFT_LIMIT_INPUT_RANGE;
          const magnitude = Math.abs(x);
          const shaped =
            magnitude <= SOFT_LIMIT_KNEE
              ? magnitude
              : SOFT_LIMIT_KNEE + span * Math.tanh((magnitude - SOFT_LIMIT_KNEE) / span);
          curve[i] = Math.sign(x) * shaped;
        }
        return curve;
      };

      const ensureLoudPlaybackChain = () => {
        if (loudPlaybackInput || !audioContext) return loudPlaybackInput;
        const boost = audioContext.createGain();
        boost.gain.value = PUSH_TO_TALK_PLAYBACK_BOOST / SOFT_LIMIT_INPUT_RANGE;
        const limiter = audioContext.createWaveShaper();
        limiter.curve = buildSoftLimitCurve();
        limiter.oversample = "2x";
        boost.connect(limiter);
        limiter.connect(audioContext.destination);
        loudPlaybackInput = boost;
        return loudPlaybackInput;
      };

      // For finding out on a real phone why streamed translations
      // crackle: opening the page with ?audiodebug=1 shows a small panel
      // with what happened while the last translation played, and switches
      // to play it differently for comparison. Without that parameter this
      // is null and nothing changes.
      audioDebug = (() => {
        let enabled = false;
        try {
          enabled = new URLSearchParams(window.location.search).get("audiodebug") === "1";
        } catch {
          // ignored
        }
        if (!enabled) return null;

        const debug = {
          boostOff: false,
          wholeMode: false,
          fadesOff: false,
          pending: [],
          pendingRate: 24000,
          pendingTimer: null,
          flush: null
        };
        let turn = null;
        let replayNote = "";
        let panelText = null;
        let renderQueued = false;

        const median = (values) => {
          if (!values.length) return 0;
          const sorted = values.slice().sort((a, b) => a - b);
          return sorted[Math.floor(sorted.length / 2)];
        };
        const ms = (seconds) => Math.round(seconds * 1000);

        const describe = () => {
          const lines = [];
          const context = audioContext;
          const track = mediaStream && mediaStream.getAudioTracks ? mediaStream.getAudioTracks()[0] : null;
          let trackSettings = {};
          try {
            trackSettings = track && track.getSettings ? track.getSettings() : {};
          } catch {
            // ignored
          }
          lines.push(
            "ctx " +
              (context
                ? context.sampleRate +
                  "Hz " +
                  context.state +
                  " lat " +
                  ms(context.baseLatency || 0) +
                  "/" +
                  ms(context.outputLatency || 0) +
                  "ms"
                : "none") +
              " | mic " +
              (track ? "open " + (trackSettings.sampleRate || "?") + "Hz ec=" + trackSettings.echoCancellation : "closed") +
              " | loud route " +
              (playbackRoutedLoud ? "yes" : "no")
          );
          lines.push(
            "switch: boost " +
              (debug.boostOff ? "OFF" : "on") +
              " | play " +
              (debug.wholeMode ? "WHOLE" : "pieces") +
              " | piece fades " +
              (debug.fadesOff ? "OFF" : "on")
          );
          if (turn && turn.sizes.length) {
            const total = turn.sizes.reduce((sum, value) => sum + value, 0);
            const wall = (turn.lastArrival - turn.firstArrival) / 1000;
            lines.push(
              "pieces " +
                turn.sizes.length +
                " | each " +
                ms(Math.min(...turn.sizes)) +
                "/" +
                ms(median(turn.sizes)) +
                "/" +
                ms(Math.max(...turn.sizes)) +
                "ms | total " +
                total.toFixed(1) +
                "s"
            );
            lines.push(
              "level: peak " +
                turn.peak.toFixed(2) +
                " | into limiter " +
                ((100 * turn.overKnee) / Math.max(1, turn.samples)).toFixed(1) +
                "% | odd bytes " +
                turn.oddBytes
            );
            lines.push(
              "arrival: pace " +
                (wall > 0 ? ((total - turn.sizes[turn.sizes.length - 1]) / wall).toFixed(2) : "?") +
                "x | max gap " +
                Math.round(turn.maxArrivalGap) +
                "ms"
            );
            lines.push(
              "queue ahead: min " +
                ms(Math.min(...turn.leads)) +
                " / median " +
                ms(median(turn.leads)) +
                "ms | restarts " +
                turn.restarts +
                " | joined " +
                turn.joined
            );
            lines.push(
              "clock: max drift " + Math.round(turn.maxClockDrift) + "ms | state changes " + turn.stateChanges
            );
            if (turn.restartNotes.length) lines.push("restarts at: " + turn.restartNotes.slice(0, 8).join(", "));
          } else {
            lines.push("(no translation played yet)");
          }
          if (replayNote) lines.push(replayNote);
          return lines.join("\n");
        };

        const render = () => {
          renderQueued = false;
          if (!document.body) return;
          if (!panelText) {
            const panel = document.createElement("div");
            panel.style.cssText =
              "position:fixed;left:4px;right:4px;top:4px;z-index:2147483647;background:rgba(0,0,0,.82);color:#9f9;" +
              "font:11px/1.35 ui-monospace,Menlo,monospace;padding:6px;border-radius:6px;max-height:45vh;overflow:auto";
            const buttons = document.createElement("div");
            buttons.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px";
            const addButton = (label, onPress) => {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = label;
              button.style.cssText =
                "font:12px sans-serif;padding:4px 8px;border-radius:4px;border:1px solid #9f9;background:#000;color:#9f9";
              button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                onPress();
                render();
              });
              buttons.appendChild(button);
            };
            addButton("增音 开/关", () => {
              debug.boostOff = !debug.boostOff;
              routePlayback();
            });
            addButton("分片/整段", () => {
              debug.wholeMode = !debug.wholeMode;
            });
            addButton("片尾淡出 开/关", () => {
              debug.fadesOff = !debug.fadesOff;
            });
            addButton("复制", () => {
              try {
                navigator.clipboard.writeText(describe()).catch(() => {});
              } catch {
                // ignored
              }
            });
            panelText = document.createElement("pre");
            panelText.style.cssText = "margin:0;white-space:pre-wrap;user-select:text;-webkit-user-select:text";
            panel.appendChild(buttons);
            panel.appendChild(panelText);
            document.body.appendChild(panel);
          }
          panelText.textContent = describe();
        };
        const queueRender = () => {
          if (renderQueued) return;
          renderQueued = true;
          window.setTimeout(render, 150);
        };

        debug.startTurn = () => {
          if (debug.pendingTimer) window.clearTimeout(debug.pendingTimer);
          debug.pendingTimer = null;
          debug.pending = [];
          turn = {
            sizes: [],
            leads: [],
            samples: 0,
            overKnee: 0,
            peak: 0,
            oddBytes: 0,
            restarts: 0,
            joined: 0,
            restartNotes: [],
            firstArrival: 0,
            lastArrival: 0,
            maxArrivalGap: 0,
            maxClockDrift: 0,
            lastContextTime: 0,
            stateChanges: 0,
            lastState: audioContext ? audioContext.state : ""
          };
          queueRender();
        };
        // One piece as it arrived, before anything is scheduled.
        debug.notePiece = (floatData, sampleRate, byteLength) => {
          if (!turn) debug.startTurn();
          const arrival = performance.now();
          const contextTime = audioContext.currentTime;
          if (turn.sizes.length) {
            turn.maxArrivalGap = Math.max(turn.maxArrivalGap, arrival - turn.lastArrival);
            const drift = Math.abs((contextTime - turn.lastContextTime) * 1000 - (arrival - turn.lastArrival));
            turn.maxClockDrift = Math.max(turn.maxClockDrift, drift);
          } else {
            turn.firstArrival = arrival;
          }
          turn.lastArrival = arrival;
          turn.lastContextTime = contextTime;
          if (audioContext.state !== turn.lastState) {
            turn.stateChanges += 1;
            turn.lastState = audioContext.state;
          }
          if (byteLength % 2) turn.oddBytes += 1;
          const kneeInput = SOFT_LIMIT_KNEE / PUSH_TO_TALK_PLAYBACK_BOOST;
          for (let i = 0; i < floatData.length; i += 1) {
            const magnitude = Math.abs(floatData[i]);
            if (magnitude > turn.peak) turn.peak = magnitude;
            if (magnitude > kneeInput) turn.overKnee += 1;
          }
          turn.samples += floatData.length;
          turn.sizes.push(floatData.length / sampleRate);
          queueRender();
        };
        // How one piece was queued: how far ahead of now the queue reached,
        // and whether it joined the piece before.
        debug.noteQueued = (lead, followsOn) => {
          if (!turn) return;
          turn.leads.push(lead);
          if (followsOn) {
            turn.joined += 1;
          } else {
            turn.restarts += 1;
            turn.restartNotes.push("#" + turn.leads.length + " " + ms(lead) + "ms");
          }
          queueRender();
        };
        debug.noteReplay = (throughPageAudio) => {
          replayNote =
            "replay: " +
            (throughPageAudio ? "through page audio" : "plain player") +
            " | ctx " +
            (audioContext ? audioContext.state : "none") +
            " | mic " +
            (mediaStream ? "open" : "closed");
          queueRender();
        };
        // Whatever goes wrong in here must never stop a translation from
        // playing.
        for (const name of ["startTurn", "notePiece", "noteQueued", "noteReplay"]) {
          const original = debug[name];
          debug[name] = (...args) => {
            try {
              original(...args);
            } catch {
              // ignored
            }
          };
        }
        document.addEventListener("DOMContentLoaded", render);
        window.setTimeout(render, 1500);
        return debug;
      })();

      // Sends playback through the louder chain in Push to Talk while the
      // microphone is open (once it has closed the phone is back at full
      // volume), straight to the speaker otherwise. Checked before anything
      // plays, so a change takes effect from the next translation.
      const routePlayback = () => {
        if (!audioContext || !playbackGainNode) return;
        const wantLoud =
          activeVoiceMode === "manual" && Boolean(mediaStream) && !(audioDebug && audioDebug.boostOff);
        if (wantLoud === playbackRoutedLoud) return;
        const target = wantLoud ? ensureLoudPlaybackChain() : audioContext.destination;
        if (!target) return;
        try {
          playbackGainNode.disconnect();
        } catch {
          // ignored
        }
        playbackGainNode.connect(target);
        playbackRoutedLoud = wantLoud;
      };

      const enqueuePcm16Base64Chunk = (base64Chunk, sampleRate = 24000) => {
        // Sound off still goes all the way through here and is played as
        // silence (see schedulePlaybackPiece). Skipping playback altogether
        // left the iPhone's page audio idle while the microphone was closed,
        // and once the sound was switched on again translations stayed
        // silent.
        if (!audioContext || !playbackGainNode || !base64Chunk) return;
        routePlayback();
        // iPhones can pause the audio when the microphone closes and the
        // audio session changes; start it again before playing.
        if (audioContext.state !== "running" && audioContext.state !== "closed") {
          audioContext.resume().catch(() => {});
        }
        const bytes = base64ToUint8Array(base64Chunk);
        if (!bytes.length) return;

        const sampleCount = Math.floor(bytes.length / 2);
        if (!sampleCount) return;

        const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
        const floatData = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i += 1) {
          floatData[i] = view.getInt16(i * 2, true) / 32768;
        }
        if (audioDebug) {
          audioDebug.notePiece(floatData, sampleRate, bytes.length);
          if (audioDebug.wholeMode) {
            // For comparison: wait until the whole translation is here
            // and play it as a single piece.
            audioDebug.pending.push(floatData);
            audioDebug.pendingRate = sampleRate;
            if (audioDebug.pendingTimer) window.clearTimeout(audioDebug.pendingTimer);
            audioDebug.pendingTimer = window.setTimeout(audioDebug.flush, 600);
            return;
          }
        }
        schedulePlaybackPiece(floatData, sampleRate);
      };

      // The first piece of a translation waits here for the second one (or
      // this long, whichever comes first) and the two are queued together.
      // Played at once, a first piece as short as 0.08 s ran out before a
      // second piece only 0.2 s behind it: the first sound, a silence, then
      // the rest. The second piece is normally 0.02 to 0.06 s behind
      // (measured 2026-11-18), so the translation starts that much later
      // and with some 0.4 s more sound in hand.
      const PLAYBACK_START_HOLD_MS = 120;
      let heldPlaybackPiece = null;
      const dropHeldPlaybackPiece = () => {
        if (!heldPlaybackPiece) return;
        window.clearTimeout(heldPlaybackPiece.timer);
        heldPlaybackPiece = null;
      };
      const releaseHeldPlaybackPiece = () => {
        const held = heldPlaybackPiece;
        if (!held) return;
        dropHeldPlaybackPiece();
        queuePlaybackPiece(held.floatData, held.sampleRate);
      };
      const schedulePlaybackPiece = (floatData, sampleRate) => {
        if (heldPlaybackPiece) {
          releaseHeldPlaybackPiece();
        } else if (!lastPlaybackPiece) {
          heldPlaybackPiece = {
            floatData,
            sampleRate,
            timer: window.setTimeout(releaseHeldPlaybackPiece, PLAYBACK_START_HOLD_MS)
          };
          return;
        }
        queuePlaybackPiece(floatData, sampleRate);
      };

      // Queues one decoded piece to play after the ones before it.
      const queuePlaybackPiece = (floatData, sampleRate) => {
        if (!audioContext || !playbackGainNode) return;
        // Does this piece follow straight on from the one before? Only if
        // that one has not begun to fade out yet: its fade is called off
        // and the two play as one. Otherwise (the first piece of a
        // translation, or this one arrived late) the piece before fades
        // out, and this one fades in a moment later instead of starting in
        // the middle of a wave.
        const now = audioContext.currentTime;
        const previous = lastPlaybackPiece;
        let followsOn = false;
        if (
          previous &&
          previous.end === playbackCursorTime &&
          now + PLAYBACK_FADE_CANCEL_MARGIN_SECONDS < previous.fadeStart
        ) {
          try {
            previous.gain.cancelScheduledValues(0);
            followsOn = true;
          } catch {
            // The piece before keeps its fade.
          }
        }
        if (audioDebug) audioDebug.noteQueued(playbackCursorTime - now, followsOn);
        if (!followsOn) {
          playbackResampleState.position = 0;
          playbackResampleState.lastSample = 0;
        }
        const outputRate = audioContext.sampleRate;
        const outputData = resamplePlaybackPiece(playbackResampleState, floatData, sampleRate, outputRate);
        const outputCount = outputData.length;
        // Too short to give a single output sample: it is carried into the
        // next piece.
        if (!outputCount) return;
        if (!streamingPlaybackSources.size) playbackSilent = soundIsOff();
        if (playbackSilent) outputData.fill(0);
        if (!followsOn) {
          const fadeSamples = Math.min(outputCount, Math.round(outputRate * PLAYBACK_FADE_SECONDS));
          for (let i = 0; i < fadeSamples; i += 1) {
            outputData[i] *= i / fadeSamples;
          }
        }

        const audioBuffer = audioContext.createBuffer(1, outputCount, outputRate);
        audioBuffer.getChannelData(0).set(outputData);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        const pieceGain = audioContext.createGain();
        source.connect(pieceGain);
        pieceGain.connect(playbackGainNode);

        // Start and end are whole output samples, so one piece ends on the
        // sample before the next one starts.
        const startFrame = followsOn
          ? playbackCursorFrame
          : Math.ceil(Math.max(now + PLAYBACK_RESTART_LEAD_SECONDS, playbackCursorTime) * outputRate);
        // A hair after the sample, so rounding either way lands on it.
        const startAt = (startFrame + 0.000001) / outputRate;
        notePlaybackPiece(followsOn, playbackCursorTime - now, startAt - playbackCursorTime, outputCount / outputRate);
        playbackCursorFrame = startFrame + outputCount;
        const endAt = playbackCursorFrame / outputRate;
        const fadeStart = endAt - Math.min(PLAYBACK_FADE_SECONDS, outputCount / outputRate / 2);
        if (!(audioDebug && audioDebug.fadesOff)) {
          pieceGain.gain.setValueAtTime(1, fadeStart);
          pieceGain.gain.linearRampToValueAtTime(0, endAt);
        }
        source.start(startAt);
        playbackCursorTime = endAt;
        lastPlaybackPiece = { gain: pieceGain.gain, fadeStart, end: endAt };
        streamingPlaybackSources.add(source);
        source.onended = () => {
          streamingPlaybackSources.delete(source);
          try {
            pieceGain.disconnect();
          } catch {
            // ignored
          }
          if (!streamingPlaybackSources.size) {
            if (playbackHealth && playbackHealth.requestId) finishPlaybackHealth(false);
            resumeMicrophoneAfterPlayback();
          }
        };
      };

      if (audioDebug) {
        audioDebug.flush = () => {
          audioDebug.pendingTimer = null;
          const pieces = audioDebug.pending;
          audioDebug.pending = [];
          const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
          if (!total) return;
          const whole = new Float32Array(total);
          let offset = 0;
          for (const piece of pieces) {
            whole.set(piece, offset);
            offset += piece.length;
          }
          schedulePlaybackPiece(whole, audioDebug.pendingRate);
        };
      }

      const streamTranslateTurn = async ({
        audioBase64,
        languageA,
        languageB,
        voice,
        accessToken,
        retry,
        engine,
        onEvent
      }) => {
        const headers = { "Content-Type": "application/json" };
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }

        // Each way this can fail carries a `reason` for the turn report
        // (describeAttemptFailure): "network" (the request never got an
        // answer), "http-<status>", "server-error" (the server said it
        // failed), "stream-broken" (the answer stopped arriving midway; on
        // 2026-11-18 one did 4.8 s in, while the server went on to finish
        // the translation nobody heard).
        const withReason = (error, reason) => {
          if (error && typeof error === "object" && !error.reason && !isConversationResetError(error)) {
            error.reason = reason;
          }
          return error;
        };
        let response;
        try {
          response = await fetch("/api/translate-turn-stream", {
            method: "POST",
            headers,
            body: JSON.stringify({
              audioBase64,
              languageA,
              languageB,
              voice,
              lowLatencyAudio: false,
              // Why this recording is being translated a second time (numbers
              // only, for the server's log). Absent on a first attempt.
              ...(retry ? { retry } : {}),
              // "openai": Gemini already got this recording wrong twice (see
              // geminiFailedTwice), so the server goes straight to OpenAI.
              ...(engine ? { engine } : {})
            })
          });
        } catch (error) {
          throw withReason(error, "network");
        }

        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          let errorCode = "";
          let limitDetails = null;
          try {
            const data = await response.json();
            message = data?.error || message;
            if (typeof data?.code === "string") {
              errorCode = data.code;
            }
            limitDetails = siteAccess.limitDetailsIn(data);
          } catch {
            // ignore parse error
          }
          if (response.status === 401) {
            siteAccess.invite();
          }
          const requestError = new Error(message);
          if (errorCode) {
            requestError.code = errorCode;
          }
          if (limitDetails) {
            requestError.limit = limitDetails;
          } else {
            requestError.reason = `http-${response.status}`;
          }
          throw requestError;
        }

        if (!response.body) {
          throw new Error("Streaming response body is unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            let chunk;
            try {
              chunk = await reader.read();
            } catch (error) {
              throw withReason(error, "stream-broken");
            }
            const { done, value } = chunk;
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);
              if (line) {
                let event;
                try {
                  event = JSON.parse(line);
                } catch {
                  newlineIndex = buffer.indexOf("\n");
                  continue;
                }
                const maybeError = onEvent(event);
                if (maybeError instanceof Error) {
                  throw maybeError;
                }
              }
              newlineIndex = buffer.indexOf("\n");
            }
          }

          const tail = buffer.trim();
          if (!tail) return;
          try {
            const event = JSON.parse(tail);
            const maybeError = onEvent(event);
            if (maybeError instanceof Error) {
              throw maybeError;
            }
          } catch {
            // ignore malformed tail
          }
        } catch (error) {
          try {
            await reader.cancel();
          } catch {
            // ignored
          }
          throw error;
        }
      };

      const createResultCard = ({ languageA, languageB }) => {
        const cardId = ++cardIdCounter;
        const cardBeforeThisOne = newestCardId;
        newestCardId = cardId;
        if (messagesEmpty) messagesEmpty.classList.add("hidden");
        if (messagesList) messagesList.classList.remove("hidden");

        const wrapper = document.createElement("div");
        wrapper.className = "translator-message flex flex-col max-w-[85%] animate-in slide-in-from-bottom-2 fade-in duration-300 items-start is-left";

        const timeText = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        wrapper.innerHTML = `
          <div class="translator-status-row flex items-center gap-2 mb-2 text-xs ml-2">
            <span class="status-icon">${SPINNER_ICON_MUTED}</span>
            <span class="text-muted-foreground status-text">Recognizing speech...</span>
          </div>
          <div class="translator-message-bubble rounded-2xl px-5 py-4 shadow-sm relative group is-left bg-secondary rounded-bl-md">
            <div class="flex items-start justify-between gap-3">
              <p class="text-sm leading-relaxed flex-1 text-muted-foreground italic source-text vt-placeholder">Listening...</p>
              <button type="button" class="translator-correct-btn hidden" title="Correct the text" aria-label="Correct the text" style="flex:none;padding:0.375rem;margin:-0.25rem -0.375rem 0 0;border-radius:9999px;line-height:0;color:inherit;opacity:0.55"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>
            </div>
            <div class="translator-correct-editor hidden" style="margin-top:0.375rem">
              <textarea class="translator-correct-input" rows="1" maxlength="400" aria-label="Correct the text" style="display:block;width:100%;min-width:14rem;box-sizing:border-box;margin:0;padding:0.75rem 0.875rem;border:1px solid currentColor;border-radius:0.75rem;background:transparent;color:inherit;font:inherit;font-size:17px;line-height:1.5;resize:none;overflow:hidden;-webkit-appearance:none;appearance:none"></textarea>
              <div class="translator-correct-actions" style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.5rem">
                <button type="button" class="translator-correct-cancel" style="padding:0.375rem 0.75rem;border-radius:9999px;font-size:0.8125rem;color:inherit;opacity:0.7">Cancel</button>
                <button type="button" class="translator-correct-confirm" style="padding:0.375rem 0.875rem;border-radius:9999px;font-size:0.8125rem;font-weight:600;border:1px solid currentColor;color:inherit">Translate again</button>
              </div>
            </div>
            <div class="translator-translation-border mt-3 pt-3 border-t flex items-start justify-between gap-2 hidden is-left border-border/30">
              <p class="text-xs leading-relaxed flex-1 italic text-muted-foreground translated-text"></p>
              <button type="button" class="vt-show-btn hidden" title="${translateUiText("Full screen")}" aria-label="${translateUiText("Full screen")}" style="display:none">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" x2="14" y1="3" y2="10"></line><line x1="3" x2="10" y1="21" y2="14"></line></svg>
              </button>
              <button type="button" class="translator-play-btn flex-shrink-0 p-1.5 rounded-full transition-all hidden is-left bg-foreground/5 hover:bg-foreground/10 hover:ring-1 hover:ring-foreground/20 text-muted-foreground hover:text-foreground" title="Play translation">
                ${PLAY_ICON}
              </button>
            </div>
          </div>
          <button type="button" class="vt-retry-btn" style="display:none;align-items:center;gap:0.375rem;margin-top:0.5rem;padding:0.5rem 0.875rem;min-height:2.5rem;border-radius:9999px;border:1px solid currentColor;background:transparent;color:inherit;font-size:0.8125rem;line-height:1.2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path><path d="M21 3v5h-5"></path></svg>
            <span class="vt-retry-label">${renderPairLabelHtml("Retry", [languageA, languageB])}</span>
          </button>
          <span class="text-[10px] text-muted-foreground/60 mt-1.5 ml-2 hidden timestamp-text">${timeText}</span>
        `;

        if (messagesList) messagesList.prepend(wrapper);
        scrollToBottom();

        const statusRow = wrapper.querySelector(".translator-status-row");
        const statusIcon = wrapper.querySelector(".status-icon");
        const statusText = wrapper.querySelector(".status-text");
        const bubble = wrapper.querySelector(".translator-message-bubble");
        const sourceText = wrapper.querySelector(".source-text");
        const translationBorder = wrapper.querySelector(".translator-translation-border");
        const translatedText = wrapper.querySelector(".translated-text");
        const playBtn = wrapper.querySelector(".translator-play-btn");
        const showBtn = wrapper.querySelector(".vt-show-btn");
        const timestampText = wrapper.querySelector(".timestamp-text");
        const correctBtn = wrapper.querySelector(".translator-correct-btn");
        const correctEditor = wrapper.querySelector(".translator-correct-editor");
        const correctInput = wrapper.querySelector(".translator-correct-input");
        const correctCancel = wrapper.querySelector(".translator-correct-cancel");
        const correctConfirm = wrapper.querySelector(".translator-correct-confirm");
        const retryBtn = wrapper.querySelector(".vt-retry-btn");

        let replayUrl = "";
        let side = "left";
        let phase = "listening";
        // The sentence could not be translated (setFailure).
        let failed = false;
        let retryHandler = null;
        let cardAudio = null;
        let cardApi = null;
        // The translation is all in but its sound is still being read out:
        // the button keeps showing it playing until the sound ends.
        let soundTailTimer = null;
        const endSoundTail = () => {
          if (soundTailTimer) clearTimeout(soundTailTimer);
          soundTailTimer = null;
          streamingPlaybackStopListeners.delete(onSoundTailCut);
        };
        const onSoundTailCut = () => {
          endSoundTail();
          if (phase !== "result" || cardAudio) return;
          setPlayState(false);
        };

        const stopReplayAudio = () => {
          if (cardAudio) {
            cardAudio.pause();
            cardAudio.currentTime = 0;
            cardAudio = null;
          }
          if (playBtn) {
            playBtn.dataset.playing = "false";
            playBtn.innerHTML = PLAY_ICON;
            playBtn.classList.remove("is-playing");
          }
          if (bubble) {
            bubble.classList.remove("is-playing");
          }
          refreshPlayButton();
          if (currentReplayAudio && currentReplayAudio.paused) {
            currentReplayAudio = null;
          }
          resumeMicrophoneAfterPlayback();
        };

        const setPlayState = (isPlaying) => {
          if (!playBtn || !bubble) return;
          const nextState = isPlaying ? "true" : "false";
          // Redrawn only on a change, so the bars do not jump back to the start.
          if (playBtn.dataset.playing !== nextState) {
            playBtn.innerHTML = isPlaying ? PLAYING_ICON : PLAY_ICON;
          }
          playBtn.dataset.playing = nextState;
          playBtn.classList.toggle("is-playing", isPlaying);
          // No ring around the card while it plays: the bars in the button
          // already say so, and the ring was one more flash on the card.
          bubble.classList.toggle("is-playing", isPlaying);
          refreshPlayButton();
        };

        // The play button keeps its place from the moment the translation
        // row shows, instead of popping in and out: faded while there is
        // nothing to play yet, the sound bars while the translation is read
        // out, then the play sign. It is taken away only from a finished
        // card with no sound at all (an error, a failed translation).
        const refreshPlayButton = () => {
          if (!playBtn) return;
          const playing = playBtn.dataset.playing === "true";
          const shown =
            phase === "translating" ||
            phase === "playing" ||
            (phase === "result" && Boolean(replayUrl || soundTailTimer || cardAudio || playing));
          const ready = playing || (phase === "result" && Boolean(replayUrl));
          playBtn.classList.toggle("hidden", !shown);
          playBtn.style.opacity = ready ? "" : "0.35";
        };

        // The card is shown once it is known who is speaking, and from then
        // on it stays on that side. Until then the talk screen keeps it
        // hidden (the record button shows that it is working), so it never
        // appears on one side and then jumps to the other.
        let placed = false;
        // How sure the side is. What was heard decides for good. A side
        // taken from the translation alone (it may have come back in the
        // speaker's own language), or one shown only because nothing told
        // the two languages apart, can still be put right once, by better
        // evidence.
        const PLACED_BY_HEARD = 2;
        const PLACED_BY_TRANSLATION = 1;
        const PLACED_ANYWAY = 0;
        let placedBy = -1;
        const placeCard = (nextSide, by = PLACED_BY_HEARD) => {
          if (placed && by <= placedBy) return;
          const wasPlaced = placed;
          // A failed card shown in the middle (see setFailure) goes to a
          // side once a retry tells whose sentence it was.
          const wasCentered = wrapper.hasAttribute("data-vt-center");
          placed = true;
          placedBy = by;
          wrapper.removeAttribute("data-vt-center");
          if (!wasPlaced || wasCentered || nextSide !== side) applySide(nextSide);
          wrapper.removeAttribute("data-vt-unplaced");
          if (wasCentered) refreshCenterLook();
        };
        // The other language of the pair: the one a translation came from.
        const speakerSideFromTranslation = (text) => {
          const translationLanguage = detectLanguageFromText(text, languageA, languageB);
          if (!translationLanguage) return "";
          const spokenLanguage = translationLanguage === languageA ? languageB : languageA;
          return languageToSide(spokenLanguage, languageA, languageB);
        };

        const applySide = (nextSide) => {
          if (!wrapper || !bubble || !translationBorder || !translatedText || !playBtn || !statusRow || !timestampText) {
            return;
          }
          side = nextSide === "right" ? "right" : "left";
          if (cardId === newestCardId) {
            nextSpeakerSide = side === "left" ? "right" : "left";
          }
          const isLeft = side === "left";

          wrapper.className = `translator-message flex flex-col max-w-[85%] animate-in slide-in-from-bottom-2 fade-in duration-300 ${isLeft ? "items-start is-left" : "items-end ml-auto is-right"}`;
          statusRow.className = `translator-status-row flex items-center gap-2 mb-2 text-xs ${isLeft ? "ml-2" : "mr-2"}`;
          bubble.className = `translator-message-bubble rounded-2xl px-5 py-4 shadow-sm relative group ${isLeft ? "is-left bg-secondary rounded-bl-md" : "is-right bg-foreground text-background rounded-br-md"}`;
          translationBorder.className = `translator-translation-border mt-3 pt-3 border-t flex items-start justify-between gap-2 ${translationBorder.classList.contains("hidden") ? "hidden " : ""}${isLeft ? "is-left border-border/30" : "is-right border-white/20"}`;
          translatedText.className = `translated-text text-xs leading-relaxed flex-1 ${translatedText.classList.contains("italic") ? "italic " : ""}${translatedText.classList.contains("vt-placeholder") ? "vt-placeholder " : ""}${isLeft ? "text-muted-foreground" : "text-background/70"}`;
          playBtn.className = `translator-play-btn flex-shrink-0 p-1.5 rounded-full transition-all ${playBtn.classList.contains("hidden") ? "hidden " : ""}${playBtn.classList.contains("is-playing") ? "is-playing " : ""}${isLeft ? "is-left bg-foreground/5 hover:bg-foreground/10 hover:ring-1 hover:ring-foreground/20 text-muted-foreground hover:text-foreground" : "is-right hover:bg-white/20 text-background/60 hover:text-background"}`;
          timestampText.className = `timestamp-text text-[10px] text-muted-foreground/60 mt-1.5 ${timestampText.classList.contains("hidden") ? "hidden " : ""}${isLeft ? "ml-2" : "mr-2"}`;
        };

        if (playBtn) {
          playBtn.addEventListener("click", async () => {
            // While the translation is read out the first time (sound tail
            // included) the button only shows it playing: a replay would
            // play over it.
            if (!replayUrl || phase !== "result" || soundTailTimer) return;
            if (cardAudio) {
              stopReplayAudio();
              return;
            }
            noteCardSignal(cardApi, "replayed");
            if (currentReplayAudio && currentReplayAudio !== cardAudio) {
              currentReplayAudio.pause();
            }
            pauseMicrophoneForPlayback();
            const audio = new Audio(replayUrl);
            let replaySource = null;
            const disconnectReplaySource = () => {
              if (!replaySource) return;
              try {
                replaySource.disconnect();
              } catch {
                // ignored
              }
              replaySource = null;
            };
            // Push to Talk: the replay gets the same louder sound as the
            // first playback. The element then plays only through the
            // page's audio, so this is done only while that is running;
            // otherwise the replay plays as it is (it could stay silent
            // while the iPhone holds the page's audio paused).
            if (
              activeVoiceMode === "manual" &&
              mediaStream &&
              audioContext &&
              playbackGainNode &&
              audioContext.state === "running"
            ) {
              try {
                routePlayback();
                replaySource = audioContext.createMediaElementSource(audio);
                replaySource.connect(playbackGainNode);
              } catch {
                // Plays at the normal level instead.
              }
            }
            if (audioDebug) audioDebug.noteReplay(Boolean(replaySource));
            cardAudio = audio;
            currentReplayAudio = audio;
            setPlayState(true);
            try {
              await audio.play();
            } catch {
              disconnectReplaySource();
              stopReplayAudio();
              return;
            }
            // "pause" also covers the replay being stopped from outside: by
            // another card's replay, or by a new Push to Talk recording.
            const finishReplay = () => {
              disconnectReplaySource();
              // A quick stop-then-play may already have started a newer
              // replay on this card: leave its button alone.
              const ownsButton = cardAudio === audio || cardAudio === null;
              if (cardAudio === audio) {
                cardAudio = null;
              }
              if (currentReplayAudio === audio) {
                currentReplayAudio = null;
              }
              if (ownsButton) setPlayState(false);
              resumeMicrophoneAfterPlayback();
            };
            audio.addEventListener("ended", finishReplay);
            audio.addEventListener("pause", finishReplay);
          });
        }

        const setPhase = (nextPhase) => {
          // Sound off: nothing is playing, the card just goes on filling in.
          if (nextPhase === "playing" && soundIsOff()) nextPhase = "translating";
          const wasPlaying = phase === "playing";
          // Shown as done a second time (a notice, a written-down text):
          // the sound still being read out keeps its bars.
          const keepSoundTail = nextPhase === "result" && phase === "result" && Boolean(soundTailTimer);
          if (!keepSoundTail) endSoundTail();
          phase = nextPhase;
          if (nextPhase !== "result") closeCorrectEditor();
          refreshCorrectButton();
          refreshSourcePlaceholder();
          refreshShowButton();
          // The sentence is done and neither the heard words nor the
          // translation told whose it was (two languages in the same
          // letters, or only digits): it is shown where it is rather than
          // never at all.
          // A card left in the middle by a failure (setFailure) that is now
          // translated without telling whose it was goes to its guessed side.
          if (nextPhase === "result" && (!placed || (wrapper.hasAttribute("data-vt-center") && !failed))) {
            placeCard(side, PLACED_ANYWAY);
          }
          if (!statusRow || !statusIcon || !statusText || !translationBorder || !playBtn || !timestampText) return;

          if (nextPhase === "listening") {
            statusRow.classList.remove("hidden");
            statusIcon.innerHTML = SPINNER_ICON_MUTED;
            statusText.className = "text-muted-foreground status-text";
            statusText.textContent = "Recognizing speech...";
            translationBorder.classList.add("hidden");
            timestampText.classList.add("hidden");
            stopReplayAudio();
          } else if (nextPhase === "translating") {
            statusRow.classList.remove("hidden");
            statusIcon.innerHTML = SPINNER_ICON_ACCENT;
            statusText.className = "text-accent status-text";
            statusText.textContent = "Translating...";
            translationBorder.classList.remove("hidden");
            // Translated again after it started playing (or sound off): the
            // button no longer shows it playing, and there is nothing to
            // replay yet (it stays in its place, faded).
            if (!cardAudio) setPlayState(false);
            if (translatedText && !translatedText.textContent.trim()) {
              translatedText.textContent = "Translating...";
              translatedText.classList.add("italic");
              translatedText.classList.add("vt-placeholder");
            }
          } else if (nextPhase === "playing") {
            statusRow.classList.remove("hidden");
            statusIcon.innerHTML = VOLUME_ICON_ACCENT;
            statusText.className = "text-accent status-text";
            statusText.textContent = "Playing translation...";
            translationBorder.classList.remove("hidden");
            // The sound bars live in the play button, so it shows while the
            // translation is read out the first time too. A tap does nothing
            // until the sound can be replayed.
            setPlayState(true);
            translationBorder.classList.remove("border-t");
          } else if (nextPhase === "result") {
            statusRow.classList.add("hidden");
            translationBorder.classList.remove("hidden");
            translationBorder.classList.add("border-t");
            timestampText.classList.remove("hidden");
            const tailMs = wasPlaying ? streamingPlaybackRemainingMs() : 0;
            if (keepSoundTail) {
              // Still playing: left as it is.
            } else if (tailMs > 0) {
              setPlayState(true);
              soundTailTimer = setTimeout(onSoundTailCut, tailMs + 150);
              streamingPlaybackStopListeners.add(onSoundTailCut);
            } else {
              setPlayState(false);
            }
          }
          refreshPlayButton();
          scrollToBottom();
        };

        // Words kept on the card while the sentence is translated again (the
        // direct attempt failed): they shimmer until new words take their
        // place. Kept as attributes on the bubble, which applySide leaves
        // alone (it rewrites the classes).
        const setUpdatingPart = (part, on) => {
          if (bubble) bubble.toggleAttribute(`data-vt-updating-${part}`, Boolean(on));
        };
        const isUpdatingPart = (part) =>
          Boolean(bubble && bubble.hasAttribute(`data-vt-updating-${part}`));

        // The pencil follows the last word of the heard sentence. It rides
        // in one unbreakable piece with the last letter (a whole Thai
        // letter with its marks), so it never drops to a line of its own.
        const lastLetterOf = (text) => {
          try {
            const letters = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text));
            return letters.length ? letters[letters.length - 1].segment : "";
          } catch {
            return Array.from(text).pop() || "";
          }
        };
        const writeSourceText = (text) => {
          if (!correctBtn) {
            sourceText.textContent = text;
            return;
          }
          const last = lastLetterOf(text);
          sourceText.textContent = text.slice(0, text.length - last.length);
          const tail = document.createElement("span");
          tail.className = "translator-source-tail";
          tail.style.whiteSpace = "nowrap";
          tail.append(last, correctBtn);
          sourceText.append(tail);
        };
        const setSourceText = (text) => {
          if (!sourceText) return;
          const value = String(text || "").trim();
          setUpdatingPart("source", false);
          heardText = value;
          refreshCorrectButton();
          writeSourceText(value || "Listening...");
          refreshSourcePlaceholder();
          sourceText.classList.toggle("italic", !value);
          sourceText.classList.toggle("text-muted-foreground", !value);
          sourceText.classList.toggle("vt-placeholder", !value);
          if (value) {
            // Words that cannot be told apart yet (a few letters, digits,
            // punctuation) leave the card unplaced: it waits for more.
            const guessedLanguage = detectLanguageFromText(value, languageA, languageB);
            if (guessedLanguage) {
              placeCard(languageToSide(guessedLanguage, languageA, languageB));
            }
          }
          scrollToBottom();
        };

        // "Listening..." stands in for the heard words only while the speaker
        // is being recorded. Once the recording is over, a card whose heard
        // words never arrived shows the translation alone.
        const sourceRow = sourceText ? sourceText.parentElement : null;
        const refreshSourcePlaceholder = () => {
          // While the button is held and nothing has been heard yet, the
          // card has nothing to show: the phone view hides it and lets the
          // button's own animation say that it is listening.
          wrapper.toggleAttribute("data-vt-waiting", phase === "listening" && !heardText);
          if (!sourceRow) return;
          sourceRow.style.display = heardText || phase === "listening" ? "" : "none";
        };

        // Correcting what was heard: the speaker taps the pencil, fixes the
        // words, and the corrected sentence is translated and spoken again.
        let heardText = "";
        // The last correction failed: the same words may be sent again.
        let correctionFailed = false;
        const closeCorrectEditor = () => {
          if (correctEditor) correctEditor.classList.add("hidden");
          if (sourceText) sourceText.classList.remove("hidden");
        };
        // Full screen is offered once there is a translation to show.
        const refreshShowButton = () => {
          if (!showBtn || !translatedText) return;
          const ready =
            (phase === "result" || phase === "playing") &&
            !translatedText.classList.contains("vt-placeholder") &&
            Boolean(translatedText.textContent.trim());
          showBtn.classList.toggle("hidden", !ready);
        };
        const refreshCorrectButton = () => {
          if (!correctBtn) return;
          const editing = correctEditor && !correctEditor.classList.contains("hidden");
          const offered = phase === "result" && Boolean(heardText) && canCorrectHeardText() && !editing;
          correctBtn.classList.toggle("hidden", !offered);
        };
        // The box is as tall as its text: one line for a short sentence, and
        // it grows as lines are added, so nothing is cut off or cramped.
        const fitCorrectInput = () => {
          if (!correctInput) return;
          correctInput.style.height = "auto";
          const borders = correctInput.offsetHeight - correctInput.clientHeight;
          correctInput.style.height = `${correctInput.scrollHeight + borders}px`;
        };
        const openCorrectEditor = () => {
          if (!correctEditor || !correctInput || phase !== "result" || !canCorrectHeardText()) return;
          correctInput.value = heardText;
          correctEditor.classList.remove("hidden");
          if (sourceText) sourceText.classList.add("hidden");
          refreshCorrectButton();
          fitCorrectInput();
          correctInput.focus();
          correctInput.setSelectionRange(correctInput.value.length, correctInput.value.length);
          scrollToBottom();
        };
        const submitCorrection = () => {
          const value = correctInput ? correctInput.value.trim() : "";
          // Another sentence is being recorded or translated: keep the
          // editor open so the typed words are not lost.
          if (isRecording || processing) return;
          closeCorrectEditor();
          refreshCorrectButton();
          if (!value || (value === heardText && !correctionFailed)) return;
          noteCardSignal(cardApi, "corrected");
          // What the card says from now on is the corrected sentence, not
          // the spoken one the report is about.
          cardReportIds.delete(cardApi);
          void correctHeardText(cardApi, value, { languageA, languageB });
        };
        if (correctBtn) correctBtn.addEventListener("click", openCorrectEditor);
        if (correctCancel) {
          correctCancel.addEventListener("click", () => {
            closeCorrectEditor();
            refreshCorrectButton();
          });
        }
        if (correctConfirm) correctConfirm.addEventListener("click", submitCorrection);
        if (correctInput) {
          correctInput.addEventListener("input", fitCorrectInput);
          correctInput.addEventListener("keydown", (event) => {
            // Enter sends (as in a chat box), Shift+Enter makes a new line.
            // Not while an input method is still composing a word.
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
              event.preventDefault();
              submitCorrection();
            } else if (event.key === "Escape") {
              closeCorrectEditor();
              refreshCorrectButton();
            }
          });
        }
        const markCorrected = () => {
          if (timestampText && !timestampText.dataset.corrected) {
            timestampText.dataset.corrected = "true";
            timestampText.textContent = `${timestampText.textContent} · ${translateUiText("Corrected")}`;
          }
        };

        const setTranslatedText = (text) => {
          if (!translatedText) return;
          const value = String(text || "");
          setUpdatingPart("translation", false);
          translatedText.textContent = value;
          translatedText.classList.toggle("italic", !value.trim());
          translatedText.classList.remove("vt-placeholder");
          // The translation arrived before what was heard: it tells who is
          // speaking too (a Thai translation means the Chinese speaker).
          if (!placed && value.trim()) {
            const speakerSide = speakerSideFromTranslation(value);
            if (speakerSide) placeCard(speakerSide, PLACED_BY_TRANSLATION);
          }
          refreshShowButton();
          scrollToBottom();
        };

        const setReplayUrl = (url) => {
          if (replayUrl) {
            URL.revokeObjectURL(replayUrl);
          }
          replayUrl = url || "";
          refreshPlayButton();
        };

        const setError = (message) => {
          if (!statusRow || !statusIcon || !statusText || !translationBorder) return;
          // A message is shown even when no one's words came: on the side
          // the card already has.
          placeCard(side, PLACED_ANYWAY);
          statusRow.classList.remove("hidden");
          statusIcon.innerHTML = `
            <svg class="h-3 w-3 text-red-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" x2="12" y1="8" y2="12"></line>
              <line x1="12" x2="12.01" y1="16" y2="16"></line>
            </svg>
          `;
          statusText.className = "text-red-500 status-text is-error";
          statusText.textContent = message || "Translation failed.";
          translationBorder.classList.remove("hidden");
        };

        // A notice for whoever reads this card, in both of its languages.
        const setNotice = (message) => {
          setError(message);
          if (statusText && PAIR_NOTICE_TEXT[message]) {
            statusText.innerHTML = renderPairNoticeHtml(message, [languageA, languageB]);
          }
        };

        // This sentence could not be translated (no connection, a server
        // error): a notice in both languages takes the translation's place,
        // never the error itself, and a Retry button sends the same sentence
        // again when `onRetry` is given. A card for which no words were
        // heard belongs to neither person: it sits in the middle, without a
        // bubble, until a retry tells whose sentence it was.
        const setFailure = (message, { onRetry = null } = {}) => {
          failed = false;
          setPhase("result");
          // Before the card is put in the middle: setNotice places a card
          // that has no side yet.
          setNotice(message);
          const centered = !heardText;
          if (centered) {
            const guessedSide = side;
            // The look of the left side (grey, not the black of the right).
            applySide("left");
            side = guessedSide;
            placedBy = -1;
            wrapper.setAttribute("data-vt-center", "");
            // The guess for the next sentence stays as it was before it.
            if (cardId === newestCardId) nextSpeakerSide = guessBeforeThisCard;
          }
          failed = true;
          wrapper.setAttribute("data-vt-failed", "");
          if (translationBorder) translationBorder.classList.add("hidden");
          if (bubble) bubble.style.display = centered ? "none" : "";
          if (timestampText) timestampText.classList.toggle("hidden", centered);
          retryHandler = typeof onRetry === "function" ? onRetry : null;
          if (retryBtn) retryBtn.style.display = retryHandler ? "inline-flex" : "none";
          refreshCenterLook();
          refreshPlayButton();
          scrollToBottom();
        };
        // A retry has started: the card waits for the translation again.
        const clearFailure = () => {
          if (!failed) return;
          failed = false;
          retryHandler = null;
          wrapper.removeAttribute("data-vt-failed");
          if (retryBtn) retryBtn.style.display = "none";
          if (bubble) bubble.style.display = "";
          if (translatedText) translatedText.textContent = "";
          refreshCenterLook();
        };
        // In the middle: neither person's side. While it shows a failure, a
        // dashed outline holds the notice and the Retry button together.
        // Inline styles: talk-mode.css is only loaded on phones, and
        // applySide rewrites the classes.
        function refreshCenterLook() {
          const centered = wrapper.hasAttribute("data-vt-center");
          const box = centered && failed;
          wrapper.style.marginLeft = centered ? "auto" : "";
          wrapper.style.marginRight = centered ? "auto" : "";
          wrapper.style.width = centered ? "fit-content" : "";
          wrapper.style.alignItems = centered ? "center" : "";
          wrapper.style.textAlign = centered ? "center" : "";
          // Chinese and Japanese break only between phrases, so 「重试」 is
          // never split across two lines.
          wrapper.style.wordBreak = centered ? "keep-all" : "";
          wrapper.style.border = box ? "1px dashed color-mix(in srgb, #ef4444 45%, transparent)" : "";
          wrapper.style.borderRadius = box ? "0.875rem" : "";
          wrapper.style.padding = box ? "0.625rem 0.875rem" : "";
          if (statusRow) {
            statusRow.style.justifyContent = centered ? "center" : "";
            statusRow.style.marginLeft = centered ? "0" : "";
            statusRow.style.marginRight = centered ? "0" : "";
            statusRow.style.marginBottom = box ? "0" : "";
          }
        }
        if (retryBtn) {
          retryBtn.addEventListener("click", () => {
            // Another sentence is being recorded or translated: the button
            // stays, for later.
            if (!retryHandler || isRecording || processing || tapStartActive || keyboardHoldActive) return;
            noteCardSignal(cardApi, "retried");
            void retryHandler();
          });
        }

        const dispose = () => {
          endSoundTail();
          stopReplayAudio();
          if (replayUrl) {
            URL.revokeObjectURL(replayUrl);
            replayUrl = "";
          }
          wrapper.remove();
          if (cardApi) {
            messageCards.delete(cardApi);
          }
          // A card thrown away (a press too short to count, a noise) leaves
          // the guess for the next sentence as it found it, and hands the
          // guess back to the card before it.
          if (cardId === newestCardId) {
            nextSpeakerSide = guessBeforeThisCard;
            newestCardId = cardBeforeThisOne;
          }
        };

        const guessBeforeThisCard = nextSpeakerSide;
        applySide(nextSpeakerSide);
        wrapper.setAttribute("data-vt-unplaced", "");
        setPhase("listening");

        cardApi = {
          element: wrapper,
          setPhase,
          setSourceText,
          getHeardText: () => heardText,
          setTranslatedText,
          // What is on the card now only stands in: it shimmers until
          // setSourceText / setTranslatedText put new words in its place.
          markUpdating: () => {
            setUpdatingPart("source", Boolean(heardText));
            const shownTranslation =
              translatedText && !translatedText.classList.contains("vt-placeholder")
                ? translatedText.textContent.trim()
                : "";
            setUpdatingPart("translation", Boolean(shownTranslation));
          },
          // Nothing new came for a part that was standing in: it is taken
          // away rather than left as if it were the final words (the direct
          // attempt may have heard half the sentence).
          dropUpdating: () => {
            if (isUpdatingPart("source")) setSourceText("");
            if (isUpdatingPart("translation")) setTranslatedText("");
          },
          isUpdating: () => isUpdatingPart("source") || isUpdatingPart("translation"),
          setReplayUrl,
          setError,
          setNotice,
          setFailure,
          clearFailure,
          markCorrected,
          setCorrectionFailed: (failed) => {
            correctionFailed = Boolean(failed);
          },
          dispose
        };
        messageCards.add(cardApi);
        return cardApi;
      };

      const parseApiErrorResponse = async (response) => {
        let message = `HTTP ${response.status}`;
        let errorCode = "";
        let limitDetails = null;

        try {
          const data = await response.json();
          message = data?.error || data?.message || message;
          if (typeof data?.code === "string") {
            errorCode = data.code;
          }
          limitDetails = siteAccess.limitDetailsIn(data);
        } catch {
          // ignored
        }

        return {
          message,
          errorCode,
          limitDetails
        };
      };

      // Hands what a server answer says about limits to the site. True when
      // the person has reached theirs.
      const noteLimitDetails = (details) => {
        if (siteAccess.isLimit(details)) {
          siteAccess.showLimit(details);
          return true;
        }
        if (details && typeof details === "object" && !Array.isArray(details)) {
          siteAccess.noteAllowance(details);
        }
        return false;
      };

      const getFirstTextValue = (...values) => {
        for (const value of values) {
          const text = String(value || "").trim();
          if (text) {
            return text;
          }
        }
        return "";
      };

      const extractInputTranscriptText = (event) => {
        return getFirstTextValue(
          event?.transcript,
          event?.text,
          event?.item?.content?.[0]?.transcript,
          event?.item?.content?.[0]?.text,
          event?.item?.input_audio_transcription?.text,
          event?.transcription?.text
        );
      };

      const setAutoModeState = (nextState) => {
        autoModeState = nextState;
        syncVoiceModeUi();
      };

      const buildAutoAudioFrame = (monoChunk) => {
        const input = monoChunk instanceof Float32Array ? monoChunk : new Float32Array(monoChunk);
        const downsampled = downsampleFloat32(input, inputSampleRate, 24000);
        const pcm = floatTo16BitPCM(downsampled);
        return {
          base64: arrayBufferToBase64(pcm.buffer),
          durationMs: (pcm.length / 24000) * 1000,
          rms: calculateFloat32Rms(downsampled)
        };
      };

      // --- Wrong-language check -----------------------------------------------
      // Now and then the model answers in a language outside the chosen pair,
      // or repeats the sentence untranslated. translation-language.js spots
      // that from the text; such an answer is cut off and made once more.
      // Until the file has loaded, translations are shown as they come.
      const TRANSLATION_LANGUAGE_SCRIPT_URL = "/voice-translator/translation-language.js";
      if (!window.LiveTalkTranslationLanguage) {
        const script = document.createElement("script");
        script.src = TRANSLATION_LANGUAGE_SCRIPT_URL;
        script.async = true;
        document.head.appendChild(script);
      }

      // Also an answer far shorter than what was heard (most of the sentence
      // left out), unless its text is missing or stopped halfway: then its
      // length says nothing, and the spoken audio is written down instead.
      const translationCameOutWrong = ({
        sourceText,
        translatedText,
        languageA,
        languageB,
        textMissing = false,
        textIncomplete = false,
        translatedTextIncomplete = false
      }) => {
        const checker = window.LiveTalkTranslationLanguage;
        if (!checker) return false;
        try {
          return checker.isWrongLanguage({
            sourceText,
            translatedText,
            languageA,
            languageB,
            translationIncomplete: Boolean(textMissing || textIncomplete || translatedTextIncomplete)
          });
        } catch (error) {
          // A broken check must never cost a good translation.
          console.warn("Translation language check failed.", error);
          return false;
        }
      };

      // What the card says under an answer still thrown away after the
      // retries: one that left most of the sentence out was translated, in
      // part, so "not translated" would be wrong.
      const wrongAnswerNotice = ({ sourceText, translatedText, languageA, languageB }) => {
        try {
          const checker = window.LiveTalkTranslationLanguage;
          if (
            checker &&
            checker.checkTranslationLanguage({ sourceText, translatedText, languageA, languageB }) ===
              "much-shorter"
          ) {
            return "Only part of this one was translated. Please say it again.";
          }
        } catch {
          // The plainer notice below.
        }
        return "This one was not translated. Please say it again.";
      };

      // A button held with nothing said: the recording is as quiet as an
      // idle microphone. Sent off anyway, it comes back with a made-up
      // sentence, so it is not sent.
      // The first `settlingChunks` were taken while a just-opened microphone
      // was still settling, and do not count as sound.
      const recordingIsSilent = (chunks, sampleRate, settlingChunks = 0) => {
        const checker = window.LiveTalkTranslationLanguage;
        if (!checker || !checker.recordingHasSound || !sampleRate) return false;
        try {
          return !checker.recordingHasSound(
            chunks.map((chunk, index) => ({
              rms: calculateFloat32Rms(chunk),
              durationMs: (chunk.length / sampleRate) * 1000,
              settling: index < settlingChunks
            }))
          );
        } catch (error) {
          // A broken check must never cost a spoken sentence.
          console.warn("Silence check failed.", error);
          return false;
        }
      };

      // For the turn report (see sendTurnReport): where the voice fell quiet
      // in a recording, to work out from real use how much sooner a
      // translation could start if Gemini were told the turn is over once
      // the speaker has been quiet for SPEECH_PAUSE_MS, and how many answers
      // started that way would have been thrown away because they carried
      // on. The loudness of every frame is kept too (RMS x 10000, as in
      // test/fixtures/real-mic-levels.json), so that other lengths of quiet
      // or another loudness can be tried on the same turns later.
      // A recording ends at the last frame the page received, which can be
      // up to one frame (about 85 ms) before the button was let go.
      const SPEECH_PAUSE_MS = 300;
      const SPEECH_LEVELS_MAX = 720;
      const describeRecordingSpeech = (chunks, sampleRate, settlingChunks = 0) => {
        if (!sampleRate || !chunks.length) return null;
        try {
          const frames = chunks.map((chunk, index) => ({
            rms: calculateFloat32Rms(chunk),
            durationMs: (chunk.length / sampleRate) * 1000,
            settling: index < settlingChunks
          }));
          const checker = window.LiveTalkTranslationLanguage;
          const pauses = checker?.describeSpeechPauses
            ? checker.describeSpeechPauses(frames, SPEECH_PAUSE_MS)
            : null;
          const kept = frames.slice(-SPEECH_LEVELS_MAX);
          return {
            frameMs: Math.round(frames[0].durationMs * 10) / 10,
            settlingFrames: settlingChunks,
            levelsSkipped: frames.length - kept.length,
            levels: kept.map((frame) => Math.min(10000, Math.round(frame.rms * 10000))),
            pauseMs: SPEECH_PAUSE_MS,
            ...(pauses || {})
          };
        } catch (error) {
          console.warn("Speech timing failed.", error);
          return null;
        }
      };

      // What was "heard" is plainly a sentence in some language outside the
      // chosen pair, or neither the heard words nor the translation hold any
      // of the pair's writing: the speech was too quiet to make out (or there
      // was none), and the words were made up.
      // `recordingSeconds`, when known: a translation far longer than anything
      // said in that time is made up too (a 0.5 s press came back as 3.4 s of
      // speech; see isTooLongForRecording).
      const heardTextIsMadeUp = ({ sourceText, translatedText, languageA, languageB, recordingSeconds = 0 }) => {
        const checker = window.LiveTalkTranslationLanguage;
        if (!checker || !checker.isHeardTextOutsidePair) return false;
        try {
          return (
            checker.isHeardTextOutsidePair({ sourceText, languageA, languageB }) ||
            Boolean(
              checker.isTurnOutsidePair &&
                checker.isTurnOutsidePair({ sourceText, translatedText, languageA, languageB })
            ) ||
            Boolean(
              checker.isTooLongForRecording &&
                checker.isTooLongForRecording({ translatedText, recordingSeconds })
            )
          );
        } catch (error) {
          console.warn("Heard-text check failed.", error);
          return false;
        }
      };

      // A narrower form of the first check above, for words still coming in:
      // what has been heard so far is plainly in a language outside the pair.
      // Replayed over every first few letters of 1,898 saved turns of real
      // Chinese and Thai speech on 2026-11-17: none was judged so before its
      // end was.
      const heardSoFarIsMadeUp = ({ sourceText, languageA, languageB }) => {
        const checker = window.LiveTalkTranslationLanguage;
        if (!checker || !checker.isHeardSoFarOutsidePair) return false;
        try {
          return checker.isHeardSoFarOutsidePair({ sourceText, languageA, languageB });
        } catch (error) {
          console.warn("Heard-text check failed.", error);
          return false;
        }
      };

      // How many letters of each kind of writing a text holds.
      const countWriting = (text) => {
        const counts = { han: 0, thai: 0, latin: 0, other: 0 };
        for (const character of String(text || "").normalize("NFC")) {
          if (/[\s\p{P}\p{N}]/u.test(character)) continue;
          if (/\p{Script=Han}/u.test(character)) counts.han += 1;
          else if (/\p{Script=Thai}/u.test(character)) counts.thai += 1;
          else if (/\p{Script=Latin}/u.test(character)) counts.latin += 1;
          else counts.other += 1;
        }
        return counts;
      };

      // A note for the server's log on why a translation was thrown away and
      // asked for again: which check said so, and the numbers it went by. No
      // words are sent, only counts.
      const describeRejectedTranslation = ({ outcome, cutShort, viaDirect, languageA, languageB }) => {
        let verdict = "";
        try {
          const checker = window.LiveTalkTranslationLanguage;
          if (checker && typeof checker.checkTranslationLanguage === "function") {
            verdict = checker.checkTranslationLanguage({
              sourceText: outcome.sourceText,
              translatedText: outcome.translatedText,
              languageA,
              languageB,
              translationIncomplete: Boolean(outcome.textMissing || outcome.textIncomplete)
            });
          }
        } catch {
          // The note is only for the log.
        }
        const audioBytes = (outcome.audioChunks || []).reduce((sum, chunk) => sum + chunk.length, 0);
        // An answer stopped halfway was seen to be untranslated from its first
        // words; what is left of it may be too short for the check above.
        let reason = "wrong-language";
        if (cutShort) reason = "cut-short";
        else if (outcome.stoppedEarly) reason = "not-translated";
        else if (
          verdict === "third-language" ||
          verdict === "not-translated" ||
          verdict === "partly-translated" ||
          verdict === "much-shorter"
        ) {
          reason = verdict;
        }
        return {
          reason,
          stoppedEarly: Boolean(outcome.stoppedEarly),
          path: viaDirect ? "direct" : "server",
          // 24 kHz, 16-bit.
          outputSeconds: Math.round((audioBytes / 48000) * 100) / 100,
          translated: countWriting(outcome.translatedText),
          heard: countWriting(outcome.sourceText)
        };
      };

      // The same check while the translation is still arriving: once the first
      // words show that the sentence is being said back untranslated, the
      // answer is stopped there and made again, instead of being shown and
      // read out to the end first.
      const translationNotTranslatedSoFar = ({ sourceText, translatedText, languageA, languageB }) => {
        const checker = window.LiveTalkTranslationLanguage;
        if (!checker || typeof checker.isNotTranslatedSoFar !== "function") return false;
        try {
          return checker.isNotTranslatedSoFar({ sourceText, translatedText, languageA, languageB });
        } catch (error) {
          console.warn("Translation language check failed.", error);
          return false;
        }
      };

      // --- Auto Detect: hands-free translation --------------------------------
      // gemini-handsfree.js keeps the microphone open, decides where each
      // sentence starts and ends, and sends it on its own to a fresh session,
      // so there is no conversation history for the model to drift on.

      const loadGeminiHandsFreeModule = () => {
        if (window.LiveTalkGeminiHandsFree) {
          return Promise.resolve(window.LiveTalkGeminiHandsFree);
        }
        if (!geminiHandsFreeModulePromise) {
          geminiHandsFreeModulePromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = GEMINI_HANDSFREE_SCRIPT_URL;
            script.async = true;
            script.onload = () => {
              if (window.LiveTalkGeminiHandsFree) {
                resolve(window.LiveTalkGeminiHandsFree);
              } else {
                reject(new Error("Hands-free translation module did not load."));
              }
            };
            script.onerror = () => reject(new Error("Hands-free translation module failed to load."));
            document.head.appendChild(script);
          }).catch((error) => {
            geminiHandsFreeModulePromise = null;
            throw error;
          });
        }
        return geminiHandsFreeModulePromise;
      };

      const refreshAutoModeState = () => {
        window.clearTimeout(autoStateTimer);
        autoStateTimer = null;
        if (!autoModeEnabled || !autoConversation) return;

        const nextState = autoConversation.isTranslating()
          ? "translating"
          : autoConversation.isHearing()
            ? "capturing"
            : "standby";
        setRecordingVisualState(nextState === "capturing");
        if (nextState !== autoModeState) {
          setAutoModeState(nextState);
        }
        if (nextState === "translating") {
          // Playback ends on a timer inside the module, without an event.
          autoStateTimer = window.setTimeout(refreshAutoModeState, 250);
        }
      };

      // Leaves the card of an unfinished turn in a sensible state.
      const releaseAutoCurrentTurn = () => {
        const turn = autoCurrentTurn;
        autoCurrentTurn = null;
        if (!turn || !turn.card) return;
        if (String(turn.text || "").trim()) {
          turn.card.setPhase("result");
          turn.card.setNotice("Stopped before this translation finished.");
        } else {
          turn.card.dispose();
        }
      };

      const stopAutoListening = async ({ idleMode = "", keepPlayback = false } = {}) => {
        autoStartToken += 1;
        autoModeEnabled = false;
        autoModeState = "off";
        window.clearTimeout(autoStateTimer);
        autoStateTimer = null;

        const conversation = autoConversation;
        autoConversation = null;
        if (conversation) {
          conversation.stop();
        }
        if (!keepPlayback) {
          stopStreamingPlayback();
        }
        releaseAutoCurrentTurn();

        setRecordingVisualState(false);
        releaseMicrophoneStream();
        setIdleInstructionMode(
          idleMode ||
            (micPermissionStatus === MIC_PERMISSION_STATES.GRANTED
              ? "permission-granted"
              : "default")
        );
        syncVoiceModeUi();
      };

      const handleAutoModeError = (error) => {
        const limitReached = noteLimitDetails(
          error && typeof error === "object" ? error.limit : null
        );
        const statusCode = Number(error?.statusCode) || 0;
        const unavailable = statusCode === 404 || error?.code === "GEMINI_DIRECT_UNAVAILABLE";

        if (statusCode === 401) {
          siteAccess.invite();
        }
        if (unavailable) {
          // Auto Detect is not offered here: go back to Push to Talk.
          autoVoiceModeServerDenied = true;
          autoVoiceModeAccessAllowed = false;
          activeVoiceMode = "manual";
        }
        void stopAutoListening({
          idleMode: limitReached || unavailable || statusCode === 401 ? "" : "auto-error"
        });
      };

      const requestAutoConversationLease = async ({ conversationToken, languageA, languageB }) => {
        try {
          return await requestGeminiDirectLease({ languageA, languageB });
        } catch (error) {
          const statusCode = Number(error?.statusCode) || 0;
          const fatal =
            statusCode === 401 ||
            statusCode === 404 ||
            error?.code === "GEMINI_DIRECT_UNAVAILABLE" ||
            siteAccess.isLimit(error?.limit);
          // Retrying cannot help here, so stop instead of waiting for the
          // module to give up.
          if (fatal && conversationToken === autoStartToken && autoModeEnabled) {
            handleAutoModeError(error);
          }
          throw error;
        }
      };

      const startAutoConversation = (handsFree) => {
        const conversationToken = autoStartToken;
        const languageA = leftLang.name;
        const languageB = rightLang.name;
        const isCurrent = () => conversationToken === autoStartToken && autoModeEnabled;

        const conversation = handsFree.createConversation({
          requestLease: () =>
            requestAutoConversationLease({ conversationToken, languageA, languageB }),
          // An answer in the wrong language is thrown away and asked for again.
          isWrongAnswer: (result) =>
            !result.noSpeech &&
            translationCameOutWrong({
              sourceText: result.sourceText,
              translatedText: result.translatedText,
              languageA,
              languageB,
              translatedTextIncomplete: result.translatedTextIncomplete
            }),
          isWrongSoFar: ({ sourceText, translatedText }) =>
            translationNotTranslatedSoFar({ sourceText, translatedText, languageA, languageB }),
          handlers: {
            onHearingChange: () => {
              if (isCurrent()) refreshAutoModeState();
            },
            onSourceText: (turn, text) => {
              if (isCurrent() && turn.card) turn.card.setSourceText(text);
            },
            onTurnStart: (turn) => {
              if (!isCurrent()) return;
              releaseAutoCurrentTurn();
              turn.text = "";
              turn.audioChunks = [];
              turn.card = createResultCard({ languageA, languageB });
              turn.card.setPhase("translating");
              autoCurrentTurn = turn;
              refreshAutoModeState();
            },
            onTranslatedTextDelta: (turn, delta) => {
              if (!isCurrent() || !turn.card) return;
              turn.text += delta;
              turn.card.setTranslatedText(turn.text);
            },
            onAudioDelta: (turn, base64Chunk) => {
              if (!isCurrent() || !turn.card) return;
              const chunk = base64ToUint8Array(base64Chunk);
              if (!chunk.length) return;
              const firstChunk = !turn.audioChunks.length;
              turn.audioChunks.push(chunk);
              if (firstChunk) {
                turn.card.setPhase("playing");
                updateRecordingInstructions();
              }
              enqueuePcm16Base64Chunk(base64Chunk, 24000);
            },
            onTurnRetry: (turn, rejected) => {
              // The first answer came without audio, or (`rejected`) in the
              // wrong language; a second one follows.
              turn.text = "";
              if (!rejected) return;
              // Thrown away, but it was produced: count it.
              void settleGeminiLease({
                leaseId: rejected.leaseId,
                languageA,
                languageB,
                usage: rejected
              }).then((limitReached) => {
                if (limitReached && isCurrent()) {
                  void stopAutoListening();
                }
              });
              if (!isCurrent() || !turn.card) return;
              console.warn("Translation came out in the wrong language, translating again.", {
                languageA,
                languageB,
                translatedText: rejected.translatedText
              });
              stopStreamingPlayback();
              turn.audioChunks = [];
              turn.card.setTranslatedText("");
              turn.card.setPhase("translating");
              refreshAutoModeState();
            },
            onTurnEnd: (turn, result) => {
              void settleGeminiLease({
                leaseId: result.leaseId,
                languageA,
                languageB,
                usage: result
              }).then((limitReached) => {
                if (limitReached && isCurrent()) {
                  // This answer was already made: let it finish playing.
                  void stopAutoListening({ keepPlayback: true });
                }
              });
              if (!isCurrent() || !turn.card) return;
              if (autoCurrentTurn === turn) autoCurrentTurn = null;
              if (result.noSpeech) {
                // A noise, not a sentence: nothing to show.
                turn.card.dispose();
                refreshAutoModeState();
                return;
              }
              if (result.sourceText) turn.card.setSourceText(result.sourceText);
              const shownTranslation = result.translatedText || turn.text;
              turn.card.setTranslatedText(shownTranslation);
              if (turn.audioChunks.length > 0) {
                const replayBlob = pcm16BytesToWavBlob(concatUint8Arrays(turn.audioChunks));
                turn.card.setReplayUrl(URL.createObjectURL(replayBlob));
              }
              turn.card.setPhase("result");
              if (
                translationCameOutWrong({
                  sourceText: result.sourceText,
                  translatedText: shownTranslation,
                  languageA,
                  languageB,
                  translatedTextIncomplete: result.translatedTextIncomplete
                })
              ) {
                // Wrong again on the second try (or it could not be retried).
                turn.card.setNotice(
                  wrongAnswerNotice({ sourceText: result.sourceText, translatedText: shownTranslation, languageA, languageB })
                );
              } else if (result.noAudio) {
                // No audio and, once stray markers are removed, no text either:
                // there is nothing to read.
                turn.card.setNotice(
                  shownTranslation
                    ? "This one was not read aloud. Please read the text."
                    : "This one was not translated. Please say it again."
                );
              } else if (!shownTranslation.trim() || result.translatedTextIncomplete) {
                // The translation was spoken in full; only its text is
                // missing or stops halfway.
                turn.card.setNotice(
                  shownTranslation.trim()
                    ? "The text is incomplete. Please listen to the translation."
                    : "This one has no text. Please listen to the translation."
                );
              }
              refreshAutoModeState();
            },
            onTurnError: (turn, error) => {
              if (error && error.audioStarted) {
                // Part of the translation was already heard, so it is charged.
                void settleGeminiLease({
                  leaseId: error.leaseId,
                  languageA,
                  languageB,
                  usage: error.usage,
                  status: "error",
                  errorCode: error.message
                });
              }
              if (!isCurrent() || !turn.card) return;
              if (autoCurrentTurn === turn) autoCurrentTurn = null;
              // Nothing arrived (or it was thrown away): no "Translating..." left behind.
              if (!String(turn.text || "").trim()) turn.card.setTranslatedText("");
              turn.card.setPhase("result");
              turn.card.setNotice("This one was not translated. Please say it again.");
              refreshAutoModeState();
            },
            onTurnEmpty: (turn) => {
              // It was a noise, not a sentence: nothing to show.
              if (!isCurrent()) return;
              if (autoCurrentTurn === turn) autoCurrentTurn = null;
              if (turn.card) turn.card.dispose();
              refreshAutoModeState();
            },
            onTurnInterrupted: (turn) => {
              // The speaker carried on: drop the early answer, a new one follows.
              if (!isCurrent()) return;
              stopStreamingPlayback();
              if (autoCurrentTurn === turn) autoCurrentTurn = null;
              if (turn.card) turn.card.dispose();
              refreshAutoModeState();
            },
            onError: (error) => {
              if (isCurrent()) handleAutoModeError(error);
            }
          }
        });

        autoConversation = conversation;
        conversation.start();
        refreshAutoModeState();
      };

      // New languages need new sessions; the microphone stays open.
      const resetAutoSessionForSettingsChange = () => {
        if (!autoModeEnabled || !window.LiveTalkGeminiHandsFree) return;
        const previous = autoConversation;
        autoConversation = null;
        autoStartToken += 1;
        if (previous) {
          previous.stop();
        }
        stopStreamingPlayback();
        releaseAutoCurrentTurn();
        startAutoConversation(window.LiveTalkGeminiHandsFree);
      };

      const loadSpeechDetectorModule = () => {
        if (window.LiveTalkSpeechDetector) {
          return Promise.resolve(window.LiveTalkSpeechDetector);
        }
        if (!speechDetectorModulePromise) {
          speechDetectorModulePromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = SPEECH_DETECTOR_SCRIPT_URL;
            script.async = true;
            script.onload = () => {
              if (window.LiveTalkSpeechDetector) {
                resolve(window.LiveTalkSpeechDetector);
              } else {
                reject(new Error("Speech detection module did not load."));
              }
            };
            script.onerror = () => reject(new Error("Speech detection module failed to load."));
            document.head.appendChild(script);
          }).catch((error) => {
            speechDetectorModulePromise = null;
            throw error;
          });
        }
        return speechDetectorModulePromise;
      };

      // Gets the speech detector ready, waiting a few seconds at most (the
      // first time, its engine has to be downloaded). If it is not ready by
      // then, or cannot be loaded at all, Auto Detect starts without it and
      // judges by loudness; a detector that becomes ready later is used
      // from then on.
      const prepareSpeechDetector = async () => {
        try {
          const detectorModule = await loadSpeechDetectorModule();
          if (!autoSpeechDetector) {
            autoSpeechDetector = detectorModule.createDetector();
          }
          const detector = autoSpeechDetector;
          await Promise.race([
            detector.load().catch((error) => {
              console.warn("Speech detection is not available; judging by loudness.", error);
            }),
            new Promise((resolve) => window.setTimeout(resolve, SPEECH_DETECTOR_WAIT_MS))
          ]);
          if (detector.isReady()) {
            detector.reset();
          }
        } catch (error) {
          console.warn("Speech detection is not available; judging by loudness.", error);
        }
      };

      const handleAutoAudioFrame = (monoChunk) => {
        if (activeVoiceMode !== "auto" || !autoModeEnabled || !autoConversation || !autoMicReady) {
          return;
        }
        const frame = buildAutoAudioFrame(monoChunk);
        if (!frame.base64 || !frame.durationMs) {
          return;
        }
        const conversation = autoConversation;
        const detector = autoSpeechDetector;
        if (!detector || !detector.isReady()) {
          conversation.pushAudio(frame.base64, frame.durationMs, frame.rms);
          return;
        }
        // The detector answers in order, so the frames stay in order too.
        void detector.process(monoChunk, inputSampleRate).then((probability) => {
          conversation.pushAudio(
            frame.base64,
            frame.durationMs,
            frame.rms,
            probability === null ? undefined : probability
          );
        });
      };

      const startAutoListening = async () => {
        if (
          !autoVoiceModeAccessAllowed ||
          activeVoiceMode !== "auto" ||
          autoModeEnabled ||
          autoStartPending ||
          isRecording ||
          processing
        ) {
          return;
        }
        if (siteAccess.limited()) {
          siteAccess.showLimit();
          return;
        }

        closeAllPopovers();
        autoStartPending = true;
        updateRecordingInstructions();
        const startToken = ++autoStartToken;
        const isCancelled = () => startToken !== autoStartToken || activeVoiceMode !== "auto";
        let permissionStateBefore = null;

        try {
          // The conversation is built on the push-to-talk session module.
          const modulePromise = loadGeminiDirectModule().then(loadGeminiHandsFreeModule);
          modulePromise.catch(() => {});

          await siteAccess.ready();
          if (siteAccess.required()) {
            const accessToken = await siteAccess.request();
            if (!accessToken) {
              return;
            }
          }
          if (isCancelled()) {
            return;
          }

          permissionStateBefore = await syncMicrophonePermissionState();
          if (hasDeniedMicPromptThisSession || permissionStateBefore === "denied") {
            setMicPermissionStatus(
              hasDeniedMicPromptThisSession
                ? MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD
                : MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE,
              {
                permissionState: permissionStateBefore,
                errorName: "",
                showNotice: true
              }
            );
            revealConversationIfNeeded();
            return;
          }

          try {
            await ensureAudioPipeline(permissionStateBefore);
          } catch (error) {
            releaseMicrophoneStream();
            handleMicrophoneAccessFailure({ permissionStateBefore, error });
            return;
          }
          hasDeniedMicPromptThisSession = false;
          setMicPermissionStatus(MIC_PERMISSION_STATES.GRANTED, {
            permissionState: "granted",
            errorName: ""
          });

          let handsFree = null;
          try {
            handsFree = await modulePromise;
          } catch {
            handsFree = null;
          }
          if (!handsFree || isCancelled()) {
            releaseMicrophoneStream();
            if (!handsFree) {
              setIdleInstructionMode("auto-error");
            }
            return;
          }
          await prepareSpeechDetector();
          if (isCancelled()) {
            // Whoever cancelled (stop, a mode switch) has already let go of
            // the microphone; by now it may be open again for Push to Talk.
            if (!isRecording && activeVoiceMode === "auto") {
              releaseMicrophoneStream();
            }
            return;
          }

          autoModeEnabled = true;
          autoModeState = "standby";
          setIdleInstructionMode("default");
          buildVoiceWaveBars();
          if (recordingDurationEl) {
            recordingDurationEl.textContent = "";
          }
          resetStreamingPlaybackQueue();
          startAutoConversation(handsFree);
          syncVoiceModeUi();
        } finally {
          autoStartPending = false;
          updateRecordingInstructions();
        }
      };

      // Every sentence is translated in its own session, so switching mode
      // keeps the conversation on screen.
      const switchVoiceMode = async (nextMode) => {
        const normalizedMode = nextMode === "auto" ? "auto" : "manual";
        if (normalizedMode === "auto" && !autoVoiceModeAccessAllowed) {
          return;
        }
        if (normalizedMode === activeVoiceMode) {
          return;
        }

        voiceModeChosenOnThisPage = true;
        if (normalizedMode === "manual") {
          await stopAutoListening();
        } else {
          tapStartActive = false;
          tapStartToken += 1;
          micPress = null;
          keyboardHoldActive = false;
          keyboardPressToken += 1;
          if (isRecording) {
            await stopRecording();
          }
          releasePreparedMicrophoneIfIdle();
        }

        activeVoiceMode = normalizedMode;
        persistVoiceMode(normalizedMode);
        if (normalizedMode === "manual") {
          prepareGeminiDirectStandby();
        } else {
          discardGeminiDirectStandby();
        }
        setIdleInstructionMode(
          micPermissionStatus === MIC_PERMISSION_STATES.GRANTED
            ? "permission-granted"
            : "default"
        );
        syncVoiceModeUi();
      };

      // Whether the page starts on the direct path. A device that has not been
      // told otherwise does: waiting for a first sentence through the server
      // to find out made that sentence take about 3.8 s instead of 1 s
      // (measured 2026-11-17) and hid the typing button and the pencil until
      // then. "0" is stored once the server refuses a lease
      // (requestGeminiDirectLease); a turn the server then translates on
      // Gemini turns it back on.
      const readGeminiDirectFlag = () => {
        try {
          return window.localStorage?.getItem(GEMINI_DIRECT_STORAGE_KEY) !== "0";
        } catch {
          return true;
        }
      };

      const writeGeminiDirectFlag = (enabled) => {
        try {
          window.localStorage?.setItem(GEMINI_DIRECT_STORAGE_KEY, enabled ? "1" : "0");
        } catch {
          // ignored
        }
      };

      const loadGeminiDirectModule = () => {
        if (window.LiveTalkGeminiDirect) {
          return Promise.resolve(window.LiveTalkGeminiDirect);
        }
        if (!geminiDirectModulePromise) {
          geminiDirectModulePromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = GEMINI_DIRECT_SCRIPT_URL;
            script.async = true;
            script.onload = () => {
              if (window.LiveTalkGeminiDirect) {
                resolve(window.LiveTalkGeminiDirect);
              } else {
                reject(new Error("Direct translation module did not load."));
              }
            };
            script.onerror = () => reject(new Error("Direct translation module failed to load."));
            document.head.appendChild(script);
          }).catch((error) => {
            geminiDirectModulePromise = null;
            throw error;
          });
        }
        return geminiDirectModulePromise;
      };

      const noteGeminiDirectActivity = () => {
        geminiDirectLastActivityAt = Date.now();
      };

      const discardGeminiDirectStandby = () => {
        window.clearTimeout(geminiDirectStandbyTimer);
        geminiDirectStandbyTimer = null;
        if (geminiDirectStandby) {
          geminiDirectStandby.session.cancel();
          geminiDirectStandby = null;
        }
      };

      // --- A reading connection kept ready -----------------------------------
      // An OpenAI Realtime session (see READ_ALOUD_MODEL in server.js) opened
      // with a short-lived key from /api/read-aloud/lease and kept waiting, so
      // a translation that came as text alone is read out at once (about
      // 0.9 s) instead of after connecting (about 2.2 s). Each reads one text
      // and is closed; the next is opened at once. Billed only when it reads.
      const READER_MAX_AGE_MS = 50 * 60 * 1000; // a session lasts 60 minutes
      const READER_READY_WAIT_MS = 1500;
      // A reader still not connected after this is given up and replaced.
      const READER_CONNECT_TIMEOUT_MS = 10000;
      const READER_TOTAL_TIMEOUT_MS = 60000;
      let readerStandby = null;

      const requestReaderLease = async () => {
        const headers = { "Content-Type": "application/json" };
        const accessToken = siteAccess.token();
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const response = await fetch("/api/read-aloud/lease", { method: "POST", headers, body: "{}" });
        if (!response.ok) throw new Error(`Reading-aloud key failed (HTTP ${response.status}).`);
        const lease = await response.json();
        if (!lease || typeof lease.value !== "string" || typeof lease.wsUrl !== "string") {
          throw new Error("Reading-aloud key is incomplete.");
        }
        return lease;
      };

      const createReader = () => {
        const reader = { createdAt: Date.now(), ws: null, ready: false, closed: false, onEvent: null };
        reader.close = () => {
          reader.closed = true;
          if (readerStandby === reader) readerStandby = null;
          try {
            if (reader.ws) reader.ws.close();
          } catch {
            // ignore close errors
          }
        };
        reader.readyPromise = requestReaderLease().then(
          (lease) =>
            new Promise((resolve, reject) => {
              if (reader.closed) {
                reject(new Error("Reader was closed."));
                return;
              }
              const ws = new WebSocket(lease.wsUrl, [
                "realtime",
                `openai-insecure-api-key.${lease.value}`
              ]);
              reader.ws = ws;
              ws.onmessage = (message) => {
                let event;
                try {
                  event = JSON.parse(message.data);
                } catch {
                  return;
                }
                if (event.type === "session.created" && !reader.ready) {
                  reader.ready = true;
                  resolve();
                  return;
                }
                if (!reader.ready && event.type === "error") {
                  reject(new Error(event.error?.message || "Reader error."));
                  return;
                }
                if (reader.onEvent) reader.onEvent(event);
              };
              ws.onerror = () => {
                if (!reader.ready) reject(new Error("Reader connection failed."));
              };
              ws.onclose = () => {
                const wasReady = reader.ready;
                reader.close();
                if (!wasReady) reject(new Error("Reader connection closed."));
                else if (reader.onEvent) reader.onEvent({ type: "reader.closed" });
              };
            })
        );
        const connectTimer = window.setTimeout(() => {
          if (!reader.ready) reader.close();
        }, READER_CONNECT_TIMEOUT_MS);
        reader.readyPromise.then(
          () => window.clearTimeout(connectTimer),
          () => {
            window.clearTimeout(connectTimer);
            reader.close();
          }
        );
        return reader;
      };

      // Keeps one reading connection ready while the direct path is on (see
      // prepareGeminiDirectStandby, which calls this).
      const prepareReaderStandby = () => {
        if (!geminiDirectEnabled || !geminiDirectAdmitted || document.visibilityState !== "visible") {
          return;
        }
        if (
          readerStandby &&
          !readerStandby.closed &&
          Date.now() - readerStandby.createdAt < READER_MAX_AGE_MS
        ) {
          return;
        }
        if (readerStandby) readerStandby.close();
        readerStandby = createReader();
      };

      const discardReaderStandby = () => {
        if (readerStandby) readerStandby.close();
        readerStandby = null;
      };

      // The waiting reader once it is ready (it is given a moment if it is
      // still connecting), or null. A new one is opened for next time.
      const takeReadyReader = async () => {
        const reader = readerStandby;
        if (!reader || reader.closed) return null;
        readerStandby = null;
        prepareReaderStandby();
        let timer = null;
        try {
          await Promise.race([
            reader.readyPromise,
            new Promise((_, reject) => {
              timer = window.setTimeout(() => reject(new Error("Reader not ready.")), READER_READY_WAIT_MS);
            })
          ]);
        } catch {
          reader.close();
          return null;
        } finally {
          window.clearTimeout(timer);
        }
        return reader.closed ? null : reader;
      };

      // Has a ready reader read `text`. onBytes gets each piece of PCM16;
      // resolves with the reader's own transcript of what it said.
      const readWithReader = (reader, text, { onBytes, firstAudioTimeoutMs }) =>
        new Promise((resolve, reject) => {
          let transcript = "";
          let heardAny = false;
          let settled = false;
          const finish = (error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(firstAudioTimer);
            window.clearTimeout(totalTimer);
            reader.onEvent = null;
            reader.close();
            if (error) reject(error);
            else resolve({ transcript });
          };
          const firstAudioTimer = window.setTimeout(
            () => finish(new Error("The reader sent no audio in time.")),
            firstAudioTimeoutMs
          );
          const totalTimer = window.setTimeout(
            () => finish(new Error("The reading took too long.")),
            READER_TOTAL_TIMEOUT_MS
          );
          reader.onEvent = (event) => {
            if (
              (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") &&
              typeof event.delta === "string"
            ) {
              try {
                const bytes = base64ToUint8Array(event.delta);
                if (bytes.length) {
                  if (!heardAny) {
                    heardAny = true;
                    window.clearTimeout(firstAudioTimer);
                  }
                  onBytes(bytes);
                }
              } catch (error) {
                finish(error);
              }
              return;
            }
            if (
              (event.type === "response.output_audio_transcript.delta" ||
                event.type === "response.audio_transcript.delta") &&
              typeof event.delta === "string"
            ) {
              transcript += event.delta;
              return;
            }
            if (event.type === "response.done") {
              // Stopped before the end (a filter, a limit): not the whole reading.
              const status = event.response && event.response.status;
              if (status && status !== "completed") {
                finish(new Error(`The reading ended as ${status}.`));
                return;
              }
              finish(heardAny ? null : new Error("The reader gave no audio."));
              return;
            }
            if (event.type === "error" || event.type === "reader.closed") {
              finish(new Error(event.error?.message || "The reading connection closed."));
            }
          };
          try {
            reader.ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text", text }] }
              })
            );
            reader.ws.send(JSON.stringify({ type: "response.create" }));
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        });

      // The slower way, when no reader is ready: the server connects and
      // reads (/api/read-aloud), sending the speech back as it comes.
      const readThroughServer = async (text, { onBytes, firstAudioTimeoutMs, signal }) => {
        const headers = { "Content-Type": "application/json" };
        const accessToken = siteAccess.token();
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const abort = new AbortController();
        const stop = () => abort.abort();
        if (signal) signal.addEventListener("abort", stop);
        // Only until the first sound: the rest streams in as it is made.
        const abortTimer = window.setTimeout(stop, firstAudioTimeoutMs);
        try {
          const response = await fetch("/api/read-aloud", {
            method: "POST",
            headers,
            body: JSON.stringify({ text }),
            signal: abort.signal
          });
          if (!response.ok || !response.body) {
            if (response.body) void response.body.cancel().catch(() => {});
            throw new Error(`Reading the translation aloud failed (HTTP ${response.status}).`);
          }
          const reader = response.body.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.length) {
                window.clearTimeout(abortTimer);
                onBytes(value);
              }
            }
          } catch (error) {
            // Stopped here (a reset): the server stops reading too.
            abort.abort();
            throw error;
          }
        } finally {
          window.clearTimeout(abortTimer);
          if (signal) signal.removeEventListener("abort", stop);
        }
      };

      const disableGeminiDirect = ({ forget = false } = {}) => {
        geminiDirectEnabled = false;
        geminiDirectDisabledAt = Date.now();
        discardReaderStandby();
        refreshTalkModeControls();
        discardGeminiDirectStandby();
        if (forget) {
          writeGeminiDirectFlag(false);
          updateAutoVoiceModeAccess(visitorAdmitted);
        }
      };

      const requestGeminiDirectLease = async ({ languageA, languageB, mode = "" }) => {
        const headers = { "Content-Type": "application/json" };
        const accessToken = siteAccess.token();
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }
        const response = await fetch("/api/gemini-live/lease", {
          method: "POST",
          headers,
          body: JSON.stringify(mode ? { languageA, languageB, mode } : { languageA, languageB })
        });
        if (!response.ok) {
          const details = await parseApiErrorResponse(response);
          const error = new Error(`Direct translation lease failed (HTTP ${response.status}).`);
          error.statusCode = response.status;
          error.code = details.errorCode;
          error.limit = details.limitDetails;
          if (response.status === 404 || details.errorCode === "GEMINI_DIRECT_UNAVAILABLE") {
            // Direct sessions are not (or no longer) offered here.
            disableGeminiDirect({ forget: true });
          }
          throw error;
        }
        return response.json();
      };

      const createGeminiDirectTurn = (directModule) => {
        const languageA = leftLang.name;
        const languageB = rightLang.name;
        return {
          languageA,
          languageB,
          session: directModule.createSession({
            requestLease: () => requestGeminiDirectLease({ languageA, languageB }),
            // An answer that comes as text alone is read aloud (tryReadAloud).
            waitForTextWithoutAudio: true
          })
        };
      };

      const isGeminiDirectTurnFresh = (turn) => {
        return Boolean(
          turn &&
          turn.session.isAvailable() &&
          turn.languageA === leftLang.name &&
          turn.languageB === rightLang.name &&
          turn.session.ageMs() < GEMINI_DIRECT_STANDBY_MAX_AGE_MS
        );
      };

      // Keeps one connected session waiting, so the next press can start
      // sending audio immediately instead of connecting first. It is made
      // again as soon as a press takes it, while the person is speaking, so
      // that a second connection is ready by the time they let go: if the
      // first attempt fails, or its answer has to be made again, the
      // recording goes to this one at once (see takeGeminiDirectBackup).
      const prepareGeminiDirectStandby = () => {
        if (!geminiDirectEnabled || !geminiDirectAdmitted || activeVoiceMode !== "manual") {
          return;
        }
        // The connection is made for one language pair.
        if (!languagesChosen()) {
          return;
        }
        if (document.visibilityState !== "visible") {
          return;
        }
        if (Date.now() - geminiDirectLastActivityAt > GEMINI_DIRECT_IDLE_LIMIT_MS) {
          discardGeminiDirectStandby();
          discardReaderStandby();
          return;
        }
        prepareReaderStandby();
        if (isGeminiDirectTurnFresh(geminiDirectStandby)) {
          return;
        }
        discardGeminiDirectStandby();
        void loadGeminiDirectModule()
          .then((directModule) => {
            if (
              !geminiDirectEnabled ||
              geminiDirectStandby ||
              document.visibilityState !== "visible"
            ) {
              return;
            }
            const standby = createGeminiDirectTurn(directModule);
            geminiDirectStandby = standby;
            standby.session.prepare().then(() => noteConnectionWorking(), (error) => {
              noteDirectConnectFailure(error);
              if (geminiDirectStandby === standby) {
                geminiDirectStandby = null;
              }
            });
            window.clearTimeout(geminiDirectStandbyTimer);
            geminiDirectStandbyTimer = window.setTimeout(
              prepareGeminiDirectStandby,
              GEMINI_DIRECT_STANDBY_MAX_AGE_MS + 1000
            );
          })
          .catch(() => {
            // The server path keeps working without the module.
          });
      };

      const enableGeminiDirect = () => {
        if (geminiDirectEnabled) {
          return;
        }
        if (geminiDirectFailures >= GEMINI_DIRECT_MAX_FAILURES) {
          if (Date.now() - geminiDirectDisabledAt < GEMINI_DIRECT_REST_MS) {
            return;
          }
          geminiDirectFailures = 0;
        }
        geminiDirectEnabled = true;
        refreshTalkModeControls();
        writeGeminiDirectFlag(true);
        noteGeminiDirectActivity();
        prepareGeminiDirectStandby();
        updateAutoVoiceModeAccess(visitorAdmitted);
      };

      const updateGeminiDirectAccess = (admitted = false) => {
        geminiDirectAdmitted = Boolean(admitted);
        if (!geminiDirectAdmitted) {
          disableGeminiDirect();
          return;
        }
        if (!geminiDirectEnabled && readGeminiDirectFlag()) {
          geminiDirectEnabled = true;
          refreshTalkModeControls();
          noteGeminiDirectActivity();
        }
        prepareGeminiDirectStandby();
      };

      // Why a press got no direct session (takeGeminiDirectTurn returned
      // null), for the turn report: a sentence on the server path waits
      // 5-8 s instead of about 1 s, and on 2026-11-17 one did so after a
      // quiet spell with nothing on record to say why.
      const describeMissingDirectTurn = () => {
        if (!geminiDirectEnabled) {
          if (!readGeminiDirectFlag()) return "refused";
          if (geminiDirectFailures >= GEMINI_DIRECT_MAX_FAILURES) return "resting";
          return "not-enabled";
        }
        if (!window.LiveTalkGeminiDirect) return "not-loaded";
        return "other";
      };

      // Called when the person presses the button. Returns the session that
      // will carry this turn, or null to use the server path.
      const takeGeminiDirectTurn = () => {
        if (!geminiDirectEnabled || !geminiDirectAdmitted || !window.LiveTalkGeminiDirect) {
          return null;
        }
        noteGeminiDirectActivity();
        window.clearTimeout(geminiDirectStandbyTimer);
        geminiDirectStandbyTimer = null;
        let turn = geminiDirectStandby;
        geminiDirectStandby = null;
        if (!isGeminiDirectTurnFresh(turn)) {
          if (turn) {
            turn.session.cancel();
          }
          // Nothing was waiting: connect now, while the person is speaking.
          turn = createGeminiDirectTurn(window.LiveTalkGeminiDirect);
          turn.session.prepare().then(
            () => noteConnectionWorking(),
            (error) => noteDirectConnectFailure(error)
          );
        }
        // How long it had waited for this press, for the turn report.
        turn.waitAtPress =
          typeof turn.session.describeWait === "function" ? turn.session.describeWait() : null;
        turn.session.begin();
        // The second connection for this turn (and the next press).
        prepareGeminiDirectStandby();
        return turn;
      };

      // The connection kept waiting, for a second attempt at a recorded turn
      // in the same languages; null if there is none (the server path is
      // used then). A new one starts connecting for the next press.
      const takeGeminiDirectBackup = ({ languageA, languageB }, { readyOnly = false } = {}) => {
        if (!geminiDirectEnabled || !geminiDirectAdmitted) {
          return null;
        }
        const turn = geminiDirectStandby;
        if (
          !isGeminiDirectTurnFresh(turn) ||
          turn.languageA !== languageA ||
          turn.languageB !== languageB ||
          (readyOnly && !turn.session.isReady())
        ) {
          return null;
        }
        geminiDirectStandby = null;
        window.clearTimeout(geminiDirectStandbyTimer);
        geminiDirectStandbyTimer = null;
        noteGeminiDirectActivity();
        prepareGeminiDirectStandby();
        return turn;
      };

      // Failures of a direct attempt that come from the connection (see the
      // reasons in gemini-direct.js), not from Gemini's answer.
      const CONNECTION_FAILURE_REASONS = new Set(["not-ready", "connection", "lease"]);
      // Failures of a direct attempt where Gemini was reached and said
      // nothing: no sound before the wait ran out, or an answer with none.
      const GEMINI_SILENT_RESULTS = new Set(["first-audio-timeout", "no-audio"]);

      // --- No connection ----------------------------------------------------
      // How many times in a row the page could not reach the network (a
      // connection kept waiting that never opened, a sentence that could not
      // be sent). From CONNECTION_FAILURES_BEFORE_CHECK on, a press first
      // checks that the site answers before anything is recorded, so nobody
      // says a whole sentence to a phone that cannot translate it.
      const CONNECTION_FAILURES_BEFORE_CHECK = 2;
      // Long enough for a server that has to start up after a quiet spell.
      const CONNECTION_CHECK_TIMEOUT_MS = 3000;
      let connectionFailuresInARow = 0;
      // The network itself was seen down (the phone offline, a request that
      // got no answer, the site not answering the check), not just Gemini.
      let networkSeenDown = false;

      const noteConnectionFailure = () => {
        connectionFailuresInARow += 1;
      };

      // A Gemini connection that never opened. Cancelled ones (the page
      // closed it) and refused token requests (they carry the status) say
      // nothing about the network.
      const noteDirectConnectFailure = (error) => {
        if (!error || error.cancelled || error.statusCode) return;
        if (CONNECTION_FAILURE_REASONS.has(error.reason)) noteConnectionFailure();
      };

      const noteConnectionWorking = () => {
        const networkWasDown = networkSeenDown;
        connectionFailuresInARow = 0;
        networkSeenDown = false;
        if (idleInstructionMode === "offline") setIdleInstructionMode("default");
        // Failures caused by the network say nothing about the direct path:
        // it is not left resting once the network is back. Failures of
        // Gemini's own connections keep their rest (GEMINI_DIRECT_REST_MS).
        if (
          networkWasDown &&
          !geminiDirectEnabled &&
          geminiDirectFailures >= GEMINI_DIRECT_MAX_FAILURES &&
          readGeminiDirectFlag()
        ) {
          geminiDirectFailures = 0;
          enableGeminiDirect();
        }
      };

      // Messages browsers give a request that never reached the server, or
      // whose answer was cut off on the way.
      const NETWORK_ERROR_PATTERN =
        /failed to fetch|load failed|networkerror|network error|network connection was lost|internet connection appears to be offline|err_internet_disconnected/i;

      const isNetworkFailure = (error) => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
        if (!error || typeof error !== "object") return false;
        // Not a Gemini connection that closed: Gemini may close it with the
        // network working, and the card must not blame the network then.
        return NETWORK_ERROR_PATTERN.test(String(error.message || ""));
      };

      // Whether a press should record nothing: the phone says it is offline,
      // or the network failed again and again and the site does not answer
      // now either. Any answer from the site, even an error, will do.
      const connectionIsDown = async () => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          networkSeenDown = true;
          return true;
        }
        if (connectionFailuresInARow < CONNECTION_FAILURES_BEFORE_CHECK) return false;
        // The button shows it is getting ready while the site is asked.
        setMicPreparing(true);
        const abort = new AbortController();
        const timer = window.setTimeout(() => abort.abort(), CONNECTION_CHECK_TIMEOUT_MS);
        try {
          await fetch("/api/health", { method: "HEAD", cache: "no-store", signal: abort.signal });
          noteConnectionWorking();
          return false;
        } catch {
          noteConnectionFailure();
          networkSeenDown = true;
          return true;
        } finally {
          window.clearTimeout(timer);
        }
      };

      window.addEventListener("offline", () => {
        networkSeenDown = true;
        if (!isRecording && !processing) setIdleInstructionMode("offline");
      });
      window.addEventListener("online", () => {
        noteConnectionWorking();
        prepareGeminiDirectStandby();
      });

      // A sentence that could not be translated: its card says so in both
      // languages and, unless retrying cannot help (a limit was reached), offers to
      // send the same sentence again. The error itself only goes to the
      // console: it is never shown as if it were a translation.
      const showTranslationFailure = (card, error, { onRetry = null } = {}) => {
        console.warn("Translation failed.", error);
        const message = error instanceof Error ? error.message : String(error || "");
        const limitDetails = error && typeof error === "object" ? error.limit : null;
        if (isNetworkFailure(error)) {
          noteConnectionFailure();
          networkSeenDown = true;
          if (card) card.setFailure(NO_CONNECTION_RETRY_NOTICE, { onRetry });
          return;
        }
        if (siteAccess.isLimitError(limitDetails, message)) {
          siteAccess.showLimit(limitDetails);
          if (card) card.setFailure(siteAccess.limitMessage(limitDetails));
          return;
        }
        siteAccess.inviteIfRefused(message);
        if (card) card.setFailure(NOT_TRANSLATED_RETRY_NOTICE, { onRetry });
      };

      // Sound can be played from here: the page's audio may have been closed
      // since the card was made (a tap on a card's button runs this).
      const ensurePlaybackAudio = async () => {
        if (!audioContext) createAudioContext();
        if (!playbackGainNode) {
          playbackGainNode = audioContext.createGain();
          playbackGainNode.gain.value = 1;
          playbackGainNode.connect(audioContext.destination);
          playbackRoutedLoud = false;
        }
        await resumeAudioContext();
      };

      // A second connection for the press that has just begun: it is sent
      // the same audio as it is spoken, and is told the turn is over at the
      // same moment as the first (holdDirectAnswer). Its answer is kept, not
      // played: if the first attempt fails before any speech or its answer is
      // thrown away, this one is played at once, often already complete.
      // Unused, it is closed when the turn is over: one more connection and
      // one more answer per press, which the person is not charged for.
      const startGeminiDirectParallel = (primary) => {
        if (!primary || !window.LiveTalkGeminiDirect) {
          return null;
        }
        const turn = createGeminiDirectTurn(window.LiveTalkGeminiDirect);
        if (turn.languageA !== primary.languageA || turn.languageB !== primary.languageB) {
          return null;
        }
        void turn.session.prepare();
        turn.session.begin();
        return turn;
      };

      // Tells a connection the turn is over and keeps what it answers (the
      // heard words, the translation's text and audio) until
      // processDirectTranslation takes it and plays it from the start. Asked
      // only after the first attempt had failed, the second connection made
      // the speaker wait another 1-2 s for an answer it could have had ready
      // (3-4 s in all, 11 of 124 turns on 2026-11-17). `onFirstSound`: its
      // first translated sound has come.
      const holdDirectAnswer = (turn, { onFirstSound = null } = {}) => {
        const held = { events: [], firstSoundAt: 0, heardText: "", translatedText: "", result: null };
        const keep = (name) => (value) => {
          held.events.push([name, value]);
          if (name === "onSourceText") held.heardText = String(value || "");
          if (name === "onTranslatedTextDelta") held.translatedText += String(value || "");
          if (name === "onAudioDelta" && !held.firstSoundAt) {
            held.firstSoundAt = performance.now();
            if (onFirstSound) onFirstSound();
          }
        };
        turn.session.handlers.onAudioDelta = keep("onAudioDelta");
        turn.session.handlers.onTranslatedTextDelta = keep("onTranslatedTextDelta");
        turn.session.handlers.onSourceText = keep("onSourceText");
        turn.held = held;
        // Once it is over, what it came to: an answer that has finished
        // before it is used is checked before anyone hears it
        // (heldAnswerFault). A failure is met again when it is used.
        turn.session.end().then(
          (result) => {
            held.result = result;
          },
          () => {}
        );
        return held;
      };

      // Why a kept answer (holdDirectAnswer) is not to be played, "" when
      // nothing is known against it. From its first words: heard as some
      // other language, or said back untranslated. Once it is over: in the
      // wrong language, or its voice stopped long before the end of its
      // text. On 2026-11-17/18 such an answer was played after the first
      // had been thrown away; twice the listener heard half a sentence and
      // was told to read the text, and once it held up the next attempt.
      const heldAnswerFault = (held, { languageA, languageB }) => {
        if (!held) return "";
        const result = held.result;
        const sourceText = (result && result.sourceText) || held.heardText;
        const translatedText = (result && result.translatedText) || held.translatedText;
        if (heardSoFarIsMadeUp({ sourceText, languageA, languageB })) return "made-up";
        if (translationNotTranslatedSoFar({ sourceText, translatedText, languageA, languageB })) {
          return "not-translated";
        }
        if (!result) return "";
        if (
          translationCameOutWrong({
            sourceText,
            translatedText,
            languageA,
            languageB,
            translatedTextIncomplete: result.translatedTextIncomplete
          })
        ) {
          return "wrong-language";
        }
        if (result.translatedAudioCutShort) return "cut-short";
        return "";
      };

      // Sends a whole recording to a waiting connection, half a second of
      // audio per message, and ends the turn. Audio sent before the
      // connection is ready waits in the session until it is.
      const sendRecordingToDirectTurn = (turn, chunks) => {
        turn.session.begin();
        let piece = [];
        let pieceSamples = 0;
        const sendPiece = () => {
          if (!piece.length) return;
          const frame = buildAutoAudioFrame(mergeFloat32(piece));
          turn.session.pushAudio(frame.base64, frame.durationMs);
          piece = [];
          pieceSamples = 0;
        };
        for (const chunk of chunks) {
          piece.push(chunk);
          pieceSamples += chunk.length;
          if (pieceSamples >= inputSampleRate / 2) sendPiece();
        }
        sendPiece();
      };

      // Resolves to true when the answer says the person's limit is used up.
      const settleGeminiLease = async ({
        leaseId,
        languageA,
        languageB,
        usage,
        status = "success",
        errorCode = ""
      }) => {
        if (!leaseId) {
          return false;
        }
        try {
          const headers = { "Content-Type": "application/json" };
          const accessToken = siteAccess.token();
          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }
          const response = await fetch("/api/gemini-live/settle", {
            method: "POST",
            headers,
            body: JSON.stringify({
              leaseId,
              languageA,
              languageB,
              inputSeconds: Number(usage?.inputSeconds) || 0,
              outputSeconds: Number(usage?.outputSeconds) || 0,
              status,
              errorCode: String(errorCode || "").slice(0, 180)
            })
          });
          if (response.ok) {
            const data = await response.json().catch(() => null);
            return noteLimitDetails(siteAccess.limitDetailsIn(data));
          }
        } catch (error) {
          console.warn("Direct translation settle failed.", error);
        }
        return false;
      };

      // The server takes up to 60 s of 24 kHz PCM16 for writing down.
      const SPOKEN_TEXT_MAX_AUDIO_BYTES = 60 * 24000 * 2;
      const SPOKEN_TEXT_TIMEOUT_MS = 12000;

      const settleGeminiDirectTurn = ({ turn, usage, status = "success", errorCode = "" }) => {
        const lease = turn.session.getLease();
        return settleGeminiLease({
          leaseId: lease ? lease.leaseId : "",
          languageA: turn.languageA,
          languageB: turn.languageB,
          usage,
          status,
          errorCode
        });
      };

      // --- How long the speaker waited ------------------------------------
      // Each spoken turn is timed from the moment the button is let go: when
      // each attempt started and ended, when its first translated sound was
      // queued to play, and what became of it ("ok", a failure reason from
      // gemini-direct.js, or why its answer was thrown away). The report is
      // added to the usage record of the turn's last attempt
      // (/api/turn-report), so slow turns can be counted by cause.
      // How many times the page has gone into the background: an attempt
      // during which it did is marked `hidden` in the turn report. A phone
      // locked or switched to another app can break a request midway.
      let pageHiddenCount = 0;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") pageHiddenCount += 1;
      });
      const createTurnTimer = () => {
        const releasedAt = performance.now();
        const since = () => Math.round(performance.now() - releasedAt);
        const attempts = [];
        return {
          attempts,
          elapsed: since,
          start(path) {
            const attempt = {
              path,
              startMs: since(),
              firstAudioMs: null,
              endMs: null,
              result: "",
              requestId: "",
              hidden: false,
              hiddenCountAtStart: pageHiddenCount
            };
            attempts.push(attempt);
            return attempt;
          },
          heard(attempt) {
            if (attempt.firstAudioMs === null) attempt.firstAudioMs = since();
          },
          finish(attempt, result) {
            if (attempt.endMs !== null) return;
            attempt.endMs = since();
            attempt.result = result;
            attempt.hidden =
              pageHiddenCount > attempt.hiddenCountAtStart || document.visibilityState !== "visible";
          },
          // The last attempt's answer came back but is not used as it is.
          reject(reason) {
            const last = attempts[attempts.length - 1];
            if (last) last.result = reason;
          }
        };
      };

      const describeAttemptFailure = (error) => {
        if (!error) return "error";
        if (error.cancelled) return "cancelled";
        if (typeof error.reason === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(error.reason)) {
          return error.reason;
        }
        return error.audioStarted ? "failed-while-speaking" : "error";
      };

      // `noDirect`: why the press had no direct session (see
      // describeMissingDirectTurn), "" when it had one.
      // `parallelSoundMs`: when the second connection's kept answer first
      // sounded (null: never), given only when there was one.
      // `speech`: where the speaker fell quiet (see describeRecordingSpeech).
      // `directWait`: how long the first connection had waited before the
      // press (describeWait in gemini-direct.js), null without one.
      // Attempts whose usage record the report is not added to: one given
      // up (its record says little), or a server request whose answer
      // stopped arriving (the server may finish it, and write its record,
      // long after the report is sent).
      // The request carrying the last report (see reportPlaybackFor).
      let lastTurnReportRequest = null;
      const TURN_REPORT_NOT_RECORDED = new Set(["cancelled", "overtaken", "stream-broken", "network"]);
      const sendTurnReport = (
        turnTimer,
        {
          recordingMs,
          outcome,
          noDirect = "",
          parallelSoundMs,
          speech = null,
          directWait = null,
          micWaitMs = null,
          text = null
        }
      ) => {
        const attempts = turnTimer.attempts;
        const last = attempts[attempts.length - 1];
        // Added to the usage record of the last attempt that has one.
        const recorded = attempts
          .filter(
            (attempt) =>
              attempt.requestId && !TURN_REPORT_NOT_RECORDED.has(attempt.result)
          )
          .pop();
        if (!last || !recorded) return "";
        const missed = takeMissedPresses();
        const sounds = attempts
          .map((attempt) => attempt.firstAudioMs)
          .filter((ms) => ms !== null);
        const turn = {
          recordingMs: Math.round(Number(recordingMs) || 0),
          waitMs: last.firstAudioMs,
          firstSoundMs: sounds.length ? Math.min(...sounds) : null,
          outcome,
          ...(noDirect ? { noDirect } : {}),
          ...(parallelSoundMs !== undefined ? { parallelSoundMs } : {}),
          ...(directWait ? { directWait } : {}),
          // Letting the button go -> recording (the microphone opening).
          ...(micWaitMs !== null ? { micWaitMs } : {}),
          // Presses since the last report that never became a sentence.
          ...(missed.length ? { missed } : {}),
          speech,
          attempts: attempts.map(({ path, startMs, firstAudioMs, endMs, result, requestId, acceptedRequestId, hidden }) => ({
            path,
            startMs,
            firstAudioMs,
            endMs,
            result: result || "unfinished",
            // Its usage record: the report itself goes on one record only.
            ...(requestId || acceptedRequestId ? { requestId: requestId || acceptedRequestId } : {}),
            ...(hidden ? { hidden: true } : {})
          }))
        };
        lastTurnReportRequest = fetch("/api/turn-report", {
          method: "POST",
          headers: turnReportHeaders(),
          // `text`: what was heard and said. The site keeps it only where it
          // has been asked to, for checking translations afterwards.
          body: JSON.stringify({ requestId: recorded.requestId, turn, ...(text ? { text } : {}) }),
          keepalive: true
        })
          .then((response) => {
            // Not taken: they go with the next report.
            if (!response.ok) putBackMissedPresses(missed);
          })
          .catch(() => putBackMissedPresses(missed));
        return recorded.requestId;
      };

      // How the translation of a reported sentence played (playbackHealth),
      // sent once it has finished playing and added to that sentence's
      // report. Never before the report itself has been taken: both change
      // the same record.
      const reportPlaybackFor = (requestId) => {
        const health = playbackHealth;
        if (!requestId || !health || !health.pieces || health.requestId) return;
        health.requestId = requestId;
        health.after = lastTurnReportRequest;
        if (health.done) {
          sendPlaybackReport(health);
        } else if (!streamingPlaybackSources.size && !heldPlaybackPiece) {
          // Already played to its end; otherwise its last sound closes it.
          finishPlaybackHealth(false);
        }
      };
      const sendPlaybackReport = (health) => {
        const playback = {
          pieces: health.pieces,
          audioMs: Math.round(health.audioMs),
          aheadMs: health.aheadMs,
          lateCount: health.lateCount,
          late: health.late,
          notRunning: health.notRunning,
          clockLagMs: health.clockLagMs,
          underruns: health.underruns,
          underrunMs: health.underrunMs,
          ...(health.cut ? { cut: true } : {})
        };
        const requestId = health.requestId;
        Promise.resolve(health.after)
          .catch(() => {})
          .then(() =>
            fetch("/api/turn-report", {
              method: "POST",
              headers: turnReportHeaders(),
              body: JSON.stringify({ requestId, playback }),
              keepalive: true
            })
          )
          .catch(() => {});
      };

      const turnReportHeaders = () => {
        const headers = { "Content-Type": "application/json" };
        const accessToken = siteAccess.token();
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        return headers;
      };

      // What the person did with a sentence's card after it was translated,
      // a sign the translation was not right: played it again ("replayed"),
      // tried a failed one again ("retried"), corrected the heard words
      // ("corrected"). Added to the report of that sentence.
      const cardReportIds = new WeakMap();
      const noteCardSignal = (card, signal) => {
        const requestId = card ? cardReportIds.get(card) : "";
        if (!requestId) return;
        void fetch("/api/turn-report", {
          method: "POST",
          headers: turnReportHeaders(),
          body: JSON.stringify({ requestId, signal }),
          keepalive: true
        }).catch(() => {});
      };

      // Presses that never became a sentence: too short, nothing heard, the
      // microphone did not open, no connection, given up while the
      // microphone was opening. Kept on the device (they have no record of
      // their own) and sent with the next sentence's report.
      const MISSED_PRESSES_STORAGE_KEY = "vt-missed-presses";
      const MISSED_PRESSES_MAX = 20;
      const readMissedPresses = () => {
        try {
          const stored = JSON.parse(window.localStorage?.getItem(MISSED_PRESSES_STORAGE_KEY) || "[]");
          return Array.isArray(stored) ? stored : [];
        } catch {
          return [];
        }
      };
      const writeMissedPresses = (presses) => {
        try {
          if (presses.length) {
            window.localStorage?.setItem(
              MISSED_PRESSES_STORAGE_KEY,
              JSON.stringify(presses.slice(-MISSED_PRESSES_MAX))
            );
          } else {
            window.localStorage?.removeItem(MISSED_PRESSES_STORAGE_KEY);
          }
        } catch {
          // ignored
        }
      };
      const noteMissedPress = (kind, { micWaitMs = null, heldMs = null } = {}) => {
        const round = (ms) => (Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null);
        writeMissedPresses([
          ...readMissedPresses(),
          { kind, at: Date.now(), micWaitMs: round(micWaitMs), heldMs: round(heldMs) }
        ]);
      };
      const takeMissedPresses = () => {
        const presses = readMissedPresses();
        if (presses.length) writeMissedPresses([]);
        return presses;
      };
      const putBackMissedPresses = (presses) => {
        if (presses.length) writeMissedPresses([...presses, ...readMissedPresses()]);
      };

      // One line for the usage record of a direct turn that failed before
      // any translated speech, e.g.
      // "before_audio heard=1 text=0 8.1s NO_AUDIO Gemini sent no translated audio in time."
      const describeDirectFailure = (error, { heard, text, waitedMs }) => {
        const code = error && error.code ? `${error.code} ` : "";
        const message = error && error.message ? error.message : String(error || "unknown");
        const seconds = (Math.max(0, Number(waitedMs) || 0) / 1000).toFixed(1);
        return `before_audio heard=${heard ? 1 : 0} text=${text ? 1 : 0} ${seconds}s ${code}${message}`.slice(
          0,
          180
        );
      };

      const processDirectTranslation = async (
        card,
        turn,
        {
          conversationToken = conversationResetToken,
          stopIfNotTranslated = false,
          stopIfHeardOutsidePair = false,
          // Called once, when the first translated sound is queued to play.
          onFirstAudio = null,
          // What the card shows of the translation (see
          // correctionTranslationShown): `(rawText, final)`. The turn's
          // result keeps the words as they came.
          shownTranslation = (text) => String(text || "")
        } = {}
      ) => {
        const { session } = turn;
        const streamedAudioChunks = [];
        let translatedText = "";
        let heardSoFar = "";
        let hasAudio = false;
        // `stopIfHeardOutsidePair`: the caller drops a turn whose heard words
        // are plainly in a language outside the pair (made up from silence).
        // Once that shows, nothing more of it is shown or played, and the
        // turn is ended at once, instead of showing "¿Qué hora es?" on the
        // card until the made-up translation has finished.
        let heardOutsidePair = false;
        const isStale = () => conversationToken !== conversationResetToken;
        const isDiscarded = () => isStale() || heardOutsidePair;
        // `stopIfNotTranslated`: the caller translates again when the sentence
        // comes back untranslated, so such an answer is stopped as soon as
        // that shows.
        const stopIfNotTranslatedSoFar = () => {
          if (!stopIfNotTranslated || typeof session.stopEarly !== "function") return false;
          return (
            translationNotTranslatedSoFar({
              sourceText: heardSoFar,
              translatedText,
              languageA: turn.languageA,
              languageB: turn.languageB
            }) && session.stopEarly() === true
          );
        };

        resetStreamingPlaybackQueue();
        session.handlers.onAudioDelta = (base64Chunk) => {
          if (isDiscarded()) return;
          const chunk = base64ToUint8Array(base64Chunk);
          if (!chunk.length) return;
          streamedAudioChunks.push(chunk);
          enqueuePcm16Base64Chunk(base64Chunk, 24000);
          if (!hasAudio) {
            hasAudio = true;
            if (card) card.setPhase("playing");
            if (onFirstAudio) onFirstAudio();
          }
        };
        session.handlers.onTranslatedTextDelta = (delta) => {
          if (isStale()) return;
          translatedText += delta;
          if (heardOutsidePair) return;
          // Words that are about to be thrown away are not shown.
          if (stopIfNotTranslatedSoFar()) return;
          if (card) card.setTranslatedText(shownTranslation(translatedText, false));
        };
        session.handlers.onSourceText = (text) => {
          if (isStale()) return;
          heardSoFar = text;
          if (heardOutsidePair) return;
          if (
            stopIfHeardOutsidePair &&
            heardSoFarIsMadeUp({
              sourceText: text,
              languageA: turn.languageA,
              languageB: turn.languageB
            })
          ) {
            heardOutsidePair = true;
            stopStreamingPlayback();
            if (typeof session.stopEarly === "function") session.stopEarly();
            return;
          }
          if (card) card.setSourceText(text);
          stopIfNotTranslatedSoFar();
        };
        // An answer kept while another attempt was tried (holdDirectAnswer):
        // what has come of it so far goes through the handlers above, in
        // order, and the rest arrives through them as usual.
        const held = turn.held;
        turn.held = null;
        if (held) {
          for (const [name, value] of held.events) session.handlers[name](value);
        }

        let result;
        const endedAt = Date.now();
        try {
          result = await session.end();
        } catch (error) {
          if (error && typeof error === "object") {
            // What had come before the failure: a translation that came as
            // text alone can still be read aloud (see textOnlyTranslation).
            error.heardText = String(heardSoFar || "").trim();
            error.textSoFar = translatedText;
          }
          if (error && error.audioStarted) {
            // Part of the translation was already heard, so it is charged.
            void settleGeminiDirectTurn({
              turn,
              usage: error.usage,
              status: "error",
              errorCode: error.message
            });
          } else if (error && !error.cancelled && !isStale()) {
            // Failed before any translated speech: the page asks the server
            // to translate the recording instead. Recorded (not charged) so
            // the reason can be counted later: whether the words had shown,
            // whether translated text had come, and how long it waited.
            void settleGeminiDirectTurn({
              turn,
              usage: { inputSeconds: 0, outputSeconds: 0 },
              status: "error",
              errorCode: describeDirectFailure(error, {
                heard: Boolean(String(heardSoFar || "").trim()),
                text: Boolean(translatedText.trim()),
                waitedMs: Date.now() - endedAt
              })
            });
          }
          if (isStale()) {
            throw createConversationResetError();
          }
          throw error;
        }

        void settleGeminiDirectTurn({ turn, usage: result });
        geminiDirectFailures = 0;
        if (isStale()) {
          throw createConversationResetError();
        }
        if (heardOutsidePair) {
          // Nothing of it reaches the card: the caller drops the turn.
          return {
            sourceText: result.sourceText || heardSoFar,
            translatedText: result.translatedText || translatedText,
            textMissing: false,
            textIncomplete: false,
            audioCutShort: false,
            audioMissing: false,
            stoppedEarly: true,
            heardOutsidePair: true,
            audioChunks: []
          };
        }
        if (card) {
          if (result.sourceText) card.setSourceText(result.sourceText);
          // Always set it, also when empty: the card still holds the
          // "Translating..." placeholder if no text arrived. (Not for an
          // answer stopped early: the caller is about to translate again.)
          if (!result.stoppedEarly) {
            card.setTranslatedText(shownTranslation(result.translatedText || translatedText, true));
          }
          if (streamedAudioChunks.length > 0) {
            const replayBlob = pcm16BytesToWavBlob(concatUint8Arrays(streamedAudioChunks));
            card.setReplayUrl(URL.createObjectURL(replayBlob));
          }
        }
        return {
          sourceText: result.sourceText || "",
          translatedText: result.translatedText || translatedText,
          textMissing: !(result.translatedText || translatedText).trim(),
          textIncomplete: Boolean(result.translatedTextIncomplete),
          audioCutShort: Boolean(result.translatedAudioCutShort),
          audioMissing: Boolean(result.translatedAudioMissing),
          stoppedEarly: Boolean(result.stoppedEarly),
          audioChunks: streamedAudioChunks
        };
      };

      // A corrected sentence is announced as one, in the speaker's language,
      // so the listener knows it replaces what they just heard. Languages
      // without an entry are simply translated without the announcement.
      const CORRECTION_PREFIX = { Chinese: "更正：", Thai: "แก้ไข: ", English: "Correction: " };

      // The announcement is spoken, but the card does not show it: the card
      // is marked "Corrected" instead, and its words stay the sentence alone
      // (also when enlarged for the other person). It comes back translated,
      // in the listener's language, in a few forms ("更正：好的。我要两个。"
      // came back as "แก้ไขค่ะ ได้ค่ะ เอาสองอัน", 2026-11-17). Only a
      // leading word followed by a pause or punctuation is taken off, so a
      // sentence that merely starts with "แก้ไขให้หน่อย" keeps its words.
      // `polite`: an ending that closes the announcement by itself, so a pause
      // after it is enough ("แก้ไขค่ะ ได้ค่ะ"). After the bare word a mark
      // is needed ("แก้ไข: ", "Correction: "): a space alone may just as well
      // start a sentence that begins with the word ("แก้ไข เอกสารให้หน่อย").
      const CORRECTION_ANNOUNCEMENT = {
        Chinese: { words: ["更正", "纠正", "修正", "订正", "改正"], tail: "(?:一下)?", polite: "" },
        Thai: { words: ["ขอแก้ไข", "แก้ไข"], tail: "(?:นะ)?", polite: "(?:นะ)?(?:ค่ะ|คะ|ครับ)" },
        English: { words: ["correction", "corrected", "correcting"], tail: "", polite: "" }
      };
      const CORRECTION_MARK = "[:：,，.。;；!！\\-–—]";
      const CORRECTION_SEPARATOR = `(?:\\s|${CORRECTION_MARK})`;
      const correctionAnnouncementPattern = (language) => {
        const entry = CORRECTION_ANNOUNCEMENT[language];
        if (!entry) return null;
        const ends = [`${entry.tail}\\s*${CORRECTION_MARK}${CORRECTION_SEPARATOR}*`];
        if (entry.polite) ends.push(`${entry.polite}(?:${CORRECTION_SEPARATOR}+|$)`);
        return new RegExp(`^\\s*(?:${entry.words.join("|")})(?:${ends.join("|")})`, "i");
      };
      // Returns what the card shows of a corrected sentence's translation:
      // `(rawText, final)`. While the translation is still arriving, words
      // that may yet turn out to be the announcement are held back, so
      // "แก้" does not flash up and vanish; no longer than the announcement
      // could be, so a sentence that only starts with the word is not kept
      // off the card while it plays. Identity when there is nothing to take
      // off.
      const CORRECTION_HOLD_EXTRA_CHARS = 8;
      const correctionTranslationShown = ({ sourceText, languageA, languageB }) => {
        const keep = (raw) => String(raw || "");
        const sourceLanguage = detectLanguageFromText(sourceText, languageA, languageB);
        const targetLanguage =
          sourceLanguage === languageA ? languageB : sourceLanguage === languageB ? languageA : "";
        const pattern = correctionAnnouncementPattern(targetLanguage);
        if (!pattern) return keep;
        // The speaker's own sentence starts with "更正" or the like: its
        // translation starts with it too, and nothing is taken off.
        const source = String(sourceText || "").trim().toLowerCase();
        const ownWords = (CORRECTION_ANNOUNCEMENT[sourceLanguage] || { words: [] }).words;
        if (ownWords.some((word) => source.startsWith(word))) return keep;
        const words = CORRECTION_ANNOUNCEMENT[targetLanguage].words;
        const holdLength = Math.max(...words.map((word) => word.length)) + CORRECTION_HOLD_EXTRA_CHARS;
        const separator = new RegExp(CORRECTION_SEPARATOR);
        return (raw, final = false) => {
          const value = String(raw || "");
          const match = value.match(pattern);
          if (match) return value.slice(match[0].length);
          if (final) return value;
          const sofar = value.trim().toLowerCase();
          const mayBeAnnouncement =
            !sofar ||
            words.some(
              (word) =>
                word.startsWith(sofar) ||
                (sofar.startsWith(word) && !separator.test(sofar) && sofar.length <= holdLength)
            );
          return mayBeAnnouncement ? "" : value;
        };
      };

      // Only the direct Gemini path can take a typed sentence.
      const canCorrectHeardText = () => geminiDirectEnabled && activeVoiceMode === "manual";

      // The speaker fixed the words on a card. The corrected sentence goes to
      // Gemini as text (nothing is heard, so nothing can be misheard again),
      // on the connection kept waiting for the next press when there is one,
      // and the card shows and plays the new translation.
      // `correction: false` is a sentence typed from the start (see
      // translateTypedText): the same path, without the announcement.
      // Returns whether the sentence was taken.
      const correctHeardText = async (card, typedText, { languageA, languageB, correction = true }) => {
        const text = String(typedText || "").trim();
        if (!card || !text || isRecording || processing || !canCorrectHeardText()) {
          return false;
        }
        const conversationToken = conversationResetToken;
        processing = true;
        manualProcessingToken = conversationToken;
        if (micBtn) micBtn.classList.add("is-processing");
        pauseMicrophoneForPlayback();
        try {
          // Nothing else may be playing when the corrected sentence is spoken.
          stopStreamingPlayback();
          stopCurrentReplayAudio();
          card.clearFailure();
          card.setSourceText(text);
          card.setTranslatedText("");
          card.setReplayUrl("");
          card.setPhase("translating");
          await ensurePlaybackAudio();

          const directModule = await loadGeminiDirectModule();
          const prefix = correction
            ? CORRECTION_PREFIX[detectLanguageFromText(text, languageA, languageB)] || ""
            : "";
          // The card leaves the announcement out; what is read aloud keeps it.
          const shownTranslation = prefix
            ? correctionTranslationShown({ sourceText: text, languageA, languageB })
            : undefined;
          let outcome = null;
          // The first attempt's waiting connection was lost (see standbyLost).
          let connectionLost = false;
          for (let attempt = 1; !outcome; attempt += 1) {
            // The connection kept waiting for the next press is already
            // connected: taking it saves the 2 s or so a new one needs
            // (token, socket, Gemini's setup; measured 1.7-2.5 s on
            // 2026-11-17). A new one starts waiting in its place.
            // After a lost connection, only one already connected is taken:
            // the one that started waiting with the first attempt and is
            // still connecting is likely stuck on the same network, and
            // waiting for it could double the wait (8 s each) before an error.
            const standby = takeGeminiDirectBackup(
              { languageA, languageB },
              { readyOnly: connectionLost }
            );
            const turn = standby || {
              languageA,
              languageB,
              session: directModule.createSession({
                requestLease: () => requestGeminiDirectLease({ languageA, languageB }),
                // An answer that comes as text alone is read aloud.
                waitForTextWithoutAudio: true
              })
            };
            // Gemini translates some typed sentences without speaking them.
            // With the sound off the words are all that is wanted; with it
            // on, they are read aloud (below). Only when that cannot be done
            // is the sentence asked once more, and after that the words
            // alone are shown rather than an error.
            const acceptTextOnly = soundIsOff() || attempt >= 2;
            // processDirectTranslation picks the result up from session.end().
            turn.session.sendText(prefix + text, text, { acceptTextOnly }).catch(() => {});
            try {
              outcome = await processDirectTranslation(card, turn, { conversationToken, shownTranslation });
            } catch (error) {
              const silent = error && error.code === "NO_AUDIO" && !error.audioStarted;
              // The translation came as text alone: read it aloud rather
              // than ask Gemini again, which tends to stay silent too.
              const textOnly =
                silent && !soundIsOff() && conversationToken === conversationResetToken
                  ? textOnlyTranslation(error, { sourceText: text, languageA, languageB })
                  : "";
              if (textOnly) {
                try {
                  const { audioChunks } = await readTranslationAloud(card, textOnly, {
                    conversationToken
                  });
                  outcome = {
                    sourceText: text,
                    translatedText: textOnly,
                    textMissing: false,
                    textIncomplete: false,
                    audioChunks
                  };
                  break;
                } catch (readError) {
                  if (isConversationResetError(readError)) throw readError;
                  if (readError && readError.audioStarted) {
                    // Part of it was heard: keep the whole text, note the voice stopped.
                    outcome = {
                      sourceText: text,
                      translatedText: textOnly,
                      textMissing: false,
                      textIncomplete: false,
                      audioChunks: readError.audioChunks || [],
                      readAloudBrokeOff: true
                    };
                    card.setTranslatedText(textOnly);
                    break;
                  }
                  console.warn("Reading the typed translation aloud failed.", readError);
                }
              }
              // Now and then no speech comes back at all: ask once more.
              // A waiting connection can be lost while it waits (a phone
              // put away): the sentence then goes to another one.
              const standbyLost =
                Boolean(standby) &&
                Boolean(error) &&
                !error.audioStarted &&
                CONNECTION_FAILURE_REASONS.has(error.reason);
              if (
                !(silent || standbyLost) ||
                attempt >= 2 ||
                conversationToken !== conversationResetToken
              ) {
                throw error;
              }
              connectionLost = standbyLost;
            }
          }
          if (conversationToken !== conversationResetToken) {
            return;
          }
          // The second attempt takes the words without a voice. With the
          // sound on they are read aloud too, whatever kept the first attempt
          // from it (its text not marked whole, or the reading failing): a
          // card with words alone has no play button, and the other person
          // hears nothing (seen 2026-11-17: "好的。", 1 typed sentence in 13).
          if (outcome.audioMissing && !outcome.textIncomplete && !soundIsOff()) {
            const textOnly = readableTranslation(outcome.translatedText, {
              sourceText: text,
              languageA,
              languageB
            });
            if (textOnly) {
              try {
                const { audioChunks } = await readTranslationAloud(card, textOnly, { conversationToken });
                outcome = { ...outcome, translatedText: textOnly, audioChunks, audioMissing: false };
              } catch (readError) {
                if (isConversationResetError(readError)) throw readError;
                if (readError && readError.audioStarted) {
                  // Part of it was heard: keep the whole text, note the voice stopped.
                  outcome = {
                    ...outcome,
                    translatedText: textOnly,
                    audioChunks: readError.audioChunks || [],
                    readAloudBrokeOff: true
                  };
                  card.setTranslatedText(textOnly);
                } else {
                  console.warn("Reading the typed translation aloud failed.", readError);
                }
              }
            }
            if (conversationToken !== conversationResetToken) {
              return;
            }
          }
          // Every way the words reached the card (streamed, read aloud) ends
          // with them shown without the announcement, and judged that way.
          if (shownTranslation) {
            const shown = shownTranslation(outcome.translatedText, true);
            if (shown !== outcome.translatedText) {
              outcome = { ...outcome, translatedText: shown, textMissing: !shown.trim() };
              card.setTranslatedText(shown);
            }
          }
          noteConnectionWorking();
          card.setSourceText(text);
          card.setPhase("result");
          card.setCorrectionFailed(false);
          if (correction) card.markCorrected();
          if (translationCameOutWrong({ ...outcome, sourceText: text, languageA, languageB })) {
            card.setNotice(wrongAnswerNotice({ ...outcome, sourceText: text, languageA, languageB }));
          } else if (outcome.readAloudBrokeOff) {
            card.setNotice("This one was not read aloud in full. Please read the text.");
          } else if (outcome.textMissing || outcome.textIncomplete) {
            void writeDownSpokenTranslation(card, outcome, conversationToken, {
              languageA,
              languageB,
              shownTranslation
            });
          }
        } catch (error) {
          if (isConversationResetError(error) || conversationToken !== conversationResetToken) {
            return;
          }
          card.setCorrectionFailed(true);
          // The typed words stay on the card; Retry sends them again.
          showTranslationFailure(card, error, {
            onRetry: () => correctHeardText(card, text, { languageA, languageB, correction })
          });
        } finally {
          if (manualProcessingToken === conversationToken) {
            processing = false;
            manualProcessingToken = 0;
            if (micBtn) micBtn.classList.remove("is-processing");
          }
          // Opens the microphone again once the translation has played.
          resumeMicrophoneAfterPlayback();
          refreshTalkModeControls();
        }
        return true;
      };

      // A sentence typed instead of spoken (the keyboard button of the phone's
      // full-screen translator): it gets a card of its own and is translated
      // like a corrected sentence. Returns whether it was taken.
      const translateTypedText = (typedText) => {
        const text = String(typedText || "").trim();
        if (!text || isRecording || processing || !canCorrectHeardText()) {
          return false;
        }
        const languageA = leftLang.name;
        const languageB = rightLang.name;
        const card = createResultCard({ languageA, languageB });
        void correctHeardText(card, text, { languageA, languageB, correction: false });
        refreshTalkModeControls();
        return true;
      };

      const processTranslation = async (
        card,
        audioBase64,
        {
          conversationToken = conversationResetToken,
          heardText = "",
          retry = null,
          // "openai" to have the server skip Gemini (see streamTranslateTurn).
          engine = "",
          // Called once, when the first translated sound is queued to play.
          onFirstAudio = null,
          // Called with the id of this turn's usage record on the server,
          // once the server has finished with it ("done" or "error").
          onRequestId = null,
          // Called with the same id as soon as the server takes the request
          // ("accepted"): its record may not exist for a long while yet.
          onRequestAccepted = null
        } = {}
      ) => {
        if (conversationToken !== conversationResetToken) {
          throw createConversationResetError();
        }

        const streamedAudioChunks = [];
        // `heardText`: what an earlier attempt at this same recording heard.
        // The server may send no heard words at all (a turn that fell back to
        // the other engine has none), and they must not be lost from the card.
        const knownHeardText = String(heardText || "").trim();
        let sourceText = knownHeardText;
        // Nothing is written on the card before the translated speech starts.
        // Until then the server may still drop this attempt and begin again
        // with its other engine, and words shown early would be taken away
        // and replaced in front of the reader.
        let textHeld = true;
        const showSourceText = (text) => {
          sourceText = String(text || "").trim() || knownHeardText;
          if (!textHeld) card.setSourceText(sourceText);
        };
        const showTranslatedText = () => {
          if (!textHeld) card.setTranslatedText(translatedText);
        };
        const releaseHeldText = () => {
          if (!textHeld) return;
          textHeld = false;
          if (sourceText) card.setSourceText(sourceText);
          if (translatedText.trim()) card.setTranslatedText(translatedText);
        };
        let translatedText = "";
        let hasAudio = false;
        let textIncomplete = false;
        let audioCutShort = false;
        // Which model the server answered with ("gemini", "openai"; "" if
        // it did not say).
        let answeredEngine = "";

        resetStreamingPlaybackQueue();
        await siteAccess.ready();
        const accessToken = siteAccess.token();

        await streamTranslateTurn({
          audioBase64,
          languageA: leftLang.name,
          languageB: rightLang.name,
          voice: DEFAULT_VOICE,
          accessToken,
          retry,
          engine,
          onEvent: (event) => {
            if (conversationToken !== conversationResetToken) {
              return createConversationResetError();
            }
            if (!event || typeof event.type !== "string") return null;

            if (event.type === "translated_audio_delta" && typeof event.audio === "string") {
              const chunk = base64ToUint8Array(event.audio);
              if (chunk.length) {
                streamedAudioChunks.push(chunk);
                enqueuePcm16Base64Chunk(event.audio, Number(event.sampleRate) || 24000);
                if (!hasAudio) {
                  hasAudio = true;
                  releaseHeldText();
                  card.setPhase("playing");
                  if (onFirstAudio) onFirstAudio();
                }
              }
              return null;
            }

            if (event.type === "translated_text_delta" && typeof event.delta === "string") {
              translatedText += event.delta;
              showTranslatedText();
              return null;
            }

            if (event.type === "translated_text_done" && typeof event.text === "string") {
              translatedText = event.text;
              showTranslatedText();
              return null;
            }

            if (event.type === "source_text" && typeof event.text === "string") {
              showSourceText(event.text);
              return null;
            }

            if (event.type === "done") {
              if (onRequestId && typeof event.requestId === "string") onRequestId(event.requestId);
              if (typeof event.engine === "string") answeredEngine = event.engine;
              if (event.engine === "gemini") {
                enableGeminiDirect();
              }
              if (typeof event.sourceText === "string") {
                showSourceText(event.sourceText);
              }
              if (typeof event.translatedText === "string" && event.translatedText.trim()) {
                translatedText = event.translatedText.trim();
                showTranslatedText();
              }
              textIncomplete = event.translatedTextIncomplete === true;
              audioCutShort = event.translatedAudioCutShort === true;
              noteLimitDetails(siteAccess.limitDetailsIn(event));
              return null;
            }

            if (event.type === "warning" && typeof event.message === "string") {
              return null;
            }

            if (event.type === "error" && typeof event.message === "string") {
              if (onRequestId && typeof event.requestId === "string") onRequestId(event.requestId);
              const serverError = new Error(event.message);
              serverError.reason = "server-error";
              return serverError;
            }

            // Sent first, so the turn report can name this request even if
            // the answer never arrives.
            if (event.type === "accepted") {
              if (onRequestAccepted && typeof event.requestId === "string") onRequestAccepted(event.requestId);
              return null;
            }
            return null;
          }
        });
        if (conversationToken !== conversationResetToken) {
          throw createConversationResetError();
        }
        if (streamedAudioChunks.length > 0) {
          const replayBlob = pcm16BytesToWavBlob(concatUint8Arrays(streamedAudioChunks));
          const replayUrl = URL.createObjectURL(replayBlob);
          card.setReplayUrl(replayUrl);
        }
        // The turn is over: show whatever was still held back.
        releaseHeldText();
        // Also when empty: the card still holds the "Translating..."
        // placeholder if no text arrived.
        if (card) card.setTranslatedText(translatedText);
        return {
          sourceText,
          translatedText,
          textMissing: !translatedText.trim(),
          textIncomplete,
          audioCutShort,
          engine: answeredEngine,
          audioChunks: streamedAudioChunks
        };
      };

      // Gemini now and then translates a sentence without speaking it: the
      // text arrives, no audio does, and asking again tends to give the same
      // (seen 2026-11-17: four tries at one short sentence, all silent). Such
      // a translation is read aloud instead (/api/read-aloud). Returns the
      // text to read, or "" when the failure was not that, or the text is
      // not a translation into the pair's other language.
      const READ_ALOUD_MAX_TEXT_LENGTH = 600;
      const READ_ALOUD_FIRST_AUDIO_TIMEOUT_MS = 6000;
      const textOnlyTranslation = (error, { sourceText, languageA, languageB }) => {
        if (!error || error.code !== "NO_AUDIO" || error.reason !== "no-audio") return "";
        // Only text the session says is whole (gemini-direct.js
        // failure.textIncomplete): text that stops halfway is not read out
        // as the whole answer.
        if (error.audioStarted || error.noSpeech || error.textIncomplete !== false) return "";
        return readableTranslation(error.translatedText, { sourceText, languageA, languageB });
      };

      // `text` as a translation fit to be read aloud: not too long, and a
      // translation into the pair's other language. "" when it is not.
      const readableTranslation = (rawText, { sourceText, languageA, languageB }) => {
        const text = String(rawText || "").trim();
        if (!text || text.length > READ_ALOUD_MAX_TEXT_LENGTH) return "";
        // Without the language check nothing is read out unchecked.
        if (!window.LiveTalkTranslationLanguage) return "";
        const turn = { sourceText, translatedText: text, languageA, languageB };
        if (translationCameOutWrong(turn) || heardTextIsMadeUp(turn)) return "";
        return text;
      };

      // Plays `text` read aloud on the card, as it arrives: on the reader
      // kept ready, else through the server. Resolves with the audio played
      // and whether the reader said other words than the text; rejects (with
      // `audioStarted` once any was played) when it cannot be had.
      const readTranslationAloud = async (card, text, { conversationToken, onFirstAudio = null }) => {
        const chunks = [];
        let started = false;
        let carry = null;
        let saidOtherWords = false;
        const play = (value) => {
          if (conversationToken !== conversationResetToken) throw createConversationResetError();
          // Whole 16-bit samples only; an odd byte waits for the next piece.
          let bytes = value;
          if (carry) {
            bytes = concatUint8Arrays([carry, value]);
            carry = null;
          }
          if (bytes.length % 2) {
            carry = bytes.slice(bytes.length - 1);
            bytes = bytes.slice(0, bytes.length - 1);
          }
          if (!bytes.length) return;
          const piece = bytes.slice();
          if (!started) resetStreamingPlaybackQueue();
          chunks.push(piece);
          enqueuePcm16Base64Chunk(arrayBufferToBase64(piece.buffer), 24000);
          if (!started) {
            started = true;
            if (card) card.setPhase("playing");
            if (onFirstAudio) onFirstAudio();
          }
        };
        try {
          const reader = await takeReadyReader();
          let read = false;
          if (reader) {
            try {
              const { transcript } = await readWithReader(reader, text, {
                onBytes: play,
                firstAudioTimeoutMs: READ_ALOUD_FIRST_AUDIO_TIMEOUT_MS
              });
              read = true;
              // For the turn report: the reader's own words, compared with the text.
              const plain = (value) => String(value || "").replace(/[\s\p{P}\p{S}]/gu, "");
              saidOtherWords = Boolean(transcript) && plain(transcript) !== plain(text);
            } catch (error) {
              if (started || isConversationResetError(error)) throw error;
              console.warn("The reading connection failed, reading through the server.", error);
            }
          }
          if (!read) {
            if (conversationToken !== conversationResetToken) throw createConversationResetError();
            await readThroughServer(text, {
              onBytes: play,
              firstAudioTimeoutMs: READ_ALOUD_FIRST_AUDIO_TIMEOUT_MS
            });
          }
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          if (!failure.reason && !isConversationResetError(failure)) failure.reason = "read-aloud-failed";
          failure.audioStarted = started;
          failure.audioChunks = chunks;
          throw failure;
        }
        if (!started) {
          const error = new Error("Reading the translation aloud gave no audio.");
          error.reason = "read-aloud-failed";
          error.audioStarted = false;
          throw error;
        }
        if (card) {
          card.setTranslatedText(text);
          card.setReplayUrl(URL.createObjectURL(pcm16BytesToWavBlob(concatUint8Arrays(chunks))));
        }
        return { audioChunks: chunks, saidOtherWords };
      };

      // The translation was spoken in full, but its text is missing or stops
      // halfway: Gemini's own transcript of its speech did not arrive. The
      // audio that was played is sent to be written down, and the card only
      // says "listen to it" when that fails too. Runs after the turn is
      // over, so the next sentence does not wait for it.
      // `languages`: the turn's two languages, as the ones the audio may be
      // in. Not forced to the expected one: a sentence said back
      // untranslated must still come out in its own language, so the card
      // does not show a translation that was never spoken.
      const writeDownSpokenTranslation = async (
        card,
        outcome,
        conversationToken,
        { languageA = "", languageB = "", shownTranslation = (text) => String(text || "") } = {}
      ) => {
        const showNotice = () => {
          if (conversationToken !== conversationResetToken) return;
          card.setNotice(
            outcome.textMissing
              ? "This one has no text. Please listen to the translation."
              : "The text is incomplete. Please listen to the translation."
          );
        };
        const played = concatUint8Arrays(outcome.audioChunks || []);
        // Whole 16-bit samples only.
        const audio = played.subarray(0, played.length - (played.length % 2));
        if (!audio.length || audio.length > SPOKEN_TEXT_MAX_AUDIO_BYTES) {
          showNotice();
          return;
        }
        let text = "";
        const abort = new AbortController();
        const abortTimer = window.setTimeout(() => abort.abort(), SPOKEN_TEXT_TIMEOUT_MS);
        try {
          const headers = { "Content-Type": "application/json" };
          const accessToken = siteAccess.token();
          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }
          const response = await fetch("/api/gemini-live/spoken-text", {
            method: "POST",
            headers,
            body: JSON.stringify({
              audioBase64: arrayBufferToBase64(audio),
              languages: [languageA, languageB]
            }),
            signal: abort.signal
          });
          if (response.ok) {
            const data = await response.json().catch(() => null);
            text = String(shownTranslation((data && data.text) || "", true)).trim();
          }
        } catch (error) {
          console.warn("Could not get the text of a spoken translation.", error);
        } finally {
          window.clearTimeout(abortTimer);
        }
        if (conversationToken !== conversationResetToken) return;
        // Text that is shorter than the unfinished one already shown is not
        // the whole sentence either.
        if (!text || text.length < String(outcome.translatedText || "").trim().length) {
          showNotice();
          return;
        }
        card.setTranslatedText(text);
      };

      // The translation came back, but the words the speaker said did not:
      // Gemini's transcript of what it heard is sent apart from the answer and
      // now and then never arrives. The recording is sent to be written down,
      // and the card shows the words once they are back. Runs after the turn
      // is over, so the next sentence does not wait for it; if it fails, the
      // card keeps showing the translation alone.
      // Set once the server says it is not offered here (not on Gemini).
      let heardWordsUnavailable = false;
      // `provisional`: words already on the card that only stand in (heard by
      // a direct attempt that failed); the written-down recording replaces them.
      const writeDownHeardWords = async (
        card,
        recordingBase64,
        conversationToken,
        { provisional = "", languageA = "", languageB = "" } = {}
      ) => {
        if (!card || !recordingBase64 || heardWordsUnavailable) return;
        // The server takes up to 60 s; base64 is 4 characters for 3 bytes.
        if ((recordingBase64.length * 3) / 4 > SPOKEN_TEXT_MAX_AUDIO_BYTES) return;
        let text = "";
        const abort = new AbortController();
        const abortTimer = window.setTimeout(() => abort.abort(), SPOKEN_TEXT_TIMEOUT_MS);
        try {
          const headers = { "Content-Type": "application/json" };
          const accessToken = siteAccess.token();
          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }
          const response = await fetch("/api/gemini-live/spoken-text", {
            method: "POST",
            headers,
            body: JSON.stringify({ audioBase64: recordingBase64, languages: [languageA, languageB] }),
            signal: abort.signal
          });
          if (response.status === 403) heardWordsUnavailable = true;
          if (response.ok) {
            const data = await response.json().catch(() => null);
            text = String((data && data.text) || "").trim();
          }
        } catch (error) {
          console.warn("Could not write down what was said.", error);
        } finally {
          window.clearTimeout(abortTimer);
        }
        if (!text || conversationToken !== conversationResetToken) return;
        // The words may have come in some other way meanwhile.
        const shownWords = card.getHeardText ? card.getHeardText() : "";
        if (shownWords && shownWords !== provisional) return;
        card.setSourceText(text);
      };

      // A press the microphone did not start recording for: counted unless
      // it was turned away for a reason not worth counting (busy, a help
      // window open).
      const noteUnstartedPress = (prepareResult, pressedAt) => {
        const action = prepareResult?.action || "";
        const kind =
          action === MIC_PREPARE_RECORDING_ACTIONS.BLOCKED
            ? prepareResult.blockedBy || ""
            : action === MIC_PREPARE_RECORDING_ACTIONS.PERMISSION_READY
              ? "permission-asked"
              : action
                ? `mic-${action}`
                : "mic-failed";
        if (kind) noteMissedPress(kind, { micWaitMs: performance.now() - pressedAt });
      };

      // `blockedBy` names why a press was turned away, for the turn report
      // (noteUnstartedPress); "" when it is not worth counting.
      const prepareRecordingStart = async () => {
        if (isRecording || processing) {
          return { action: MIC_PREPARE_RECORDING_ACTIONS.BLOCKED, blockedBy: "" };
        }
        if (isMicHelpModalOpen) {
          return { action: MIC_PREPARE_RECORDING_ACTIONS.BLOCKED, blockedBy: "" };
        }
        if (siteAccess.limited()) {
          siteAccess.showLimit();
          return { action: MIC_PREPARE_RECORDING_ACTIONS.BLOCKED, blockedBy: "site-refused" };
        }
        // No connection: say so now, not after a whole sentence.
        if (await connectionIsDown()) {
          setIdleInstructionMode("offline");
          nudgeMicButton();
          return { action: MIC_PREPARE_RECORDING_ACTIONS.BLOCKED, blockedBy: "offline" };
        }
        closeAllPopovers();

        try {
          await siteAccess.ready();
        } catch (error) {
          const message = error instanceof Error ? error.message : "The page could not get ready.";
          console.warn(message);
          return { action: MIC_PREPARE_RECORDING_ACTIONS.BLOCKED, blockedBy: "page-not-ready" };
        }

        const accessToken = siteAccess.token();
        if (siteAccess.required() && !accessToken) {
          siteAccess.invite();
          return { action: MIC_PREPARE_RECORDING_ACTIONS.BLOCKED, blockedBy: "site-refused" };
        }

        const permissionStateBefore = await syncMicrophonePermissionState();
        if (hasDeniedMicPromptThisSession) {
          setMicPermissionStatus(MIC_PERMISSION_STATES.DENIED_SESSION_RELOAD, {
            permissionState: permissionStateBefore,
            errorName: "",
            showNotice: true
          });
          revealConversationIfNeeded();
          return { action: MIC_PREPARE_RECORDING_ACTIONS.SHOW_RELOAD_GUIDANCE };
        }

        if (permissionStateBefore === "denied") {
          setMicPermissionStatus(MIC_PERMISSION_STATES.BLOCKED_SITE_OR_DEVICE, {
            permissionState: permissionStateBefore,
            errorName: "",
            showNotice: true
          });
          revealConversationIfNeeded();
          return { action: MIC_PREPARE_RECORDING_ACTIONS.SHOW_SETTINGS_GUIDANCE };
        }

        const promptWaitStartedAt = performance.now();
        try {
          const justGranted = await ensureAudioPipeline(permissionStateBefore);
          hasDeniedMicPromptThisSession = false;
          setMicPermissionStatus(MIC_PERMISSION_STATES.GRANTED, {
            permissionState: "granted",
            errorName: ""
          });
          if (!isRecordingIntentActive()) {
            keepManualMicrophoneOpen();
            setIdleInstructionMode("permission-granted");
            return {
              action: MIC_PREPARE_RECORDING_ACTIONS.PERMISSION_READY,
              justGranted
            };
          }
          return {
            action: MIC_PREPARE_RECORDING_ACTIONS.START_RECORDING,
            justGranted
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Cannot access microphone.";
          console.warn(message);
          return {
            action: handleMicrophoneAccessFailure({
              permissionStateBefore,
              error,
              waitedMs: performance.now() - promptWaitStartedAt
            }),
            // Counted as a press the microphone failed (noteUnstartedPress).
            blockedBy: `mic-${String((error && error.name) || "failed")
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 24)}`,
            error
          };
        }
      };

      const beginRecordingSession = () => {
        if (isRecording || processing) return false;

        setMicPreparing(false);
        isRecording = true;
        recordingStartedAt = performance.now();
        recordingMicWaitMs = recordingPressAt ? Math.round(recordingStartedAt - recordingPressAt) : null;
        recordingPressAt = 0;
        recordingChunks = [];
        recordingSettlingChunks = 0;
        recordingDuration = 0;
        setIdleInstructionMode("default");

        setRecordingVisualState(true);
        updateActiveSpeakerStyles();
        buildVoiceWaveBars();
        if (recordingDurationEl) recordingDurationEl.textContent = "0.0s";

        if (activeCard) {
          activeCard.dispose();
        }
        activeCard = createResultCard({
          languageA: leftLang.name,
          languageB: rightLang.name
        });
        // Nothing may play into the recording.
        stopStreamingPlayback();
        stopCurrentReplayAudio();
        manualDirectTurn = takeGeminiDirectTurn();
        manualNoDirectReason = manualDirectTurn ? "" : describeMissingDirectTurn();
        manualParallelTurn = startGeminiDirectParallel(manualDirectTurn);
        pulseDevice(15);
        playRecordingCue("start");

        recordingTimer = setInterval(() => {
          recordingDuration += 100;
          if (recordingDurationEl) {
            recordingDurationEl.textContent = formatDuration(recordingDuration);
          }
          updateRecordingLimitCountdown(recordingDuration);
        }, 100);

        scheduleAutoStop();
        return true;
      };

      const startRecording = async (e) => {
        if (activeVoiceMode !== "manual") return;
        if (!e || !e.type.startsWith("key")) return;
        if (!isSpaceKeyEvent(e) || isTypingTarget(e.target)) return;
        // The text bar is up (with or without the keyboard): the record
        // button is hidden, so Space does not record behind it.
        if (document.documentElement.classList.contains("vt-typing")) return;
        e.preventDefault();
        if (e.repeat || keyboardHoldActive || isRecording || processing) return;
        if (!requireLanguagesChosen()) return;

        keyboardHoldActive = true;
        const pressToken = ++keyboardPressToken;
        const pressedAt = performance.now();
        recordingPressAt = pressedAt;
        if (
          idleInstructionMode === "too-short" ||
          idleInstructionMode === "no-audio" ||
          idleInstructionMode === "not-heard" ||
          idleInstructionMode === "offline"
        ) {
          setIdleInstructionMode("default");
        }

        const stopShowingPreparing = showMicPreparing(
          () => keyboardHoldActive && keyboardPressToken === pressToken
        );
        const prepareResult = await prepareRecordingStart();
        stopShowingPreparing();
        if (keyboardPressToken === pressToken || !isRecordingIntentActive()) setMicPreparing(false);
        if (!keyboardHoldActive || keyboardPressToken !== pressToken) {
          // Let go before the microphone was open.
          if (prepareResult?.action === MIC_PREPARE_RECORDING_ACTIONS.START_RECORDING) {
            noteMissedPress("gave-up-opening", { micWaitMs: performance.now() - pressedAt });
          }
          finalizePreparedMicrophoneAttempt(prepareResult);
          return;
        }
        if (prepareResult?.action !== MIC_PREPARE_RECORDING_ACTIONS.START_RECORDING) {
          keyboardHoldActive = false;
          noteUnstartedPress(prepareResult, pressedAt);
          finalizePreparedMicrophoneAttempt(prepareResult);
          return;
        }

        beginRecordingSession();
      };

      // Retry on a card whose recording could not be translated: the same
      // recording goes to the server, which takes it whole. Returns whether
      // the retry was taken (not while another sentence is under way).
      const retryRecordedTurn = async (card, audioBase64) => {
        if (!card || !audioBase64 || isRecording || processing || activeVoiceMode !== "manual") {
          return false;
        }
        // The server translates in the pair chosen now (the pair may have
        // been changed since), so the answer is checked against it too.
        const turnLanguages = { languageA: leftLang.name, languageB: rightLang.name };
        const conversationToken = conversationResetToken;
        processing = true;
        manualProcessingToken = conversationToken;
        if (micBtn) micBtn.classList.add("is-processing");
        pauseMicrophoneForPlayback();
        const retry = () => retryRecordedTurn(card, audioBase64);
        try {
          stopStreamingPlayback();
          stopCurrentReplayAudio();
          const heardBefore = card.getHeardText ? card.getHeardText() : "";
          card.clearFailure();
          card.setTranslatedText("");
          card.setReplayUrl("");
          card.setPhase("translating");
          await ensurePlaybackAudio();
          const outcome = await processTranslation(card, audioBase64, {
            conversationToken,
            heardText: heardBefore
          });
          if (conversationToken !== conversationResetToken) return true;
          noteConnectionWorking();
          if (
            heardTextIsMadeUp({
              sourceText: outcome.sourceText,
              translatedText: outcome.translatedText,
              ...turnLanguages,
              // 24 kHz, 16-bit: 48,000 bytes a second.
              recordingSeconds: (audioBase64.length * 3) / 4 / 48000
            })
          ) {
            // As after a first attempt: noise taken for a sentence.
            stopStreamingPlayback();
            card.dispose();
            setIdleInstructionMode("not-heard");
            nudgeMicButton();
            return true;
          }
          const wrongLanguage = translationCameOutWrong({ ...outcome, ...turnLanguages });
          card.setPhase("result");
          if (wrongLanguage) {
            card.setNotice(wrongAnswerNotice({ ...outcome, ...turnLanguages }));
          } else if (outcome.audioCutShort) {
            card.setNotice("This one was not read aloud in full. Please read the text.");
          } else if (outcome.textMissing || outcome.textIncomplete) {
            void writeDownSpokenTranslation(card, outcome, conversationToken, turnLanguages);
          }
          if (!wrongLanguage && !String(outcome.sourceText || "").trim()) {
            void writeDownHeardWords(card, audioBase64, conversationToken, turnLanguages);
          }
        } catch (error) {
          if (isConversationResetError(error) || conversationToken !== conversationResetToken) {
            return true;
          }
          showTranslationFailure(card, error, { onRetry: retry });
        } finally {
          if (manualProcessingToken === conversationToken) {
            processing = false;
            manualProcessingToken = 0;
            if (micBtn) micBtn.classList.remove("is-processing");
          }
          // Opens the microphone again once the translation has played.
          resumeMicrophoneAfterPlayback();
          refreshTalkModeControls();
        }
        return true;
      };

      const stopRecording = async (e) => {
        if (activeVoiceMode !== "manual") return;
        if (e && e.type.startsWith("key")) {
          if (!isSpaceKeyEvent(e) || isTypingTarget(e.target)) return;
          e.preventDefault();
          keyboardHoldActive = false;
          keyboardPressToken += 1;
          if (!isRecording) {
            setMicPreparing(false);
            releasePreparedMicrophoneIfIdle({ keepOpen: true });
            return;
          }
        }

        if (!isRecording) return;
        const durationAtStop = recordingDuration;
        const micWaitAtStop = recordingMicWaitMs;
        recordingMicWaitMs = null;
        const chunks = recordingChunks;
        const settlingChunks = recordingSettlingChunks;
        const directTurn = manualDirectTurn;
        const noDirectReason = manualNoDirectReason;
        const parallelTurn = manualParallelTurn;
        manualParallelTurn = null;
        manualNoDirectReason = "";

        isRecording = false;
        recordingChunks = [];
        recordingSettlingChunks = 0;
        manualDirectTurn = null;
        clearAutoStopTimer();
        keepManualMicrophoneOpen();
        pulseDevice(10);
        const stopCuePlayed = playRecordingCue("stop");

        clearInterval(recordingTimer);
        recordingTimer = null;

        setRecordingVisualState(false);
        updateActiveSpeakerStyles();
        if (micBtn) {
          micBtn.style.transform = "";
        }
        if (recordingDurationEl) recordingDurationEl.textContent = "0.0s";
        recordingDuration = 0;

        if (!chunks.length || durationAtStop < MIN_RECORDING_MS) {
          if (directTurn) {
            directTurn.session.cancel();
          }
          if (parallelTurn) {
            parallelTurn.session.cancel();
          }
          prepareGeminiDirectStandby();
          noteMissedPress(!chunks.length && durationAtStop >= MIN_RECORDING_MS ? "no-sound-in" : "too-short", {
            micWaitMs: micWaitAtStop,
            heldMs: durationAtStop
          });
          if (!chunks.length && durationAtStop >= MIN_RECORDING_MS) {
            // Held long enough, yet no sound came in: the page's audio was
            // not running. Close everything so the next press starts afresh.
            releaseMicrophoneStream();
            closeAudioContext();
            setIdleInstructionMode("no-audio");
          } else {
            setIdleInstructionMode("too-short");
            nudgeMicButton();
          }
          if (activeCard) {
            activeCard.dispose();
            activeCard = null;
          }
          return;
        }
        if (recordingIsSilent(chunks, inputSampleRate, settlingChunks)) {
          // The microphone works, there was just nothing to hear.
          console.warn("Nothing was said in this recording, not translating it.", {
            durationMs: durationAtStop,
            settlingChunks,
            // For setting the level from real use: the loudest frame.
            loudestRms: Number(
              chunks.reduce((max, chunk) => Math.max(max, calculateFloat32Rms(chunk)), 0).toFixed(4)
            )
          });
          noteMissedPress("silent", { micWaitMs: micWaitAtStop, heldMs: durationAtStop });
          if (directTurn) {
            directTurn.session.cancel();
          }
          if (parallelTurn) {
            parallelTurn.session.cancel();
          }
          prepareGeminiDirectStandby();
          setIdleInstructionMode("no-audio");
          nudgeMicButton();
          if (activeCard) {
            activeCard.dispose();
            activeCard = null;
          }
          return;
        }
        // Get the next session connecting now, so it is ready by the time
        // this turn has finished playing.
        prepareGeminiDirectStandby();

        const conversationToken = conversationResetToken;
        processing = true;
        manualProcessingToken = conversationToken;
        if (micBtn) micBtn.classList.add("is-processing");
        // Close the microphone now, while the translation is on its way, so
        // the phone has left its phone-call sound before anything plays. If
        // the stop chime is playing, once it has finished: on an iPhone the
        // switch out of the phone-call sound made the chime much quieter
        // (tried on a real phone on 2026-11-17). The translation is
        // never back that soon; should this turn be over by then, the
        // microphone simply stays open as after any turn.
        if (stopCuePlayed) {
          window.setTimeout(() => {
            if (processing && manualProcessingToken === conversationToken) {
              pauseMicrophoneForPlayback();
            }
          }, RECORDING_CUE_MS);
        } else {
          pauseMicrophoneForPlayback();
        }

        const card = activeCard;
        const turnLanguages = directTurn
          ? { languageA: directTurn.languageA, languageB: directTurn.languageB }
          : { languageA: leftLang.name, languageB: rightLang.name };
        let recordedAudioBase64 = "";
        const getRecordedAudioBase64 = () => {
          if (!recordedAudioBase64) {
            const merged = mergeFloat32(chunks);
            const downsampled = downsampleFloat32(merged, inputSampleRate, 24000);
            const pcm = floatTo16BitPCM(downsampled);
            recordedAudioBase64 = arrayBufferToBase64(pcm.buffer);
          }
          return recordedAudioBase64;
        };
        // How long the speaker waits, attempt by attempt (see sendTurnReport).
        const turnTimer = createTurnTimer();
        // Worked out once the turn is over (see describeRecordingSpeech), so
        // that it adds nothing to the wait.
        const sampleRateAtStop = inputSampleRate;
        let turnOutcome = "error";
        // What was heard and said in the end, and every answer thrown away
        // on the way (see sendTurnReport).
        let finalWords = null;
        const thrownAway = [];
        // (Cut to the length the server keeps.)
        const TURN_TEXT_MAX_LENGTH = 1000;
        const noteThrownAway = (path, result, translatedText) => {
          thrownAway.push({ path, result, translated: String(translatedText || "").slice(0, TURN_TEXT_MAX_LENGTH) });
        };
        // Letting go -> first sound of the second connection's answer (kept
        // while the first was tried, see holdDirectAnswer, or played); null
        // if it never spoke.
        let parallelSoundMs = null;
        // Answers to this recording that Gemini got wrong: no sound at all,
        // or an answer thrown away (said back untranslated, in another
        // language, its voice stopped halfway). When Gemini fails a sentence
        // it tends to fail it on every connection: on 2026-11-17/18, five
        // times the first two were both silent, and each time so was the
        // backup (another 2.7 s), and the server's own Gemini half the time
        // (up to 7 s more, then OpenAI): 9-16 s before anything was heard;
        // and twice one said it back and the next stopped speaking halfway.
        // After two such answers no new Gemini attempt is started: the
        // server goes straight to OpenAI.
        let geminiBadAnswers = 0;
        const geminiFailedTwice = () => geminiBadAnswers >= 2;
        const runDirectAttempt = async (path, turn, options) => {
          const attempt = turnTimer.start(path);
          try {
            const result = await processDirectTranslation(card, turn, {
              ...options,
              conversationToken,
              onFirstAudio: () => {
                turnTimer.heard(attempt);
                if (turn === parallelTurn && parallelSoundMs === null) parallelSoundMs = turnTimer.elapsed();
              }
            });
            turnTimer.finish(attempt, "ok");
            return result;
          } catch (error) {
            const result = turn.overtaken ? "overtaken" : describeAttemptFailure(error);
            turnTimer.finish(attempt, result);
            // One given up because the other spoke first had been silent
            // until then: should that other answer prove no good, both
            // connections have failed the sentence, and no third Gemini
            // session is started. Of 8 such backups on 2026-11-17/18, 2
            // spoke; the other 6 added about 2.7 s before OpenAI was asked.
            if (GEMINI_SILENT_RESULTS.has(result) || result === "overtaken") geminiBadAnswers += 1;
            throw error;
          } finally {
            const lease = turn.session.getLease();
            if (lease) attempt.requestId = lease.leaseId;
          }
        };
        const runServerAttempt = async (options = {}) => {
          const engine = geminiFailedTwice() ? "openai" : "";
          // Counted apart in the turn report (scripts/turn-wait-report.js).
          const attempt = turnTimer.start(engine ? "server-openai" : "server");
          try {
            const result = await processTranslation(card, getRecordedAudioBase64(), {
              ...options,
              engine,
              conversationToken,
              onFirstAudio: () => turnTimer.heard(attempt),
              onRequestId: (requestId) => {
                attempt.requestId = requestId;
              },
              // Named in the turn report only: the report is added to the
              // record of a request the server has finished with.
              onRequestAccepted: (requestId) => {
                attempt.acceptedRequestId = requestId;
              }
            });
            turnTimer.finish(attempt, "ok");
            return result;
          } catch (error) {
            turnTimer.finish(attempt, describeAttemptFailure(error));
            throw error;
          }
        };
        // A direct attempt failed before any translated speech, or its
        // answer is being thrown away. First the connection that heard the
        // same press (it only has to be told the turn is over), then the
        // one kept waiting for the next press (it is sent the recording; no
        // upload, no new connection). Returns the outcome, or null when
        // neither is there or both failed before any speech (the server is
        // asked then).
        let unusedParallelTurn = parallelTurn;
        // A direct attempt that brought the translation as text alone: it is
        // read aloud (once a turn) instead of asking Gemini again. Returns
        // the outcome, or null when that does not apply or does not work.
        let readAloudTried = false;
        const tryReadAloud = async (failure) => {
          if (readAloudTried || !failure) return null;
          // Without the heard words a sentence said back untranslated
          // cannot be told from a translation, so it is not read out.
          const heardText = String(failure.heardText || failure.sourceText || "").trim();
          if (!heardText) return null;
          const text = textOnlyTranslation(failure, { sourceText: heardText, ...turnLanguages });
          if (!text) return null;
          readAloudTried = true;
          const textOutcome = (audioChunks, extra = {}) => ({
            sourceText: heardText,
            translatedText: text,
            textMissing: false,
            textIncomplete: false,
            audioCutShort: false,
            audioChunks,
            ...extra
          });
          // The heard words on the card stood in while this was decided
          // (card.markUpdating); they belong to this translation, so they
          // stay.
          const keepWords = () => {
            if (!card) return;
            card.setSourceText(heardText);
            card.setTranslatedText(text);
          };
          if (soundIsOff()) {
            // Nothing would be heard: the words are all that is wanted.
            keepWords();
            return textOutcome([]);
          }
          const attempt = turnTimer.start("read-aloud");
          try {
            const { audioChunks, saidOtherWords } = await readTranslationAloud(card, text, {
              conversationToken,
              onFirstAudio: () => turnTimer.heard(attempt)
            });
            // Counted apart: the reader's own transcript differs from the text.
            turnTimer.finish(attempt, saidOtherWords ? "said-other-words" : "ok");
            keepWords();
            return textOutcome(audioChunks);
          } catch (error) {
            turnTimer.finish(attempt, describeAttemptFailure(error));
            if (isConversationResetError(error) || conversationToken !== conversationResetToken) {
              throw error;
            }
            if (error && error.audioStarted) {
              // Part of it was heard: the whole text stays on the card,
              // with a note that the voice stopped.
              keepWords();
              return textOutcome(error.audioChunks || [], { readAloudBrokeOff: true });
            }
            console.warn("Reading the translation aloud failed.", error);
            return null;
          }
        };
        const tryDirectRetry = async (path, turn, options) => {
          try {
            return await runDirectAttempt(path, turn, options);
          } catch (error) {
            if (
              isConversationResetError(error) ||
              conversationToken !== conversationResetToken ||
              (error && error.audioStarted)
            ) {
              throw error;
            }
            console.warn(`Direct attempt (${path}) failed too.`, error);
            return tryReadAloud(error);
          }
        };
        // A kept answer seen to be no good before it was played: it is not
        // played, and counts as one more answer Gemini got wrong. Reported
        // as an attempt that ended at once ("skipped-cut-short", ...).
        const skipHeldAnswer = (path, turn, fault) => {
          const held = turn.held;
          noteThrownAway(
            path,
            `skipped-${fault}`,
            held ? (held.result && held.result.translatedText) || held.translatedText : ""
          );
          turn.session.cancel();
          const attempt = turnTimer.start(path);
          turnTimer.finish(attempt, `skipped-${fault}`);
          geminiBadAnswers += 1;
        };
        // The connection kept waiting, sent the recording as soon as the
        // second answer was seen going wrong while the first had not spoken
        // (19:17 on 2026-11-18: the first stayed silent until its wait ran
        // out at 2.6 s, and only then was the backup asked, heard at 5.0 s).
        // Its answer is kept like the second one's.
        let earlyBackup = null;
        const startEarlyBackup = () => {
          if (earlyBackup || geminiFailedTwice()) return;
          const backup = takeGeminiDirectBackup(turnLanguages);
          if (!backup) return;
          sendRecordingToDirectTurn(backup, chunks);
          holdDirectAnswer(backup);
          earlyBackup = backup;
        };
        // `readyOnly`: the first attempt failed for want of a connection. The
        // others were opened at the same moment over the same network, and
        // one still connecting would only add its own wait for it.
        const tryBackupAttempt = async (options, { readyOnly = false } = {}) => {
          const parallel = unusedParallelTurn;
          unusedParallelTurn = null;
          // One already told the turn is over that has started answering is
          // no slower than any other (a finished one is no longer "ready").
          // One still connecting is not waited for.
          const heldAnswerStarted = Boolean(parallel && parallel.held && parallel.held.events.length);
          const parallelFault = parallel ? heldAnswerFault(parallel.held, turnLanguages) : "";
          if (parallelFault) {
            skipHeldAnswer("parallel", parallel, parallelFault);
          } else if (parallel && (!readyOnly || heldAnswerStarted || parallel.session.isReady())) {
            const outcome = await tryDirectRetry("parallel", parallel, options);
            if (outcome) return outcome;
          } else if (parallel) {
            parallel.session.cancel();
          }
          // A backup already on its way is used however many answers went
          // wrong: it is nearer an answer than anything asked now.
          const early = earlyBackup;
          earlyBackup = null;
          if (early) {
            const earlyFault = heldAnswerFault(early.held, turnLanguages);
            if (!earlyFault) return tryDirectRetry("backup", early, options);
            skipHeldAnswer("backup", early, earlyFault);
            return null;
          }
          // Gemini is not asked a third time (see geminiBadAnswers); the
          // backup stays for the next press.
          if (geminiFailedTwice()) return null;
          const backup = takeGeminiDirectBackup(turnLanguages, { readyOnly });
          if (!backup) return null;
          sendRecordingToDirectTurn(backup, chunks);
          return tryDirectRetry("backup", backup, options);
        };
        try {
          if (card) card.setPhase("translating");
          let handledDirectly = false;
          let outcome = null;
          // Words heard by a direct attempt that then failed (see below).
          let provisionalHeardText = "";
          if (directTurn) {
            const firstAttemptOptions = { stopIfNotTranslated: true, stopIfHeardOutsidePair: true };
            // The second connection answers too, from the same moment, and
            // its answer is kept (holdDirectAnswer). Whichever speaks first
            // is heard: should it speak while the first has not, the first
            // is given up and this one played. Both heard the same speech
            // through the same model; the one that is slower that time
            // (a first sound at 2.3 s against a usual 1.0 s, or none) no
            // longer holds up the turn.
            let firstAttemptRunning = true;
            if (parallelTurn) {
              holdDirectAnswer(parallelTurn, {
                onFirstSound: () => {
                  parallelSoundMs = turnTimer.elapsed();
                  const held = parallelTurn.held;
                  // Not for an answer already seen to be thrown away (heard
                  // as some other language, or said back untranslated): the
                  // first may yet bring a good one.
                  const keptLooksWrong = !held || Boolean(heldAnswerFault(held, turnLanguages));
                  const firstStillSilent =
                    firstAttemptRunning &&
                    unusedParallelTurn === parallelTurn &&
                    !(directTurn.session.getUsage().outputSeconds > 0);
                  if (
                    !keptLooksWrong &&
                    firstAttemptRunning &&
                    unusedParallelTurn === parallelTurn &&
                    !(directTurn.session.getUsage().outputSeconds > 0)
                  ) {
                    directTurn.overtaken = true;
                    directTurn.session.cancel();
                  } else if (held && keptLooksWrong && firstStillSilent) {
                    // Should the first fail too, the next answer is already
                    // on its way.
                    startEarlyBackup();
                  }
                }
              });
            }
            try {
              try {
                outcome = await runDirectAttempt("direct", directTurn, firstAttemptOptions);
              } finally {
                firstAttemptRunning = false;
              }
              handledDirectly = true;
            } catch (error) {
              // Once any translated audio has played, a second attempt would
              // make the listener hear the sentence twice.
              if (
                isConversationResetError(error) ||
                conversationToken !== conversationResetToken ||
                (error && error.audioStarted)
              ) {
                throw error;
              }
              const overtaken = Boolean(directTurn.overtaken);
              if (!overtaken) console.warn("Direct translation failed, trying again.", error);
              if (card) {
                // What the card shows stays on it while the recording is
                // translated again: taking the words away and bringing them
                // back seconds later looked like a fault. They may stop
                // halfway, so they shimmer and only stand in until the new
                // words (or the written-down recording) arrive; whatever is
                // not replaced is taken away at the end.
                provisionalHeardText = card.getHeardText ? card.getHeardText() : "";
                card.markUpdating();
              }
              const backupOptions = {
                readyOnly: CONNECTION_FAILURE_REASONS.has(error && error.reason)
              };
              // A kept answer that is already speaking is played before the
              // first one's words are read aloud: it is there now, in
              // Gemini's own voice.
              // (Not one already seen to be no good: it will not be played.)
              const keptAnswerSpeaking =
                overtaken ||
                Boolean(
                  parallelTurn &&
                    parallelSoundMs !== null &&
                    !heldAnswerFault(parallelTurn.held, turnLanguages)
                );
              outcome = keptAnswerSpeaking
                ? (await tryBackupAttempt(firstAttemptOptions, backupOptions)) || (await tryReadAloud(error))
                : (await tryReadAloud(error)) || (await tryBackupAttempt(firstAttemptOptions, backupOptions));
              handledDirectly = Boolean(outcome);
              // Only a turn the direct path could not finish at all counts
              // towards resting it. A first answer that came without a voice,
              // too late or cut short is Gemini's doing on that one session,
              // and the voice read aloud or the second connection still
              // finished the turn in a second or two; counting those, three
              // of them within two minutes (2026-11-17) switched the direct
              // path off and the next sentence waited 7.6 s on the server.
              if (handledDirectly) {
                geminiDirectFailures = 0;
              } else {
                geminiDirectFailures += 1;
                if (geminiDirectFailures >= GEMINI_DIRECT_MAX_FAILURES) {
                  disableGeminiDirect();
                }
              }
            }
          }
          if (!handledDirectly) {
            outcome = await runServerAttempt();
          }
          if (conversationToken !== conversationResetToken) {
            return;
          }
          noteConnectionWorking();
          // How much sound was recorded (the microphone may have opened late).
          const recordingSeconds = sampleRateAtStop
            ? chunks.reduce((sum, chunk) => sum + chunk.length, 0) / sampleRateAtStop
            : 0;
          const madeUpTurn = {
            sourceText: outcome.sourceText,
            translatedText: outcome.translatedText,
            ...turnLanguages
          };
          if (heardTextIsMadeUp({ ...madeUpTurn, recordingSeconds })) {
            // Speech too quiet to make out, or noise, and a sentence made up
            // from it: no card, no second attempt at translating it, and a
            // request to say it again. "too-long": made up because no one
            // could say that much in the time the button was held.
            const madeUpReason = heardTextIsMadeUp(madeUpTurn) ? "made-up" : "too-long";
            console.warn(
              madeUpReason === "too-long"
                ? "Translation is far longer than the recording, dropping the turn."
                : "Heard text is in a language outside the pair, dropping the turn.",
              {
                ...turnLanguages,
                recordingSeconds: Math.round(recordingSeconds * 100) / 100,
                heard: outcome.sourceText,
                translated: outcome.translatedText,
                // For checking the silence level against real use: how loud
                // the first second was, frame by frame, and how much of it
                // was taken while the microphone was settling.
                settlingChunks,
                firstLevels: chunks
                  .slice(0, 12)
                  .map((chunk) => Number(calculateFloat32Rms(chunk).toFixed(4)))
              }
            );
            turnTimer.reject(madeUpReason);
            turnOutcome = madeUpReason;
            finalWords = { heard: outcome.sourceText, translated: outcome.translatedText };
            stopStreamingPlayback();
            if (card) card.dispose();
            if (activeCard === card) activeCard = null;
            setIdleInstructionMode("not-heard");
            nudgeMicButton();
            return;
          }
          // `stoppedEarly`: already seen to be untranslated and stopped halfway.
          let wrongLanguage =
            outcome.stoppedEarly || translationCameOutWrong({ ...outcome, ...turnLanguages });
          // Gemini stopped speaking long before the end of its own text, so
          // the listener heard a second of the sentence at most.
          let cutShort = !wrongLanguage && outcome.audioCutShort;
          // Whether the answer in hand came from a Gemini connection on the
          // page (else from the server, see outcome.engine).
          let answerViaDirect = handledDirectly;
          // The answer is in a language outside the chosen pair, the
          // sentence was repeated untranslated, or it was not read out to
          // the end. Stop it being read out and translate the same
          // recording again: on another connection if there is one, else
          // on the server. Twice at most: an answer Gemini got wrong a
          // second time is made once more by OpenAI (geminiFailedTwice); a
          // remade answer from OpenAI is the last.
          for (let remade = 0; (wrongLanguage || cutShort) && remade < 2; remade += 1) {
            const viaOpenAI = !answerViaDirect && outcome.engine === "openai";
            if (remade > 0 && viaOpenAI) break;
            console.warn(
              cutShort
                ? "Translation was not read out to the end, translating again."
                : "Translation came out in the wrong language, translating again.",
              {
                ...turnLanguages,
                translatedText: outcome.translatedText
              }
            );
            const rejected = describeRejectedTranslation({
              outcome,
              cutShort,
              viaDirect: answerViaDirect,
              ...turnLanguages
            });
            turnTimer.reject(rejected.reason);
            const rejectedAttempt = turnTimer.attempts[turnTimer.attempts.length - 1];
            noteThrownAway(rejectedAttempt ? rejectedAttempt.path : "", rejected.reason, outcome.translatedText);
            if (!viaOpenAI) geminiBadAnswers += 1;
            const heardBefore = outcome.sourceText;
            stopStreamingPlayback();
            if (card) {
              card.setTranslatedText("");
              card.setReplayUrl("");
              card.setPhase("translating");
            }
            // One said back again is stopped as soon as that shows, as the
            // first was.
            const again = await tryBackupAttempt({ stopIfNotTranslated: true });
            if (again) {
              outcome = again;
              // The second answer may come without the heard words.
              if (!String(outcome.sourceText || "").trim()) outcome.sourceText = heardBefore;
            } else {
              outcome = await runServerAttempt({ heardText: heardBefore, retry: rejected });
            }
            answerViaDirect = Boolean(again);
            if (conversationToken !== conversationResetToken) {
              return;
            }
            wrongLanguage =
              outcome.stoppedEarly || translationCameOutWrong({ ...outcome, ...turnLanguages });
            cutShort = !wrongLanguage && outcome.audioCutShort;
          }
          turnOutcome = wrongLanguage ? "not-translated" : cutShort ? "cut-short" : "ok";
          if (turnOutcome !== "ok") turnTimer.reject(turnOutcome);
          finalWords = { heard: outcome.sourceText, translated: outcome.translatedText };
          if (card) card.setPhase("result");
          if (card && wrongLanguage) {
            card.setNotice(
              outcome.stoppedEarly
                ? "This one was not translated. Please say it again."
                : wrongAnswerNotice({ ...outcome, ...turnLanguages })
            );
          } else if (card && (cutShort || (outcome && outcome.readAloudBrokeOff))) {
            // Cut short on the second try too (or the reading aloud broke
            // off): the text is whole, the voice is not.
            card.setNotice("This one was not read aloud in full. Please read the text.");
          } else if (card && outcome && (outcome.textMissing || outcome.textIncomplete)) {
            void writeDownSpokenTranslation(card, outcome, conversationToken, turnLanguages);
          }
          if (card && outcome && !wrongLanguage && !String(outcome.sourceText || "").trim()) {
            void writeDownHeardWords(card, getRecordedAudioBase64(), conversationToken, {
              provisional: provisionalHeardText,
              ...turnLanguages
            }).finally(() => {
              if (conversationToken === conversationResetToken) card.dropUpdating();
            });
          } else if (card) {
            card.dropUpdating();
          }
        } catch (error) {
          if (isConversationResetError(error) || conversationToken !== conversationResetToken) {
            return;
          }
          if (card) card.dropUpdating();
          // The recording stays with the card: Retry sends it again, so
          // nobody has to say the sentence a second time.
          const audioBase64 = getRecordedAudioBase64();
          const retry = () => retryRecordedTurn(card, audioBase64);
          showTranslationFailure(card, error, { onRetry: retry });
        } finally {
          // Not needed: the first answer was used.
          if (unusedParallelTurn) unusedParallelTurn.session.cancel();
          if (earlyBackup) earlyBackup.session.cancel();
          if (conversationToken === conversationResetToken) {
            const reportId = sendTurnReport(turnTimer, {
              recordingMs: durationAtStop,
              outcome: turnOutcome,
              noDirect: directTurn ? "" : noDirectReason,
              ...(directTurn && parallelTurn ? { parallelSoundMs } : {}),
              speech: describeRecordingSpeech(chunks, sampleRateAtStop, settlingChunks),
              directWait: directTurn ? directTurn.waitAtPress : null,
              micWaitMs: micWaitAtStop,
              text: {
                heard: String((finalWords && finalWords.heard) || (card && card.getHeardText()) || "").slice(
                  0,
                  TURN_TEXT_MAX_LENGTH
                ),
                translated: String((finalWords && finalWords.translated) || "").slice(0, TURN_TEXT_MAX_LENGTH),
                thrownAway
              }
            });
            if (card && reportId) cardReportIds.set(card, reportId);
            reportPlaybackFor(reportId);
          }
          if (manualProcessingToken === conversationToken) {
            processing = false;
            manualProcessingToken = 0;
            if (micBtn) micBtn.classList.remove("is-processing");
          }
          if (activeCard === card) {
            activeCard = null;
          }
          if (activeVoiceMode === "manual" && !isRecording) {
            if (micPausedForPlayback) {
              // Opens the microphone again once the translation has played.
              resumeMicrophoneAfterPlayback();
            } else {
              // Count the wait from the end of the translation.
              keepManualMicrophoneOpen();
            }
          }
        }
      };

      // The start that a tap or press began is given up before the
      // microphone is open.
      const cancelTapStart = () => {
        tapStartActive = false;
        tapStartToken += 1;
        setMicPreparing(false);
        releasePreparedMicrophoneIfIdle({ keepOpen: true });
      };

      // Push to Talk, two ways on the same button. A tap starts a recording
      // and the next tap stops it and translates. A press that is held
      // records for as long as it is held and translates when the finger
      // lifts (onMicPressEnd); a finger lifted before the microphone was
      // open counts as a tap. Either way the recording starts the moment
      // the finger touches the button, so the button changes at once. (Space
      // on a keyboard is held while speaking.) On an iPhone only a tap or a
      // short press gets a buzz; see attachIPhoneTapTick.
      const onMicTap = async () => {
        if (activeVoiceMode !== "manual" || processing) {
          return;
        }

        if (isRecording) {
          tapStartActive = false;
          await stopRecording();
          return;
        }

        if (tapStartActive) {
          // Tapped again while the microphone was still opening: leave it.
          cancelTapStart();
          return;
        }

        tapStartActive = true;
        const startToken = ++tapStartToken;
        const pressedAt = performance.now();
        recordingPressAt = pressedAt;
        if (
          idleInstructionMode === "too-short" ||
          idleInstructionMode === "no-audio" ||
          idleInstructionMode === "not-heard" ||
          idleInstructionMode === "offline"
        ) {
          setIdleInstructionMode("default");
        }

        const stopShowingPreparing = showMicPreparing(
          () => tapStartActive && tapStartToken === startToken
        );
        const prepareResult = await prepareRecordingStart();
        stopShowingPreparing();
        if (tapStartToken === startToken || !isRecordingIntentActive()) setMicPreparing(false);
        if (!tapStartActive || tapStartToken !== startToken) {
          // Tapped again before the microphone was open.
          if (prepareResult?.action === MIC_PREPARE_RECORDING_ACTIONS.START_RECORDING) {
            noteMissedPress("gave-up-opening", { micWaitMs: performance.now() - pressedAt });
          }
          finalizePreparedMicrophoneAttempt(prepareResult);
          return;
        }
        tapStartActive = false;
        if (prepareResult?.action !== MIC_PREPARE_RECORDING_ACTIONS.START_RECORDING) {
          noteUnstartedPress(prepareResult, pressedAt);
          finalizePreparedMicrophoneAttempt(prepareResult);
          return;
        }

        beginRecordingSession();
      };

      // An iPhone drops the click of a tap during which a button appears on
      // screen: it takes the tap for a hover over that new button. Ending a
      // recording brings back the sound switch and the keyboard beside the
      // record button (talk-mode.css hides them while recording), so the tap
      // that stopped a recording lost its click and with it the tick (see
      // attachIPhoneTapTick). Tried on a real iPhone on 2026-11-17: a
      // tap that makes a button next to it appear, by visibility or by
      // opacity, has its click dropped; one that brings the button back only
      // once the click has come ticks every time. So on an iPhone they stay
      // hidden (vt-side-wait) until that tap's click has come, or, should no
      // click come, a moment after the finger lifts.
      const SIDE_BUTTONS_FALLBACK_MS = 600;
      let tapTickCover = null;
      let sideButtonsWaiting = false;
      let sideButtonsTimer = null;

      const releaseSideButtons = () => {
        if (sideButtonsTimer) window.clearTimeout(sideButtonsTimer);
        sideButtonsTimer = null;
        if (!sideButtonsWaiting) return;
        sideButtonsWaiting = false;
        if (micBtn) micBtn.classList.remove("vt-side-wait");
      };

      const holdSideButtons = () => {
        if (!tapTickCover || !micBtn) return;
        if (sideButtonsTimer) window.clearTimeout(sideButtonsTimer);
        sideButtonsTimer = null;
        sideButtonsWaiting = true;
        micBtn.classList.add("vt-side-wait");
      };

      // The finger has lifted: the click, if one comes, comes right after.
      const releaseSideButtonsSoon = () => {
        if (!sideButtonsWaiting || sideButtonsTimer) return;
        sideButtonsTimer = window.setTimeout(releaseSideButtons, SIDE_BUTTONS_FALLBACK_MS);
      };

      // The finger that started a recording has lifted (or the phone took the
      // touch away). A tap, or a finger lifted before the recording had
      // started: the recording goes on until the next tap. A press held on
      // while recording ends here: stop and translate.
      const onMicPressEnd = (event) => {
        if (!micPress || event.pointerId !== micPress.pointerId) return;
        const press = micPress;
        micPress = null;
        if (activeVoiceMode !== "manual" || !isRecording) return;
        const held = pressHeldRecording({
          pressedAt: press.pressedAt,
          liftedAt: pointerEventTime(event),
          recordingStartedAt
        });
        if (!held) return;
        // A held press sometimes still gets its click (and tick) as it lifts.
        holdSideButtons();
        void stopRecording();
      };

      // iPhones give web pages no way to vibrate (no navigator.vibrate). The
      // one buzz a page gets there is the tick iOS plays when a person's own
      // tap flips a native switch (<input type="checkbox" switch>, iOS 17.4
      // and later, with System Haptics on). So an invisible label tied to a
      // hidden switch covers the button: each tap flips the switch as the
      // finger lifts and the phone ticks (the recording itself is started or
      // stopped by the touch before it, see onMicTap). Tried on
      // an iPhone with iOS 27: a tap ticks every time, a press held longer
      // than about a second does not, and a switch flipped by script never
      // does. Android buzzes with navigator.vibrate (pulseDevice) instead.
      // Set by each touch on the button: whether that tap did something and
      // so should tick as the finger lifts.
      let micTapTicks = false;

      const attachIPhoneTapTick = (button) => {
        if (!button || typeof navigator.vibrate === "function") return;
        if (!/iPhone|iPod/.test(navigator.userAgent || "")) return;
        if (typeof HTMLInputElement === "undefined" || !("switch" in HTMLInputElement.prototype)) {
          return;
        }
        const cover = document.createElement("label");
        cover.className = "vt-tap-tick";
        cover.setAttribute("aria-hidden", "true");
        cover.style.cssText =
          "position:absolute;inset:0;margin:0;padding:0;border-radius:inherit;opacity:0;cursor:inherit;pointer-events:auto;";
        // pointer-events:auto: a tap that stops a recording puts the button
        // into is-processing (pointer-events: none) before the finger lifts,
        // and that tap must still reach the label to tick. A tap that did
        // nothing (say, during a translation) is kept from flipping the
        // switch, so it does not tick.
        cover.addEventListener("click", (event) => {
          if (event.target !== cover) return;
          if (!micTapTicks) event.preventDefault();
          micTapTicks = false;
          // After this click has flipped the switch (and ticked).
          if (sideButtonsWaiting) window.setTimeout(releaseSideButtons, 0);
        });
        const tickSwitch = document.createElement("input");
        tickSwitch.type = "checkbox";
        tickSwitch.setAttribute("switch", "");
        tickSwitch.tabIndex = -1;
        tickSwitch.style.cssText =
          "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);opacity:0;";
        // The label hands the tap on to the switch as a second click. That
        // one must stop at the switch, or a tap would count twice.
        tickSwitch.addEventListener("click", (event) => event.stopPropagation());
        tickSwitch.addEventListener("change", (event) => event.stopPropagation());
        cover.appendChild(tickSwitch);
        button.appendChild(cover);
        tapTickCover = cover;
      };

      if (micBtn) {
        attachIPhoneTapTick(micBtn);
        micBtn.addEventListener("pointerdown", (event) => {
          if ((event.pointerType === "mouse" && event.button !== 0) || event.isPrimary === false) {
            return;
          }
          // The language list opens instead. Asked here and again on the
          // click (below): on an iPhone the click can get lost when the
          // full screen opens during the tap.
          if (!languagesChosen()) {
            micTapTicks = false;
            micPress = null;
            requireLanguagesChosen();
            return;
          }
          // This tap ends a recording (or a microphone still opening), which
          // brings the side buttons back: not before its click (see
          // holdSideButtons).
          if (micBtn.classList.contains("is-recording") || micBtn.classList.contains("is-preparing")) {
            holdSideButtons();
          }
          // No preventDefault here: on an iPhone the click that follows
          // must reach the label above, which flips its switch and ticks.
          micTapTicks = activeVoiceMode === "manual" && !processing;
          // Only the press that starts a recording can turn into a held
          // press; one that stops a recording is just a tap.
          micPress =
            micTapTicks && !isRecording && !tapStartActive
              ? { pointerId: event.pointerId, pressedAt: pointerEventTime(event) }
              : null;
          void onMicTap();
        });
        // On the window, not the button: the finger may have slid off it.
        // (No pointer capture: on an iPhone the click must stay with the
        // label that ticks.)
        window.addEventListener("pointerup", onMicPressEnd);
        window.addEventListener("pointercancel", onMicPressEnd);
        // After onMicPressEnd, which may have just held them.
        window.addEventListener("pointerup", releaseSideButtonsSoon);
        window.addEventListener("pointercancel", releaseSideButtonsSoon);
        micBtn.addEventListener("click", (event) => {
          if (languagesChosen()) return;
          // A side is still unset: no recording, its list opens instead.
          event.preventDefault();
          event.stopImmediatePropagation();
          requireLanguagesChosen();
        });
        micBtn.addEventListener("click", (event) => {
          if (activeVoiceMode !== "auto" || !autoVoiceModeAccessAllowed) return;
          event.preventDefault();
          if (autoModeEnabled) {
            void stopAutoListening();
            return;
          }
          void startAutoListening();
        });
      }

      if (voiceModeManualBtn) {
        voiceModeManualBtn.addEventListener("click", () => {
          void switchVoiceMode("manual");
        });
      }

      if (voiceModeAutoBtn) {
        voiceModeAutoBtn.addEventListener("click", () => {
          void switchVoiceMode("auto");
        });
      }

      if (micPermissionRefreshBtn) {
        micPermissionRefreshBtn.addEventListener("click", () => {
          window.location.reload();
        });
      }

      if (micPermissionHelpBtn) {
        micPermissionHelpBtn.addEventListener("click", () => {
          setMicHelpModalOpen(true);
        });
      }

      if (closeMicHelpModalBtn) {
        closeMicHelpModalBtn.addEventListener("click", () => {
          setMicHelpModalOpen(false);
        });
      }

      if (micHelpModalBackdrop) {
        micHelpModalBackdrop.addEventListener("click", (event) => {
          if (event.target === micHelpModalBackdrop) {
            setMicHelpModalOpen(false);
          }
        });
      }

      if (micHelpModal) {
        micHelpModal.addEventListener("click", (event) => {
          event.stopPropagation();
        });
      }

      window.addEventListener("blur", () => {
        micPress = null;
        keyboardHoldActive = false;
        keyboardPressToken += 1;
        // The browser's microphone prompt can take the focus from the page
        // (the iPhone's does). A tap waiting for that answer goes on: once
        // the person allows, the recording starts.
        if (!(microphoneRequest && !mediaStream && tapStartActive)) {
          setMicPreparing(false);
          tapStartActive = false;
          tapStartToken += 1;
        }
        void stopRecording();
        releasePreparedMicrophoneIfIdle();
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") {
          discardGeminiDirectStandby();
          discardReaderStandby();
          if (activeVoiceMode === "auto" && (autoModeEnabled || autoStartPending)) {
            void stopAutoListening();
          } else {
            releasePreparedMicrophoneIfIdle();
          }
          return;
        }
        noteGeminiDirectActivity();
        prepareGeminiDirectStandby();
        void refreshMicPermissionAfterReturn();
      });
      window.addEventListener("focus", () => {
        void refreshMicPermissionAfterReturn();
      });
      window.addEventListener("pageshow", () => {
        void refreshMicPermissionAfterReturn();
      });

      // Keyboard Events
      window.addEventListener("keydown", (event) => {
        void startRecording(event);
      }, { capture: true });
      window.addEventListener("keyup", (event) => {
        void stopRecording(event);
      }, { capture: true });
      window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !isMicHelpModalOpen) return;
        event.preventDefault();
        setMicHelpModalOpen(false);
      });

      if (langBtnLeft) {
        langBtnLeft.addEventListener("click", (event) => {
          event.stopPropagation();
          togglePopover("left");
          if (langPopoverLeft && !langPopoverLeft.classList.contains("hidden")) {
            renderLanguageOptions("left");
          }
        });
      }

      if (langBtnRight) {
        langBtnRight.addEventListener("click", (event) => {
          event.stopPropagation();
          togglePopover("right");
          if (langPopoverRight && !langPopoverRight.classList.contains("hidden")) {
            renderLanguageOptions("right");
          }
        });
      }

      if (langSearchLeft) {
        langSearchLeft.addEventListener("input", () => renderLanguageOptions("left"));
      }
      if (langSearchRight) {
        langSearchRight.addEventListener("input", () => renderLanguageOptions("right"));
      }

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (
          !target.closest(".translator-language-wrap") &&
          performance.now() - languageListOpenedAt > 800
        ) {
          closeAllPopovers();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeAllPopovers();
        }
      });

      updateLanguageButtons();
      updateActiveSpeakerStyles();
      renderLanguageOptions("left");
      renderLanguageOptions("right");
      // ----------------------------------------------------------------------
      // Full-screen translator on phones ("talk mode")
      // ----------------------------------------------------------------------
      // Same page, same address: on a phone the translator section is laid out
      // over the whole screen (talk-mode.css) once the person goes to use it,
      // and people who have used it before land in it directly.
      // The server stamps this script's address with a fingerprint of the
      // script and this stylesheet; reusing it makes a phone fetch the
      // stylesheet again whenever either has changed.
      const TALK_MODE_STYLESHEET_URL = (() => {
        const ownScript = document.querySelector('script[src*="voice-page.js"]');
        let version = "";
        try {
          version = ownScript ? new URL(ownScript.src, window.location.href).searchParams.get("v") || "" : "";
        } catch {
          version = "";
        }
        return version
          ? `/voice-translator/talk-mode.css?v=${encodeURIComponent(version)}`
          : "/voice-translator/talk-mode.css";
      })();
      const TALK_MODE_USED_KEY = "vt-talk-used";
      const TALK_MODE_CLOSED_KEY = "vt-talk-closed";
      const translatorSection = document.getElementById("translator");
      const talkModeViewport =
        typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 767px)") : null;
      let talkModeOpen = false;
      let talkModeStylesPromise = null;
      let talkModeAutoOpenChecked = false;

      const readTalkModeFlag = (storageName, key) => {
        try {
          return window[storageName]?.getItem(key) === "1";
        } catch {
          return false;
        }
      };

      const writeTalkModeFlag = (storageName, key, value) => {
        try {
          if (value) {
            window[storageName]?.setItem(key, "1");
          } else {
            window[storageName]?.removeItem(key);
          }
        } catch {
          // ignored
        }
      };

      const ensureTalkModeStyles = () => {
        if (!talkModeStylesPromise) {
          talkModeStylesPromise = new Promise((resolve) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = TALK_MODE_STYLESHEET_URL;
            link.onload = () => resolve(true);
            link.onerror = () => resolve(false);
            document.head.appendChild(link);
          });
        }
        return talkModeStylesPromise;
      };

      const canUseTalkMode = () => Boolean(translatorSection && talkModeViewport?.matches);

      // Add to Home Screen: the site can be put on the phone's home screen
      // (the server adds the tags for that to every page) and then opens
      // from there like an app, without the browser's bars and straight into
      // the full-screen translator.
      const openedFromHomeScreen = () => {
        try {
          return (
            window.navigator.standalone === true ||
            (typeof window.matchMedia === "function" &&
              window.matchMedia("(display-mode: standalone)").matches)
          );
        } catch {
          return false;
        }
      };

      // Without the browser's bars the page reaches the screen edges: let it
      // lay itself out around the notch and the home indicator.
      const fitHomeScreenAppToScreen = () => {
        if (!openedFromHomeScreen()) {
          return;
        }
        const viewport = document.head.querySelector('meta[name="viewport"]');
        const content = viewport?.getAttribute("content") || "";
        if (viewport && !/viewport-fit/i.test(content)) {
          viewport.setAttribute("content", `${content}, viewport-fit=cover`);
        }
      };

      const ensureTalkModeCloseButton = () => {
        const languageBar = translatorSection?.querySelector(".translator-language-bar");
        if (!languageBar || languageBar.querySelector(".vt-talk-close")) {
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "vt-talk-close";
        button.setAttribute("aria-label", translateUiText("Close"));
        button.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
        button.addEventListener("click", () => closeTalkMode());
        languageBar.appendChild(button);
      };

      // --- Sound switch and typing ------------------------------------------
      // Two small buttons beside the record button. Left: sound on or off;
      // off, every translation is only shown (for places where the phone
      // should stay quiet). Right: a keyboard, to type a sentence instead of
      // saying it; the other person still answers through the microphone.
      // Each has a word underneath. The sound switch's word says how it is
      // now ("Sound on" / "Muted"), not what a tap would do: a bare icon left
      // people guessing what tapping it changes.
      const TALK_ICON = (paths, size = 22) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
      const SIDE_LABEL = (text) => `<span class="vt-side-label" aria-hidden="true">${escapeHtml(text)}</span>`;
      const TALK_ICON_PATHS = {
        soundOn:
          '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
        soundOff:
          '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
        keyboard:
          '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6"/>',
        mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
        send: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'
      };
      // The hint in the empty text field, in both languages of the pair.
      const TYPE_HINT_TEXT = {
        Chinese: "输入文字",
        English: "Type here",
        Thai: "พิมพ์ข้อความ",
        Japanese: "入力",
        Korean: "입력",
        Spanish: "Escribe aquí",
        Vietnamese: "Nhập văn bản",
        Indonesian: "Ketik di sini",
        Malay: "Taip di sini",
        Filipino: "Mag-type dito"
      };
      let talkSoundBtn = null;
      let talkTypeBtn = null;
      let talkComposer = null;
      let talkTypeInput = null;
      let talkSendBtn = null;
      let typingOpen = false;

      const paintSoundButton = () => {
        if (!talkSoundBtn) return;
        talkSoundBtn.classList.toggle("is-off", soundOff);
        const label = translateUiText(soundOff ? "Muted" : "Sound on");
        talkSoundBtn.innerHTML =
          TALK_ICON(soundOff ? TALK_ICON_PATHS.soundOff : TALK_ICON_PATHS.soundOn) + SIDE_LABEL(label);
        talkSoundBtn.setAttribute("aria-pressed", soundOff ? "true" : "false");
        talkSoundBtn.setAttribute("aria-label", label);
      };

      const setSoundOff = (off) => {
        soundOff = Boolean(off);
        try {
          if (soundOff) {
            window.localStorage?.setItem(SOUND_OFF_STORAGE_KEY, "1");
          } else {
            window.localStorage?.removeItem(SOUND_OFF_STORAGE_KEY);
          }
        } catch {
          // ignored
        }
        // Switched off while a translation is being spoken: it stops now.
        if (soundOff) {
          stopStreamingPlayback();
          stopCurrentReplayAudio();
          resumeMicrophoneAfterPlayback();
        }
        paintSoundButton();
      };

      // The text field grows with what is typed, up to five lines.
      const fitTypeInput = () => {
        if (!talkTypeInput) return;
        talkTypeInput.style.height = "auto";
        talkTypeInput.style.height = `${Math.min(talkTypeInput.scrollHeight, 120)}px`;
        if (talkSendBtn) talkSendBtn.classList.toggle("is-ready", Boolean(talkTypeInput.value.trim()));
      };

      // An iPhone lays its keyboard over the page without making the page
      // shorter, which would leave the text field underneath it. While typing,
      // the screen's content is kept to the part the keyboard leaves visible.
      // The screen itself still covers the whole page (padding, not a
      // smaller box): just above the keyboard Chrome floats a see-through bar
      // of its own, and a smaller box let the page underneath show there.
      const syncTypingViewport = () => {
        if (!translatorSection) return;
        const viewport = window.visualViewport;
        if (!viewport || !talkModeOpen || !typingOpen) {
          translatorSection.style.removeProperty("padding-top");
          translatorSection.style.removeProperty("padding-bottom");
          return;
        }
        // The screen's own height: it is pinned to all four edges of the page.
        const pageHeight = translatorSection.offsetHeight || document.documentElement.clientHeight || 0;
        const top = Math.max(0, viewport.offsetTop);
        const bottom = Math.max(0, pageHeight - top - viewport.height);
        translatorSection.style.paddingTop = `${top}px`;
        translatorSection.style.paddingBottom = `${bottom}px`;
        scrollToBottom();
      };

      const closeTyping = () => {
        if (!typingOpen) return;
        typingOpen = false;
        document.documentElement.classList.remove("vt-typing");
        if (talkTypeInput && document.activeElement === talkTypeInput) talkTypeInput.blur();
        syncTypingViewport();
      };

      const openTyping = () => {
        if (typingOpen || !talkModeOpen || !canCorrectHeardText() || isRecording) return;
        typingOpen = true;
        document.documentElement.classList.add("vt-typing");
        if (talkTypeInput) {
          const hints = [leftLang.name, rightLang.name].map((name) => TYPE_HINT_TEXT[name]).filter(Boolean);
          talkTypeInput.placeholder = hints.join(" · ");
          fitTypeInput();
          // No focus here: the keyboard waits for a tap on the field. Raising
          // it at once moved the whole screen just for switching modes.
        }
        syncTypingViewport();
      };

      const submitTypedText = () => {
        if (!talkTypeInput) return;
        const text = talkTypeInput.value.trim();
        if (!text || !requireLanguagesChosen() || !translateTypedText(text)) return;
        talkTypeInput.value = "";
        fitTypeInput();
        scrollToBottom();
      };

      refreshTalkModeControls = () => {
        if (!talkTypeBtn) return;
        const canType = canCorrectHeardText();
        talkTypeBtn.hidden = !canType;
        if (!canType) closeTyping();
        if (talkComposer) talkComposer.classList.toggle("is-busy", processing);
      };

      const ensureTalkModeControls = () => {
        const micShell = translatorSection?.querySelector(".translator-mic-shell");
        const dock = translatorSection?.querySelector(".translator-mic-area > .flex");
        if (!micShell || !dock || talkSoundBtn) {
          return;
        }
        talkSoundBtn = document.createElement("button");
        talkSoundBtn.type = "button";
        talkSoundBtn.className = "vt-side-btn vt-sound-btn";
        talkSoundBtn.addEventListener("click", () => setSoundOff(!soundOff));
        micShell.appendChild(talkSoundBtn);
        paintSoundButton();

        talkTypeBtn = document.createElement("button");
        talkTypeBtn.type = "button";
        talkTypeBtn.className = "vt-side-btn vt-type-btn";
        talkTypeBtn.setAttribute("aria-label", translateUiText("Type instead"));
        talkTypeBtn.innerHTML = TALK_ICON(TALK_ICON_PATHS.keyboard) + SIDE_LABEL(translateUiText("Type text"));
        talkTypeBtn.addEventListener("click", openTyping);
        micShell.appendChild(talkTypeBtn);

        talkComposer = document.createElement("div");
        talkComposer.className = "vt-composer";
        talkComposer.innerHTML = `
          <button type="button" class="vt-composer-btn vt-composer-mic">${TALK_ICON(TALK_ICON_PATHS.mic, 20)}</button>
          <label class="vt-composer-field"><textarea rows="1" maxlength="400" enterkeyhint="send" autocomplete="off"></textarea></label>
          <button type="button" class="vt-composer-btn vt-composer-send">${TALK_ICON(TALK_ICON_PATHS.send, 20)}</button>`;
        dock.appendChild(talkComposer);
        talkTypeInput = talkComposer.querySelector("textarea");
        talkSendBtn = talkComposer.querySelector(".vt-composer-send");
        const composerMic = talkComposer.querySelector(".vt-composer-mic");
        talkTypeInput.setAttribute("aria-label", translateUiText("Text to translate"));
        talkSendBtn.setAttribute("aria-label", translateUiText("Translate this sentence"));
        composerMic.setAttribute("aria-label", translateUiText("Talk instead"));

        talkTypeInput.addEventListener("input", fitTypeInput);
        talkTypeInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            submitTypedText();
          }
        });
        // Putting the keyboard away keeps the typing bar: it opens without
        // the keyboard too. The small microphone is the way back.
        // The send button must not take the focus, or the keyboard would
        // close after every sentence.
        // With the keyboard down, a tap on send leaves it down.
        let keyboardWasUp = false;
        const holdFocus = (event) => {
          keyboardWasUp = document.activeElement === talkTypeInput;
          event.preventDefault();
        };
        talkSendBtn.addEventListener("pointerdown", holdFocus);
        talkSendBtn.addEventListener("mousedown", holdFocus);
        talkSendBtn.addEventListener("click", () => {
          submitTypedText();
          if (keyboardWasUp) talkTypeInput.focus();
          keyboardWasUp = false;
        });
        // The small microphone: back to the record button. It does not start
        // a recording itself: the person only asked to switch back.
        composerMic.addEventListener("click", closeTyping);
        // A tap on the conversation puts the keyboard away.
        if (messagesContainer) {
          messagesContainer.addEventListener("click", (event) => {
            if (typingOpen && document.activeElement === talkTypeInput && !event.target.closest("button, a, textarea")) {
              talkTypeInput.blur();
            }
          });
        }
        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", syncTypingViewport);
          window.visualViewport.addEventListener("scroll", syncTypingViewport);
        }
        refreshTalkModeControls();
      };

      // --- One translation full screen -------------------------------------
      let showOverlay = null;

      const fitShowOverlayText = () => {
        if (!showOverlay) return;
        const body = showOverlay.querySelector(".vt-show-body");
        const text = showOverlay.querySelector(".vt-show-text");
        if (!body || !text) return;
        let size = 96;
        text.style.fontSize = `${size}px`;
        while (size > 24 && body.scrollHeight > body.clientHeight) {
          size -= 4;
          text.style.fontSize = `${size}px`;
        }
      };

      const onShowOverlayKey = (event) => {
        if (event.key === "Escape") closeShowOverlay();
      };

      function closeShowOverlay() {
        if (!showOverlay) return;
        showOverlay.remove();
        showOverlay = null;
        document.removeEventListener("keydown", onShowOverlayKey);
        window.removeEventListener("resize", fitShowOverlayText);
      }

      function openShowOverlay(bubble) {
        // Only what the card's own button offers: a finished translation, not
        // the old one while a corrected sentence is translated again.
        const fullScreenButton = bubble.querySelector(".vt-show-btn");
        if (!fullScreenButton || fullScreenButton.classList.contains("hidden")) return;
        const translatedEl = bubble.querySelector(".translated-text");
        if (!translatedEl || translatedEl.classList.contains("vt-placeholder")) return;
        const translated = translatedEl.textContent.trim();
        if (!translated) return;
        const sourceEl = bubble.querySelector(".source-text");
        const source =
          sourceEl && !sourceEl.classList.contains("vt-placeholder") ? sourceEl.textContent.trim() : "";
        closeShowOverlay();
        const overlay = document.createElement("div");
        overlay.className = "vt-show-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.innerHTML = `
          <button type="button" class="vt-show-close" aria-label="${translateUiText("Close")}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </button>
          <div class="vt-show-body">
            <p class="vt-show-text"></p>
            <p class="vt-show-source"></p>
          </div>
        `;
        overlay.querySelector(".vt-show-text").textContent = translated;
        const sourceLine = overlay.querySelector(".vt-show-source");
        if (source) {
          sourceLine.textContent = source;
        } else {
          sourceLine.remove();
        }
        // Tap anywhere to go back to the conversation.
        overlay.addEventListener("click", () => closeShowOverlay());
        document.body.appendChild(overlay);
        showOverlay = overlay;
        document.addEventListener("keydown", onShowOverlayKey);
        window.addEventListener("resize", fitShowOverlayText);
        fitShowOverlayText();
      }

      const closeTalkMode = ({ fromHistory = false } = {}) => {
        if (!talkModeOpen) {
          return;
        }
        closeTyping();
        talkModeOpen = false;
        closeShowOverlay();
        document.documentElement.classList.remove("vt-talk-open");
        closeAllPopovers();
        if (autoModeEnabled || autoStartPending) {
          void stopAutoListening();
        } else {
          // A start still waiting for the microphone (say, for the
          // browser's prompt) is given up with the screen.
          tapStartActive = false;
          tapStartToken += 1;
          micPress = null;
          keyboardHoldActive = false;
          keyboardPressToken += 1;
          setMicPreparing(false);
          releasePreparedMicrophoneIfIdle();
        }
        // Stay on the normal page for the rest of this visit.
        writeTalkModeFlag("sessionStorage", TALK_MODE_CLOSED_KEY, true);
        if (!fromHistory && window.history.state?.vtTalkMode === true) {
          // Drop the entry that let the back button close this screen.
          window.history.back();
        }
      };

      const openTalkMode = async () => {
        if (talkModeOpen || !canUseTalkMode()) {
          return;
        }
        const stylesReady = await ensureTalkModeStyles();
        if (!stylesReady || talkModeOpen || !canUseTalkMode()) {
          return;
        }
        talkModeOpen = true;
        ensureTalkModeCloseButton();
        ensureTalkModeControls();
        // The tap on the record button that opened this screen asked for a
        // language list (requireLanguagesChosen); it opens again here.
        const listWanted = languageListWanted;
        closeAllPopovers();
        if (listWanted) requireLanguagesChosen();
        attachEmptyHint();
        document.documentElement.classList.add("vt-talk-open");
        writeTalkModeFlag("localStorage", TALK_MODE_USED_KEY, true);
        writeTalkModeFlag("sessionStorage", TALK_MODE_CLOSED_KEY, false);
        try {
          // Lets the phone's back button close the screen instead of leaving.
          if (window.history.state?.vtTalkMode !== true) {
            window.history.pushState({ vtTalkMode: true }, "");
          }
        } catch {
          // ignored
        }
        scrollToBottom();
      };

      // People who have used the full-screen translator before, and may
      // translate, land in it directly.
      const maybeAutoOpenTalkMode = () => {
        if (talkModeAutoOpenChecked) {
          return;
        }
        talkModeAutoOpenChecked = true;
        const anchor = String(window.location.hash || "").slice(1);
        const linksElsewhere = Boolean(
          anchor && anchor !== "translator" && /^[\w-]+$/.test(anchor) && document.getElementById(anchor)
        );
        if (
          !linksElsewhere &&
          readTalkModeFlag("localStorage", TALK_MODE_USED_KEY) &&
          !readTalkModeFlag("sessionStorage", TALK_MODE_CLOSED_KEY)
        ) {
          void openTalkMode();
        }
      };

      if (translatorSection) {
        void ensureTalkModeStyles();
        fitHomeScreenAppToScreen();

        window.addEventListener("popstate", () => {
          if (talkModeOpen) {
            closeTalkMode({ fromHistory: true });
          }
        });

        document.querySelectorAll('a[href="#translator"]').forEach((link) => {
          link.addEventListener("click", (event) => {
            if (!canUseTalkMode()) return;
            event.preventDefault();
            void openTalkMode();
          });
        });

        // Going for the microphone on a phone opens the full screen as well.
        ["pointerdown", "click"].forEach((eventName) => {
          micBtn?.addEventListener(
            eventName,
            () => {
              if (!talkModeOpen && canUseTalkMode()) {
                void openTalkMode();
              }
            },
            { capture: true }
          );
        });

        // Show one translation full screen, as large as it fits, to hold up
        // for the other person: the card's full-screen button, or a double
        // tap on the card. A single tap does nothing.
        let lastCardTap = { bubble: null, time: 0 };
        messagesList?.addEventListener("click", (event) => {
          if (!talkModeOpen || !(event.target instanceof Element)) return;
          const fullScreenButton = event.target.closest(".vt-show-btn");
          if (fullScreenButton) {
            const bubble = fullScreenButton.closest(".translator-message-bubble");
            if (bubble) openShowOverlay(bubble);
            return;
          }
          if (event.target.closest("button, a, textarea, .translator-correct-editor")) return;
          const bubble = event.target.closest(".translator-message-bubble");
          if (!bubble) return;
          const now = performance.now();
          if (lastCardTap.bubble === bubble && now - lastCardTap.time < 400) {
            lastCardTap = { bubble: null, time: 0 };
            openShowOverlay(bubble);
          } else {
            lastCardTap = { bubble, time: now };
          }
        });

        // The first tap on "Try it free" can arrive before this script has
        // loaded; the address then already points at the translator.
        if (
          window.location.hash === "#translator" &&
          !readTalkModeFlag("sessionStorage", TALK_MODE_CLOSED_KEY)
        ) {
          void openTalkMode();
        } else if (openedFromHomeScreen()) {
          void openTalkMode();
        } else if (siteAccess.likelyAdmitted()) {
          maybeAutoOpenTalkMode();
        }
      }

      if (autoDoneBtn) {
        autoDoneBtn.textContent = translateUiText("Done speaking");
        autoDoneBtn.addEventListener("click", () => {
          if (autoConversation) {
            autoConversation.endUtterance();
          }
        });
      }

      activeVoiceMode = readStoredVoiceMode();
      syncAutoVoiceModeButtonVisibility();
      syncVoiceModeUi();
      window.VTI18nRuntime?.ready?.then(() => {
        updateLanguageButtons();
        renderLanguageOptions("left");
        renderLanguageOptions("right");
        syncVoiceModeUi();
        if (isMicHelpModalOpen) {
          renderMicPermissionUi();
        }
      });
      window.VTVoicePageReady = true;
      document.dispatchEvent(new CustomEvent("vt:voice-page-ready"));
      // Who may translate: the site says so once it knows; with no site to
      // ask, everyone, as soon as the page is set up.
      let admitEveryone = true;
      if (admitEveryone) {
        Promise.resolve().then(() => applyVisitorAdmission(true));
      }

    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        void initVoicePage();
      }, { once: true });
    } else {
      void initVoicePage();
    }
