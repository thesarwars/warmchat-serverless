import { useEffect } from 'react';

type ChatbaseFn = ((...args: unknown[]) => unknown) & { q?: unknown[][] };

declare global {
  interface Window {
    chatbase: ChatbaseFn;
  }
}

interface ChatbaseWidgetProps {
  hidden?: boolean;
}

export function ChatbaseWidget({ hidden = false }: ChatbaseWidgetProps) {
  useEffect(() => {
    // Initialize Chatbase
    if (!window.chatbase || window.chatbase("getState") !== "initialized") {
      const queueFn: ChatbaseFn = ((...args: unknown[]) => {
        if (!queueFn.q) {
          queueFn.q = [];
        }
        queueFn.q.push(args);
      }) as ChatbaseFn;
      window.chatbase = queueFn;

      window.chatbase = new Proxy(window.chatbase, {
        get(target: ChatbaseFn, prop: string) {
          if (prop === "q") {
            return target.q;
          }
          return (...args: unknown[]) => target(prop, ...args);
        },
      });
    }

    // Create and append the script
    const script = document.createElement("script");
    script.src = "https://www.chatbase.co/embed.min.js";
    script.id = "7aQcm_Qh4H5XOrGGuZnfp";
    script.setAttribute("domain", "www.chatbase.co");
    document.body.appendChild(script);

    // Cleanup function
    return () => {
      const existingScript = document.getElementById("7aQcm_Qh4H5XOrGGuZnfp");
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []); // Empty dependency array means this runs once on mount

  // Toggle the Chatbase chat bubble visibility (script-injected elements)
  useEffect(() => {
    const styleId = "chatbase-hide-style";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (hidden) {
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = "#chatbase-bubble-button, #chatbase-bubble-window { display: none !important; }button#chatbase-bubble-button {width: 44px !important;height: 44px !important;z-index: 200000 !important;}";
    } else if (style) {
      style.remove();
    }
  }, [hidden]);

  if (hidden) return null;

  return (<></>);

}