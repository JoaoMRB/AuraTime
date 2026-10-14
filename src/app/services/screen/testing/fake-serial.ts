import { SerialApiLike, SerialPortLike, SerialReaderLike, SerialWriterLike } from '../serial-link.service';

/** In-memory Web Serial doubles for unit tests. */
export class FakeReader implements SerialReaderLike {
  replies: Uint8Array[] = [];
  private pending: ((r: { done: boolean; value?: Uint8Array }) => void) | null = null;

  read(): Promise<{ done: boolean; value?: Uint8Array }> {
    if (this.replies.length) return Promise.resolve({ done: false, value: this.replies.shift() });
    return new Promise(resolve => (this.pending = resolve));
  }
  cancel(): Promise<void> {
    this.pending?.({ done: true });
    this.pending = null;
    return Promise.resolve();
  }
  releaseLock(): void {}
}

export class FakePort implements SerialPortLike {
  writes: Uint8Array[] = [];
  openArgs: unknown = null;
  closed = false;
  failOpen: string | null = null;
  reader = new FakeReader();
  constructor(public info: { usbVendorId?: number; usbProductId?: number } = { usbVendorId: 0x1a86, usbProductId: 0x5722 }) {}

  readable = { getReader: () => this.reader };
  writable = {
    getWriter: (): SerialWriterLike => ({
      write: async (chunk: Uint8Array) => { this.writes.push(chunk.slice()); },
      releaseLock: () => {}
    })
  };
  open(options: { baudRate: number; flowControl: 'none' | 'hardware'; bufferSize?: number }): Promise<void> {
    if (this.failOpen) return Promise.reject(new Error(this.failOpen));
    this.openArgs = options;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
  getInfo() { return this.info; }
}

export class FakeSerial extends EventTarget implements SerialApiLike {
  ports: FakePort[] = [];
  picked: FakePort | null = null;
  cancelPicker = false;
  requestedFilters: unknown;

  requestPort(options?: { filters?: { usbVendorId: number; usbProductId: number }[] }): Promise<SerialPortLike> {
    this.requestedFilters = options?.filters;
    if (this.cancelPicker) return Promise.reject(Object.assign(new Error('No port selected'), { name: 'NotFoundError' }));
    return Promise.resolve(this.picked!);
  }
  getPorts(): Promise<SerialPortLike[]> {
    return Promise.resolve(this.ports);
  }
  unplug(port: FakePort): void {
    this.dispatchEvent(Object.assign(new Event('disconnect'), { port }));
  }
}
