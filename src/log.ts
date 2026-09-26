// Minimal timestamped logger; Docker captures stdout/stderr.
const stamp = () => new Date().toISOString();

export const log = {
  info: (...args: unknown[]) => console.log(stamp(), ...args),
  warn: (...args: unknown[]) => console.warn(stamp(), ...args),
  error: (...args: unknown[]) => console.error(stamp(), ...args),
};
