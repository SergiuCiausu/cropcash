/* CropCash on the phone: the live web app (https://cropcash.netlify.app) inside a WebView
   (docs/14-mobile-expo.md, option A). A Netlify deploy updates the app without a store release,
   and the API on the VPS sees the same Netlify origin it already allows. */
import { useEffect, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';

/* react-native-webview 14.0.1 declares its component in a way the React 19.3 types of Expo SDK 58
   read as taking no props. It works at run time; this gives it its real props and the two methods we call. */
type WebViewHandle = { goBack(): void; reload(): void };
const WebView = RNWebView as unknown as ForwardRefExoticComponent<WebViewProps & RefAttributes<WebViewHandle>>;

const SITE = 'https://cropcash.netlify.app';
const START = `${SITE}/acasa`;

/* Lets the page know it runs inside the app (Phase 2: hide the install card, hand share and
   calendar files to the phone). Ignored by the page until then. */
const MARK_APP = 'window.CROPCASH_APP = true; true;';

/* Expo Go doesn't carry our WKAppBoundDomains, so limiting to them there would block the site on iOS.
   Only the real app build (EAS) turns it on, which is what keeps pages offline on iOS. */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function App() {
  const web = useRef<WebViewHandle>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);

  /* Android's back button goes back a page, and closes the app only on the first page. */
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
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {failed ? (
          <View style={styles.center}>
            <Text style={styles.title}>Pornește internetul ca să deschizi aplicația.</Text>
            <Text style={styles.note}>Prima deschidere are nevoie de internet. După aceea, cifrele rămân pe telefon.</Text>
            <Pressable
              style={styles.button}
              onPress={() => {
                setFailed(false);
                web.current?.reload();
              }}
            >
              <Text style={styles.buttonText}>Încearcă din nou</Text>
            </Pressable>
          </View>
        ) : null}
        <WebView
          ref={web}
          source={{ uri: START }}
          style={failed ? styles.hidden : styles.root}
          injectedJavaScriptBeforeContentLoaded={MARK_APP}
          /* iOS: lets the service worker keep the pages for offline use (WKAppBoundDomains in app.json). */
          limitsNavigationsToAppBoundDomains={!IN_EXPO_GO}
          setSupportMultipleWindows={false}
          /* A large phone font would break the layout; to be decided with a real 55+ user (docs/14). */
          textZoom={100}
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#1A1A1A" />
            </View>
          )}
          onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
          /* Official sources and other sites open in the phone's browser; the app stays on its page. */
          onShouldStartLoadWithRequest={(r) => {
            if (r.url === 'about:blank' || r.url.startsWith(SITE)) return true;
            void Linking.openURL(r.url);
            return false;
          }}
          onError={() => setFailed(true)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8F3' },
  hidden: { flex: 0, height: 0 },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8F8F3', gap: 12 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center', color: '#18201C' },
  note: { fontSize: 16, textAlign: 'center', color: '#36423B' },
  button: { marginTop: 8, minHeight: 52, paddingHorizontal: 24, borderRadius: 999, backgroundColor: '#1A1A1A', justifyContent: 'center' },
  buttonText: { color: '#FAF9F7', fontSize: 16, fontWeight: '500' },
});
