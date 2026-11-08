# Mobile app: wrapping the web app with React Native and Expo

**Status:** written 2026-11-08. The web app needs no change to be wrapped. No Expo project exists yet, and nothing here has been run on a device.

**The approach:** a small Expo app that opens `https://cropcash.netlify.app` in `react-native-webview`. There is one codebase, and a Netlify deploy updates the app without a store release.

Load the Netlify address, don't bundle `web/out` inside the app. The pages, the service worker, `crypto.randomUUID` and the API's CORS rule all expect an `https://` origin.

## Checked against the web app

| Need | State |
|---|---|
| Runs from one https address, every path from `/` | Yes. Static export on Netlify |
| API accepts the wrapper | Yes. A WebView on the Netlify page sends the Netlify `Origin`, which `CORS_ORIGINS` already allows. No API change |
| Sign-in survives closing the app | Yes. The session and farm copy are in `localStorage` |
| Works without `navigator.locks` or a service worker | Yes. Both are checked before use |
| `navigator.onLine` can be wrong in a WebView | Covered. The app also pings `/api/health` |
| Layout at phone width | Checked at 390 px: no sideways scroll |
| Offline with the host unreachable | Checked in headless Chromium, not in a WebView |

## What the wrapper has to do

1. **iOS offline.** A plain WKWebView has no service worker, so the pages would not open offline. It needs App-Bound Domains: `WKAppBoundDomains` in the Info.plist and `limitsNavigationsToAppBoundDomains` on the WebView. Without this, iOS needs internet to open a page. Saved farm data would still be on the phone.
2. **External links.** About 15 links use `target="_blank"` (official sources, the APIA calendar). Open them in the phone's browser, as in the sketch below.
3. **Paper photos.** The "read a paper" buttons use a normal file input. They need camera and photo permissions.
4. **Android back button.** It should go back in the WebView, not close the app.
5. **Text size.** Set `textZoom={100}` so a large phone font doesn't break the layout. Decide this with a real user, since the persona is 55+ and may rely on large text.
6. **First open with no internet.** Nothing is saved yet, so show a native "Pornește internetul" screen through `renderError`.
7. **Email links** (confirming an account) open in the phone's browser and sign in there. The farmer then signs in with email and password in the app. Deep links are not built.

## Where it goes

Put it in `mobile/` at the repo root. **Not under `apps/`**: the root `workspaces` include `apps/*`, so Netlify and the VPS would install Expo and React Native on every build.

## Sketch

`app.json`, the parts that matter:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "WKAppBoundDomains": ["cropcash.netlify.app"],
        "NSCameraUsageDescription": "Faci o poză hârtiei de la APIA, ca să o citim.",
        "NSPhotoLibraryUsageDescription": "Alegi o poză a hârtiei de la APIA."
      }
    },
    "android": { "permissions": ["CAMERA"] }
  }
}
```

`App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const SITE = 'https://cropcash.netlify.app';

export default function App() {
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <WebView
          ref={web}
          source={{ uri: SITE }}
          limitsNavigationsToAppBoundDomains
          setSupportMultipleWindows={false}
          textZoom={100}
          onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
          onShouldStartLoadWithRequest={(r) => {
            if (r.url === 'about:blank' || r.url.startsWith(SITE)) return true;
            void Linking.openURL(r.url);
            return false;
          }}
          renderError={() => <Text>Pornește internetul ca să deschizi aplicația.</Text>}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
```

If the site moves to another domain, change `SITE`, `WKAppBoundDomains` and `CORS_ORIGINS` together.

## Test on real phones

- Sign in, close the app, open it again: still signed in.
- Airplane mode: pages open and a sale can be noted. Back online: it is sent once. On iOS this proves App-Bound Domains work.
- `confirm()` dialogs (sign-out with unsent records, deleting a source, resetting Ion's farm) appear on both systems and "Cancel" works.
- A photo of a paper reaches the API, from the camera and from the gallery.
- A source link opens in the phone's browser and the app stays on its page.
