export function useServerURL() {
  const hostname = window.location.hostname;
  const base = `http://${hostname}:8000`;
  const ws = `ws://${hostname}:8000`;
  return { base, ws };
}
