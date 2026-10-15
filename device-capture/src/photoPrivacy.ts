// Only delete copies in this app's cache. Never delete a user's gallery asset.
export function isAppCachePhoto(uri: string, cacheUri: string): boolean {
  try {
    const path = decodeURIComponent(uri);
    const cache = decodeURIComponent(cacheUri).replace(/\/+$/, '') + '/';
    return path.startsWith('file://') && path.startsWith(cache) && !path.split('/').includes('..');
  } catch { return false; }
}
