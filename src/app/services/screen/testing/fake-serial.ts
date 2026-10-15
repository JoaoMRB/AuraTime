import { SerialApiLike, SerialPortLike, SerialReaderLike, SerialWriterLike } from '../serial-link.service';

/**
 * In-memory Web Serial doubles for unit tests. They are deliberately as picky as the real thing about the
 * order of operations: a port with a locked stream cannot be closed, an open port cannot be opened again, and
 * a writer with a write still pending cannot simply be released (it has to be aborted first).
 */
export class FakeReader implements SerialReaderLike {
  replies: Uint8Array[] = [];
  locked = false;
  /** Make cancel()/releaseLock() fail, to test that failures are reported. */
  failCancel = false;
  private pending: ((r: { done: boolean; value?: Uint8Array }) => void) | null = null;

  read(): Promise<{ done: boolean; value?: Uint8Array }> {
    if (this.replies.length) return Promise.resolve({ done: false, value: this.replies.shift() });
    return new Promise(resolve => (this.pending = resolve));
  }
  cancel(): Promise<void> {
    if (this.failCancel) return Promise.reject(new Error('cancel failed'));
    this.pending?.({ done: true });
    this.pending = null;
    return Promise.resolve();
  }
  onRelease: (() => void) | null = null;
  releaseLock(): void {
    this.locked = false;
    this.onRelease?.();
  }
}

export class FakeWriter implements SerialWriterLike {
  pendingWrites = 0;
  aborted = false;
  released = false;

  constructor(private port: FakePort) {}

  async write(chunk: Uint8Array): Promise<void> {
    this.pendingWrites++;
    try {
      if (this.port.gate) await this.port.gate;
      if (this.aborted) return; // the stream was aborted while this write was waiting
      this.port.writes.push(chunk.slice());
    } finally {
      this.pendingWrites--;
    }
  }

  abort(): Promise<void> {
    this.port.events.push('writer.abort');
    this.aborted = true;
    this.pendingWrites = 0;
    return Promise.resolve();
  }

  releaseLock(): void {
    if (this.pendingWrites > 0 && !this.aborted) {
      throw new TypeError('Cannot release the lock of a writer with pending writes');
    }
    this.port.events.push('writer.release');
    this.released = true;
    this.port.writerLocked = false;
  }
}

export class FakePort implements SerialPortLike {
  writes: Uint8Array[] = [];
  /** Order of the teardown calls, to check that it is the one Web Serial requires. */
  events: string[] = [];
  openArgs: unknown = null;
  isOpen = false;
  openCount = 0;
  closeCount = 0;
  closed = false;
  failOpen: string | null = null;
  /** Make close() fail this many times. */
  failClose = 0;
  /** When set, writes wait for it: lets a test hold a bitmap "in flight". */
  gate: Promise<void> | null = null;
  reader = new FakeReader();
  readerLocked = false;
  writerLocked = false;

  constructor(public info: { usbVendorId?: number; usbProductId?: number } = { usbVendorId: 0x1a86, usbProductId: 0x5722 }) {}

  /** Like the real SerialPort: null until the port is open. */
  get readable(): { getReader(): SerialReaderLike } | null {
    if (!this.isOpen) return null;
    return {
      getReader: () => {
        this.reader.locked = true;
        this.readerLocked = true;
        this.reader.onRelease = () => {
          this.events.push('reader.release');
          this.readerLocked = false;
        };
        return this.reader;
      }
    };
  }

  get writable(): { getWriter(): SerialWriterLike } | null {
    if (!this.isOpen) return null;
    return {
      getWriter: () => {
        this.writerLocked = true;
        return new FakeWriter(this);
      }
    };
  }

  open(options: { baudRate: number; flowControl: 'none' | 'hardware'; bufferSize?: number }): Promise<void> {
    if (this.failOpen) return Promise.reject(new Error(this.failOpen));
    if (this.isOpen) return Promise.reject(new DOMException('The port is already open.', 'InvalidStateError'));
    this.isOpen = true;
    this.closed = false;
    this.openCount++;
    this.openArgs = options;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.events.push('port.close');
    if (this.failClose > 0) {
      this.failClose--;
      return Promise.reject(new Error('close failed'));
    }
    if (this.readerLocked || this.writerLocked) {
      return Promise.reject(new TypeError('Cannot close a port while its streams are locked'));
    }
    this.isOpen = false;
    this.closed = true;
    this.closeCount++;
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
