import { createHash } from "node:crypto";

/** Hash the exact stableStringify byte stream without a World-sized string.
 * Object key ordering and even legacy undefined/array-hole behavior are kept. */
export function stableDigest(value: unknown): string {
  const hash = createHash("sha256");
  let pending: string[] = [];
  let length = 0;
  const flush = () => {
    if (length) hash.update(pending.join(""));
    pending = [];
    length = 0;
  };
  const emit = (text: string) => {
    pending.push(text);
    length += text.length;
    // Flush whole tokens so a UTF-16 surrogate pair is never split between
    // hash.update calls (which each perform their own UTF-8 encoding).
    if (length >= 65536) flush();
  };
  const visit = (item: unknown, arrayItem = false): void => {
    if (Array.isArray(item)) {
      emit("[");
      for (let i = 0; i < item.length; i++) {
        if (i) emit(",");
        visit(item[i], true);
      }
      emit("]");
    } else if (item && typeof item === "object") {
      emit("{");
      Object.entries(item)
        .sort(([left], [right]) => left.localeCompare(right))
        .forEach(([key, child], index) => {
          if (index) emit(",");
          emit(JSON.stringify(key));
          emit(":");
          visit(child);
        });
      emit("}");
    } else {
      emit(JSON.stringify(item) ?? (arrayItem ? "" : "undefined"));
    }
  };
  visit(value);
  flush();
  return hash.digest("hex");
}
