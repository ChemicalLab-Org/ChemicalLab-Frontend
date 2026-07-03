const browserGlobal = globalThis as typeof globalThis & {
  global?: typeof globalThis;
};

browserGlobal.global ??= globalThis;

export {};
