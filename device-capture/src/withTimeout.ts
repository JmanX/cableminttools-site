// Native calls can fail to settle. Keep the UI recoverable and clean up late photos.
export function withTimeout<T>(operation: Promise<T>, milliseconds: number, message: string, onLateValue?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, milliseconds);
    operation.then(value => {
      clearTimeout(timer);
      if (timedOut) onLateValue?.(value);
      else resolve(value);
    }, error => {
      clearTimeout(timer);
      if (!timedOut) reject(error);
    });
  });
}
