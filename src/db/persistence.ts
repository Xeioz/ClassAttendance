export async function requestPersistence(): Promise<string> {
  try {
    if (!navigator.storage?.persist) return 'Persistence API unavailable. Keep encrypted backups.';
    const granted = await navigator.storage.persist();
    const estimate = await navigator.storage.estimate();
    const used = Math.round((estimate.usage ?? 0) / 1024);
    return `${granted ? 'Persistent storage granted' : 'Persistence not granted'} · ${used} KB used. Backups are still required.`;
  } catch {
    return 'Unable to request persistent storage. Keep encrypted backups.';
  }
}
