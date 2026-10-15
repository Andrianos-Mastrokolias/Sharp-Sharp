export const PREFERENCES_KEY = 'sharp-sharp.preferences.v1';

export function normalizePreferences(value = {}) {
  return {
    muted: value?.muted === true,
    volume: typeof value?.volume === 'number' && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume)) : 0.6,
    quality: ['low', 'medium', 'high'].includes(value?.quality) ? value.quality : 'high'
  };
}

export function readPreferences(storage) {
  try { return normalizePreferences(JSON.parse(storage.getItem(PREFERENCES_KEY))); }
  catch { return normalizePreferences(); }
}

export function savePreferences(storage, value) {
  const preferences = normalizePreferences(value);
  try { storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Storage is optional. */ }
  return preferences;
}

export function applyQuality(renderer, quality, devicePixelRatio = 1) {
  const limit = { low: 0.75, medium: 1, high: 2 }[quality] ?? 2;
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  renderer.setPixelRatio(Math.min(ratio, limit));
}
