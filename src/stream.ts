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
  // clear buffer but keep in EAGAIN state
  clear(): void;
  // clear the stdin stream for good
  close(): void;
}


export class SimpleOutStream extends EventEmitter implements IEMWOutStream {
  push(chunk: string) {
    this.emit('data', chunk);
  }
}

// stream ended
const EOF = null;
// https://web.archive.org/web/20130508062559/http://www.wlug.org.nz/EAGAIN
// if used then the stream is not closed and no magic flag is set
const EAGAIN = undefined;

export class SimpleInStream extends EventEmitter implements IEMWInStream {
  buffer: string = '';
  private emptyFlag: null | undefined = EAGAIN;

  push(chunk: string) {
    this.emit('data', chunk);
    this.buffer += chunk;
  }

  close() {
    this.buffer = '';
    this.emptyFlag = EOF;
    this.emit('close');
  }

  clear() {
    this.buffer = '';
    this.emptyFlag = EAGAIN;
    this.emit('clear');
  }

  read() {
    if (this.buffer.length === 0) {
      return this.emptyFlag;
    }
    const next = this.buffer[0];
    this.buffer = this.buffer.slice(1);
    // need to return the number
    return next.charCodeAt(0);
  }
}
