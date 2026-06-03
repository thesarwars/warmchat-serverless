/** Plain text from inbox composer (contenteditable); used for SMS length, tokens, and send. */
export function composerInnerPlain(el: HTMLDivElement | null) {
  return (el?.innerText ?? "").replace(/\u00a0/g, " ");
}

// Tags we keep when pasting into the rich (email) composer. Everything else
// is unwrapped to its text content.
const ALLOWED_PASTE_TAGS = new Set([
  "B", "STRONG", "I", "EM", "U", "A", "UL", "OL", "LI", "BR", "P", "DIV", "SPAN",
]);

/**
 * Sanitize clipboard HTML for the email composer: drop every inline style,
 * color/class attribute and disallowed tag. This is what kills the
 * "white-on-white" paste -- source apps embed `color`/`background` styles that
 * survive into our dark-on-light composer and render invisible. We keep only
 * structural formatting (bold/italic/links/lists) with no styling of its own.
 */
export function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        walk(el);
        if (!ALLOWED_PASTE_TAGS.has(el.tagName)) {
          // Replace the element with its (already-sanitized) children.
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
          continue;
        }
        // Strip all attributes except href on anchors -- this removes color,
        // background, style, class, font, etc.
        const href = el.tagName === "A" ? el.getAttribute("href") : null;
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        if (href && /^https?:\/\//i.test(href)) {
          el.setAttribute("href", href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer");
        }
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function execRichCommand(command: string, value?: string) {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}
