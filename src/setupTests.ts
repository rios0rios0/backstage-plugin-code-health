import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "node:util";
import { webcrypto } from "node:crypto";

// jsdom exposes neither the text encoding globals nor Web Crypto, both of which
// the encrypted credential store relies on.
if (!globalThis.TextEncoder) {
  Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder });
}

if (!globalThis.TextDecoder) {
  Object.defineProperty(globalThis, "TextDecoder", { value: TextDecoder });
}

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}
