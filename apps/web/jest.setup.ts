import "fake-indexeddb/auto";

// Polyfill structuredClone for jsdom if it doesn't exist
if (typeof structuredClone === "undefined") {
  global.structuredClone = (value: unknown) => {
    return JSON.parse(JSON.stringify(value));
  };
}
