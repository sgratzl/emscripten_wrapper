import {EventEmitter} from 'events';

export interface IEMWOutStream {
  addListener(event: 'data', listener: (chunk: string) => void): this;

  on(event: 'data', listener: (chunk: string) => void): this;

  once(event: 'data', listener: (chunk: string) => void): this;

  prependListener(event: 'data', listener: (chunk: string) => void): this;

  prependOnceListener(event: 'data', listener: (chunk: string) => void): this;

  removeListener(event: 'data', listener: (chunk: string) => void): this;

  off(event: 'data', listener: (chunk: string) => void): this;

  removeAllListeners(event?: 'data'): this;
}


export interface IEMWInStream extends IEMWOutStream {
  readonly buffer: string;
  push(chunk: string): void;
  clear(): void;
}


export class SimpleOutStream extends EventEmitter implements IEMWOutStream {
  push(chunk: string) {
    this.emit('data', chunk);
  }
}

export class SimpleInStream extends EventEmitter implements IEMWInStream {
  buffer: string = '';

  push(chunk: string) {
    this.emit('data', chunk);
    this.buffer += chunk;
  }

  clear() {
    this.buffer = '';
  }

  read() {
    if (this.buffer.length === 0) {
      return null;
    }
    const next = this.buffer[0];
    this.buffer = this.buffer.slice(1);
    // need to return the number
    return next.charCodeAt(0);
  }
}
