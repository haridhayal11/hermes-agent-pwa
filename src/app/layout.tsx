import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AgentNameProvider } from "@/components/AgentNameContext";
import { LaunchNormalizer } from "@/components/LaunchNormalizer";
import { PreferencesProvider } from "@/components/PreferencesContext";
import { getAgentName } from "@/lib/app-settings";
import { APP_NAME } from "@/lib/branding";
import { PREFS_KEY } from "@/lib/preferences";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Hermes command center",
  applicationName: APP_NAME,
  appleWebApp: {
    title: APP_NAME,
    capable: true,
    // black-translucent puts the web view under the status bar, which is why
    // every top-level surface has to pay env(safe-area-inset-top) itself.
    statusBarStyle: "black-translucent",
  },
  // Agent output is full of numbers — dates, calorie counts, durations. iOS
  // otherwise turns them into blue tel: links inside the transcript.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  // Next emits only the modern `mobile-web-app-capable` for appleWebApp.capable.
  // iOS 16.4+ takes standalone from the manifest's `display`, but older iOS
  // reads nothing but this tag — and it's what makes the app open without
  // Safari chrome once it's on the home screen.
  other: { "apple-mobile-web-app-capable": "yes" },
};

/* Runs before the first pixel, so the stored theme, text size and motion
 * setting are already on <html> when React hydrates. A module import can't do
 * this — it would run after paint and every cold start would flash the wrong
 * palette. Kept deliberately in step with applyPrefsToDocument(). */
const NO_FLASH = `(function(){try{
var d=document.documentElement,p={};
try{p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}")||{}}catch(e){}
var t=p.theme==="light"||p.theme==="dark"?p.theme:p.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):"dark";
d.classList.toggle("dark",t==="dark");
d.style.colorScheme=t;
d.dataset.textSize=["small","normal","large"].indexOf(p.textSize)>-1?p.textSize:"normal";
if(p.reduceMotion===true||matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.reduceMotion="1";
}catch(e){}})()`;

/* Also pre-paint: the shell's height, measured rather than taken from `dvh`.
 *
 * iOS 26 overreports the dynamic viewport in an installed web app, so an
 * `h-dvh overflow-hidden` shell ended taller than the screen and the composer
 * sat below the bottom edge with no way to scroll to it. This is the same
 * family of bug as the fixed/sticky drift that landed with iOS 26.
 *
 * window.innerHeight, deliberately, and *not* visualViewport.height — see the
 * comment in AppShell. WebKit pans the visual viewport to reveal the caret
 * when the keyboard opens rather than resizing the layout viewport, and the
 * pan is what puts the composer above the keys. Sizing the shell from the
 * visual viewport undoes that. The guards are for the iOS builds that shrink
 * innerHeight for the keyboard anyway: never shrink while an editable element
 * has focus, and never shrink by a keyboard-sized fraction at all. */
const APP_HEIGHT = `(function(){try{
var d=document.documentElement,full=0;
function set(){
var h=window.innerHeight;
if(!h)return;
if(full&&h<full){
var a=document.activeElement;
if(a&&(a.tagName==="TEXTAREA"||a.tagName==="INPUT"||a.isContentEditable))return;
if(h<full*0.75)return;
}
full=h;
d.style.setProperty("--app-height",h+"px");
}
set();
addEventListener("resize",set);
addEventListener("pageshow",set);
addEventListener("orientationchange",function(){full=0;setTimeout(set,120)});
}catch(e){}})()`;

// themeColor lives here, not in metadata — it's deprecated there in Next 16.
export const viewport: Viewport = {
  // = the dark --page token, oklch(14.5% 0 0)
  themeColor: "#0a0a0a",
  // The pre-paint default. applyPrefsToDocument() overrides it with an inline
  // style once a theme is chosen; this is what stops rubber-banding exposing a
  // white strip before that happens.
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // deliberately *not* maximumScale/userScalable: pinch-zoom is an
  // accessibility affordance, and the iOS focus-zoom it is usually disabled
  // to prevent is already handled by the 16px --text-input token.
  viewportFit: "cover",
};

// The layout reads SQLite for the agent's name, so it must be rendered per
// request. Without this Next would prerender it and every install would show
// whatever name the build machine's database happened to hold — the same trap
// the zero-argument GET handlers have to dodge.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const agentName = getAgentName();

  return (
    <html
      lang="en"
      // The theme class is written by NO_FLASH below, not rendered here — React
      // would otherwise hydrate over it and undo the pre-paint correction.
      // Dark remains the default; the tokens define both modes.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `${NO_FLASH};${APP_HEIGHT}` }} />
      </head>
      <body>
        {/* Every route, not just the shell: /settings is deliberately outside
          * AppShell and is just as installable as anything else. */}
        <LaunchNormalizer />
        <PreferencesProvider>
          <AgentNameProvider initial={agentName}>{children}</AgentNameProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
