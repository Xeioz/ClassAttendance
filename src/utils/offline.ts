/** Ask the controlling worker about its own precache, never another build's cache. */
export async function verifyOfflineResources(): Promise<number> {
  const controller = navigator.serviceWorker?.controller;
  if (!controller)
    throw new Error(
      'Offline worker is not controlling this page yet. Reconnect, reload the production website and retry.',
    );
  const result = await new Promise<{ ready: boolean; count: number }>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Offline check timed out. Reconnect and retry.'));
    }, 10_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve({
        ready: event.data?.ready === true,
        count: typeof event.data?.count === 'number' ? event.data.count : 0,
      });
    };
    controller.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
  });
  if (!result.ready || controller !== navigator.serviceWorker.controller)
    throw new Error(
      'Required resources are incomplete or the website changed. Reconnect and retry.',
    );
  return result.count;
}
