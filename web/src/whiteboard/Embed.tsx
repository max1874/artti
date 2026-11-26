// A working web page on the board: sandboxed, and keeping what people enter in the element's `state`.

import { useEffect, useRef } from "react";

/**
 * Given to the page as `load()`, `save(state)` and `onLoad(callback)`: load resolves with the state kept, save keeps a new
 * one, and onLoad runs with the state now and whenever someone else changes it.
 */
const bridge = `<script>(() => {
  let state = null, loaded = false, ready;
  const got = new Promise(resolve => ready = resolve), listeners = [];
  addEventListener("message", event => {
    if (event.source !== parent || event.data?.artti !== "state") return;
    state = event.data.state;
    if (loaded) listeners.forEach(listener => listener(state));
    loaded = true;
    ready();
  });
  window.load = () => got.then(() => state);
  window.save = next => { state = next; parent.postMessage({ artti: "save", state: next }, "*"); };
  window.onLoad = listener => { listeners.push(listener); got.then(() => listener(state)); };
  // Escape hands the keyboard back to the board, as it does everywhere else on it.
  addEventListener("keydown", event => { if (event.key === "Escape") parent.postMessage({ artti: "escape" }, "*"); });
  parent.postMessage({ artti: "ready" }, "*");
})();</script>`;

export function Embed({ html, state, live, onSave, onEscape }: {
  html: string; state: unknown; live: boolean; onSave: (state: unknown) => void; onEscape: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // The state the page last had, so its own saves coming back from the server are not sent to it again.
  const known = useRef<string>(undefined);
  const send = () => {
    known.current = JSON.stringify(state ?? null);
    frame.current?.contentWindow?.postMessage({ artti: "state", state: state ?? null }, "*");
  };
  const latest = useRef({ send, onSave, onEscape });
  latest.current = { send, onSave, onEscape };

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.artti === "ready") latest.current.send();
      if (event.data?.artti === "escape") {
        frame.current?.blur();
        latest.current.onEscape();
      }
      if (event.data?.artti === "save") {
        known.current = JSON.stringify(event.data.state ?? null);
        latest.current.onSave(event.data.state);
      }
    };
    addEventListener("message", listen);
    return () => removeEventListener("message", listen);
  }, []);
  useEffect(() => { if (known.current !== undefined && JSON.stringify(state ?? null) !== known.current) send(); }, [state]);

  // No same-origin: the page cannot reach artti or the files beside it.
  return <iframe ref={frame} srcDoc={bridge + html} sandbox="allow-scripts allow-forms" title="embed"
    style={{ pointerEvents: live ? "auto" : "none" }} />;
}
