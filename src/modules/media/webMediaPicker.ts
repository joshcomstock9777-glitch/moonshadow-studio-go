export interface PickedWebMedia {
  uri: string;
  name: string;
  mimeType?: string;
  size: number;
}

export function isWebMediaPickerSupported(): boolean {
  return typeof document !== 'undefined'
    && typeof document.createElement === 'function'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function';
}

export function pickWebMedia(): Promise<PickedWebMedia | null> {
  if (!isWebMediaPickerSupported()) {
    return Promise.reject(new Error('Local media picker is not available in this runtime.'));
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,image/*';
    input.multiple = false;

    let settled = false;
    const finish = (value: PickedWebMedia | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }

      try {
        const uri = URL.createObjectURL(file);
        finish({
          uri,
          name: file.name || `Local media ${new Date().toISOString()}`,
          mimeType: file.type || undefined,
          size: file.size,
        });
      } catch (error) {
        settled = true;
        reject(error instanceof Error ? error : new Error('Could not create a local media URL.'));
      }
    }, { once: true });

    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}
