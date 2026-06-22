/**
 * LLMBridge — hidden WebView running @mlc-ai/web-llm.
 *
 * Architecture:
 *   - This component mounts a 1x1 invisible WebView at the root of the app
 *     (added to App.tsx). The WebView loads an HTML page (defined inline
 *     below) that imports @mlc-ai/web-llm from a CDN, downloads a model
 *     on first use, and runs inference on the phone's GPU via WebGPU.
 *
 *   - JS and the WebView communicate via postMessage:
 *       JS → WebView: { type: 'load' } | { type: 'generate', id, prompt }
 *       WebView → JS: { type: 'progress', loaded, total }
 *                   | { type: 'ready' }
 *                   | { type: 'result', id, text }
 *                   | { type: 'error', message }
 *
 *   - The Context exposes loadModel(), generate(prompt), and the current
 *     status to any consumer via the useLLMContext() hook (re-exported
 *     more conveniently as useLLM() from src/hooks/useLLM.ts).
 *
 * Model: Llama 3.2 1B, ~700 MB, downloads once and is cached in the
 * WebView's storage. Subsequent app launches load the cached model
 * in ~10-15 seconds.
 *
 * Inference happens on the phone, not the Mac. Mac just serves JS.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
    ReactNode,
  } from 'react';
  import { StyleSheet, View } from 'react-native';
  import { WebView, WebViewMessageEvent } from 'react-native-webview';
  
  // --- Types --------------------------------------------------------------
  
  export type LLMStatus =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'generating'
    | 'error';
  
  export interface LLMContextValue {
    status: LLMStatus;
    /** 0-1 download progress. Only meaningful during 'loading'. */
    loadProgress: number;
    /** Last error message, or null. */
    error: string | null;
    /** Start downloading and loading the model. Idempotent. */
    loadModel: () => void;
    /**
     * Generate text from a prompt. Resolves to the generated string.
     * Throws if the model isn't ready or another generation is in progress.
     */
    generate: (prompt: string) => Promise<string>;
  }
  
  const LLMContext = createContext<LLMContextValue | undefined>(undefined);
  
  // --- The HTML/JS that runs inside the WebView ---------------------------
  
  /**
   * Loaded as source for the WebView. Imports @mlc-ai/web-llm from a CDN,
   * loads a model when asked, and runs inference. Communicates with
   * React Native via window.ReactNativeWebView.postMessage().
   *
   * Important: this is a string, not a separate file. WebView can also
   * load from a local asset, but inline is simpler and avoids bundler
   * configuration for non-JS assets.
   */
  const WEBVIEW_HTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
  <script type="module">
    // Import the WebLLM library from a CDN. First load is ~5MB.
    import { CreateMLCEngine } from 'https://esm.run/@mlc-ai/web-llm';
  
    let engine = null;
    let busy = false;
  
    const post = (msg) => {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    };
  
    const loadModel = async () => {
      if (engine) {
        post({ type: 'ready' });
        return;
      }
      try {
        engine = await CreateMLCEngine(
          'Llama-3.2-1B-Instruct-q4f32_1-MLC',
          {
            initProgressCallback: (report) => {
              post({
                type: 'progress',
                loaded: report.progress ?? 0,
                total: 1,
                text: report.text ?? '',
              });
            },
          }
        );
        post({ type: 'ready' });
      } catch (err) {
        post({ type: 'error', message: String(err && err.message || err) });
      }
    };
  
    const generate = async (id, prompt) => {
      if (!engine) {
        post({ type: 'error', message: 'Model not loaded' });
        return;
      }
      if (busy) {
        post({ type: 'error', message: 'Another generation in progress' });
        return;
      }
      busy = true;
      try {
        const reply = await engine.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 200,
        });
        const text = reply.choices?.[0]?.message?.content ?? '';
        post({ type: 'result', id, text: text.trim() });
      } catch (err) {
        post({ type: 'error', message: String(err && err.message || err) });
      } finally {
        busy = false;
      }
    };
  
    // Listen for commands from React Native.
    document.addEventListener('message', (event) => handle(event.data));
    window.addEventListener('message', (event) => handle(event.data));
  
    const handle = (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'load') loadModel();
      else if (msg.type === 'generate') generate(msg.id, msg.prompt);
    };
  
    // Tell React Native we're ready to receive commands.
    post({ type: 'bootstrapped' });
  </script>
  </body>
  </html>
  `;
  
  // --- Provider component -------------------------------------------------
  
  interface ProviderProps {
    children: ReactNode;
  }
  
  export function LLMProvider({ children }: ProviderProps) {
    const webViewRef = useRef<WebView>(null);
  
    const [status, setStatus] = useState<LLMStatus>('idle');
    const [loadProgress, setLoadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
  
    /**
     * Map of in-flight generation requests. Each call to generate() registers
     * its resolve/reject under a unique id; the message handler dispatches
     * by id when the WebView posts back.
     */
    const pendingRef = useRef<
    Map<
      string,
      { resolve: (text: string) => void; reject: (err: Error) => void }
    >
  >(new Map());
  
    const bootstrappedRef = useRef(false);
  
    // --- Send a message into the WebView -----------------------------
  
    const send = useCallback((msg: object) => {
      const json = JSON.stringify(msg);
      // postMessage from the RN side: inject a script that posts to the
      // window so both addEventListener paths receive it.
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(json)} })); true;`
      );
    }, []);
  
    // --- Receive messages from the WebView ---------------------------
  
    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
  
      switch (msg.type) {
        case 'bootstrapped':
          bootstrappedRef.current = true;
          break;
  
        case 'progress':
          setLoadProgress(Math.max(0, Math.min(1, msg.loaded / msg.total)));
          break;
  
        case 'ready':
          setStatus('ready');
          setLoadProgress(1);
          setError(null);
          break;
  
        case 'result': {
          const pending = pendingRef.current.get(msg.id);
          if (pending) {
            pending.resolve(msg.text);
            pendingRef.current.delete(msg.id);
          }
          setStatus('ready');
          break;
        }
  
        case 'error': {
          const message = msg.message || 'Unknown LLM error';
          setError(message);
          setStatus('error');
          // Reject every pending request.
          for (const [, pending] of pendingRef.current) {
            pending.reject(new Error(message));
          }
          pendingRef.current.clear();
          break;
        }
      }
    }, []);
  
    // --- Public API ------------------------------------------------------
  
    const loadModel = useCallback(() => {
      if (status === 'loading' || status === 'ready' || status === 'generating') {
        return;
      }
      setStatus('loading');
      setLoadProgress(0);
      setError(null);
      send({ type: 'load' });
    }, [status, send]);
  
    const generate = useCallback(
      (prompt: string): Promise<string> => {
        if (status !== 'ready' && status !== 'generating') {
          return Promise.reject(
            new Error('Model not ready. Call loadModel() first.')
          );
        }
  
        const id = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const promise = new Promise<string>((resolve, reject) => {
          pendingRef.current.set(id, { resolve, reject });
        });
  
        setStatus('generating');
        send({ type: 'generate', id, prompt });
        return promise;
      },
      [status, send]
    );
  
    const value: LLMContextValue = {
      status,
      loadProgress,
      error,
      loadModel,
      generate,
    };
  
    return (
      <LLMContext.Provider value={value}>
        {children}
        <View style={styles.hiddenWebView} pointerEvents="none">
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: WEBVIEW_HTML }}
            onMessage={handleMessage}
            // Allow WebGPU and required permissions for WebLLM.
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            mixedContentMode="always"
            mediaPlaybackRequiresUserAction={false}
            // The WebView is offscreen but must still render to a layer
            // for WebGPU to work. We position it absolutely with zero size.
          />
        </View>
      </LLMContext.Provider>
    );
  }
  
  // --- Hook for consumers -------------------------------------------------
  
  export function useLLMContext(): LLMContextValue {
    const ctx = useContext(LLMContext);
    if (!ctx) {
      throw new Error('useLLMContext must be used inside <LLMProvider>');
    }
    return ctx;
  }
  
  // --- Styles -------------------------------------------------------------
  
  const styles = StyleSheet.create({
    hiddenWebView: {
      position: 'absolute',
      width: 1,
      height: 1,
      top: -100,
      left: -100,
      opacity: 0,
    },
  });