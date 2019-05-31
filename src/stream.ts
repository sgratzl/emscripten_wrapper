
class STDOutStream extends EventEmitter implements ISTDOutStream {
  push(chunk: string) {
      this.emit('data', chunk);
  };
}

class STDInStream extends EventEmitter implements ISTDInStream {
  buffer: string = '';

  push(chunk: string) {
      this.emit('data', chunk);
      this.buffer += chunk;
  };

  clear() {
      this.buffer = '';
  }

  read() {
      if (this.buffer.length === 0) {
          return null;
      }
      const next = this.buffer[0];
      this.buffer = this.buffer.slice(1);
      return next;
  }
}
