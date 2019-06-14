import {EventEmitter} from 'events';
import {IFunctionReplyMessage, IMainReplyMessage, IModuleMessage, IReadBinaryFileReplyMessage, IReadTextFileReplyMessage, IReplyMessage, ISetEnvironmentVariableRequestMessage} from './ModuleWorker';
import {SimpleInStream, SimpleOutStream} from './stream';
import {IEMWOptions, Promisified, ISimpleFS} from './utils';
import {IEMWMainPromise, IEMWWrapper} from './wrapper';


export interface IEMWWorkerClient<T = {}> extends IEMWWrapper {
  /**
   * object of exposed functions
   */
  readonly fn: Promisified<T>;

  readonly simpleFileSystem: ISimpleFS;

  addListener(event: 'ready', listener: () => void): this;
  addListener(event: 'error', listener: (err: Error) => void): this;
  addListener(event: 'exit', listener: (code: number) => void): this;
  addListener(event: 'quit', listener: (status: number) => void): this;

  on(event: 'ready', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  on(event: 'quit', listener: (status: number) => void): this;

  once(event: 'ready', listener: () => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'exit', listener: (code: number) => void): this;
  once(event: 'quit', listener: (status: number) => void): this;

  prependListener(event: 'ready', listener: () => void): this;
  prependListener(event: 'error', listener: (err: Error) => void): this;
  prependListener(event: 'exit', listener: (code: number) => void): this;
  prependListener(event: 'quit', listener: (status: number) => void): this;

  prependOnceListener(event: 'ready', listener: () => void): this;
  prependOnceListener(event: 'error', listener: (err: Error) => void): this;
  prependOnceListener(event: 'exit', listener: (code: number) => void): this;
  prependOnceListener(event: 'quit', listener: (status: number) => void): this;

  removeListener(event: 'ready', listener: () => void): this;
  removeListener(event: 'error', listener: (err: Error) => void): this;
  removeListener(event: 'exit', listener: (code: number) => void): this;
  removeListener(event: 'quit', listener: (status: number) => void): this;

  off(event: 'ready', listener: () => void): this;
  off(event: 'error', listener: (err: Error) => void): this;
  off(event: 'exit', listener: (code: number) => void): this;
  off(event: 'quit', listener: (status: number) => void): this;

  removeAllListeners(event?: 'ready'): this;
  removeAllListeners(event?: 'error'): this;
  removeAllListeners(event?: 'exit'): this;
  removeAllListeners(event?: 'quit'): this;
}

export interface IWorkerLike {
  addEventListener(type: 'message', callback: (msg: MessageEvent) => void): void;
  postMessage(msg: any, transfer?: Transferable[]): void;
  terminate(): void;
}

export class ModuleWorkerClient<T = {}> extends EventEmitter implements IEMWWorkerClient<T>, IEMWMainPromise {
  readonly fn: Promisified<T>;
  readonly environmentVariables: {[key: string]: string};

  readonly simpleFileSystem: ISimpleFS;

  readonly stdout = new SimpleOutStream();
  readonly stderr = new SimpleOutStream();
  readonly stdin = new SimpleInStream();

  private keyCounter: number = 0;

  constructor(protected readonly worker: IWorkerLike, options: Partial<IEMWOptions> = {}) {
    super();
    this.worker.addEventListener('message', this.onMessage.bind(this));

    this.on('message', (msg: IReplyMessage) => {
      switch (msg.type) {
        case 'ready':
          this.emit('ready');
          break;
        case 'exit':
          this.emit('exit', msg.code);
          break;
        case 'quit':
          this.emit('quit', msg.status);
          break;
        case 'stdout':
          this.stdout.push(msg.chunk);
          break;
        case 'stderr':
          this.stderr.push(msg.chunk);
          break;
        case 'error':
          this.emit('error', msg.error);
          break;
      }
    });
    this.stdin.on('data', (chunk) => this.postMessage({key: this.nextKey(), type: 'stdin', chunk}));
    this.stdin.on('clear', () => this.postMessage({key: this.nextKey(), type: 'stdinClear'}));

    const obj: any = {};
    Object.keys(options.functions || {}).forEach((k) => {
      obj[k] = (...args: any[]) => this.sendAndWait<IFunctionReplyMessage, any>({type: 'fn', function: k, args}, [], (msg) => msg.type === 'fn', (msg) => msg.returnValue);
    });
    this.fn = obj;

    this.simpleFileSystem = {
      ensureDir: (path) => this.sendAndWaitOK({type: 'ensureDir', path}),
      writeTextFile: (path, content) => this.sendAndWaitOK({type: 'writeTextFile', path, content}),
      writeBinaryFile: (path, content) => this.sendAndWaitOK({type: 'writeBinaryFile', path, content}),
      readTextFile: (path) => this.sendAndWait<IReadTextFileReplyMessage, string>({type: 'readTextFile', path}, [], (msg) => msg.type === 'readTextFile', (msg) => msg.content),
      readBinaryFile: (path) => this.sendAndWait<IReadBinaryFileReplyMessage, ArrayBufferView>({type: 'readBinaryFile', path}, [], (msg) => msg.type === 'readBinaryFile', (msg) => msg.content)
    };

    this.environmentVariables = new Proxy(<{[key: string]: string}>{}, {
      get: (obj: any, prop) => {
        return obj[prop];
      },
      set: (obj: any, prop, value) => {
        obj[prop] = value;
        // forward to worker
        this.postMessage(<ISetEnvironmentVariableRequestMessage>{key: this.nextKey(), type: 'setEnv', name: prop, value});
        return true;
      }
    });
  }

  protected nextKey() {
    return (this.keyCounter++).toString();
  }

  protected postMessage(msg: IModuleMessage & {[key: string]: any}, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private onMessage(ev: MessageEvent) {
    const msg = <IReplyMessage>ev.data;
    if (!msg.type || !msg.key) {
      console.log('no message type or key given');
    }
    this.emit('message', msg);
  }

  protected sendAndWait<MSG, R>(msg: {type: string, [key: string]: any}, transfer: Transferable[], filter: (msg: IReplyMessage) => boolean, handle: (v: MSG) => R): Promise<R> {
    return new Promise<R>((resolve) => {
      const key = this.nextKey();
      const listener = (msg: IReplyMessage) => {
        if (msg.key !== key || !filter(msg)) {
          return;
        }
        this.off('message', listener);

        resolve(handle(<MSG><unknown>msg));
      };
      this.on('message', listener);
      this.postMessage(Object.assign({key}, msg), transfer);
    });
  }

  protected sendAndWaitOK(msg: {type: string, [key: string]: any}, transfer: Transferable[] = []): Promise<true> {
    return this.sendAndWait<any, true>(msg, transfer, (msg) => msg.type === 'ok', () => true);
  }

  main(args?: string[]) {
    return this.run(args).then((r) => r.exitCode);
  }

  run(args: string[] = [], stdin?: string) {
    return this.sendAndWait<IMainReplyMessage, {exitCode: number, stdout: string, stderr: string}>(
      {type: 'run', args, stdin}, [],
      (msg) => msg.type === 'run', (msg) => {
        return {
          error: msg.error,
          exitCode: msg.exitCode,
          stderr: msg.stderr,
          stdout: msg.stdout
        };
    });
  }

  kill() {
    this.worker.terminate();
  }


  emit(event: 'ready'): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(event: 'message', message: IReplyMessage): boolean;
  emit(event: 'exit', code: number): boolean;
  emit(event: 'quit', status: number): boolean;
  emit(event: string | symbol, ...args: any[]) {
    return super.emit(event, ...args);
  }
}
