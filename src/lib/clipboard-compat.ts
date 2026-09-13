declare global {
  interface Window {
    __geomacroClipboardCompatInstalled?: boolean;
  }
}

function legacyCopyText(value: string) {
  if (typeof document === "undefined") {
    throw new Error("CLIPBOARD_UNAVAILABLE");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : null;

  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      if (previousRange) selection.addRange(previousRange);
    }
  }

  if (!copied) throw new Error("CLIPBOARD_COPY_FAILED");
}

export function installClipboardCompatibility() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (window.__geomacroClipboardCompatInstalled) return;

  const clipboard = navigator.clipboard;
  const nativeWrite = clipboard?.writeText
    ? clipboard.writeText.bind(clipboard)
    : null;

  const writeText = async (value: string) => {
    if (nativeWrite) {
      try {
        await nativeWrite(value);
        return;
      } catch {
        // Some browsers expose Clipboard API but deny writeText at runtime.
        // Fall back to a user-gesture-compatible DOM copy path.
      }
    }
    legacyCopyText(value);
  };

  let installed = false;

  if (clipboard) {
    try {
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        writable: true,
        value: writeText,
      });
      installed = true;
    } catch {
      const prototype = Object.getPrototypeOf(clipboard) as object | null;
      if (prototype) {
        try {
          Object.defineProperty(prototype, "writeText", {
            configurable: true,
            writable: true,
            value: writeText,
          });
          installed = true;
        } catch {
          installed = false;
        }
      }
    }
  }

  if (!installed) {
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      installed = true;
    } catch {
      installed = false;
    }
  }

  window.__geomacroClipboardCompatInstalled = installed;
}
