import {EventEmitter} from 'events';
import {IEMScriptModule, EMScriptFS, IModule} from './module';
import {SimpleOutStream, SimpleInStream, IEMWInStream, IEMWOutStream} from './stream';

export * from './module';
export {IEMWInStream, IEMWOutStream} from './stream';


export interface IFunctionDeclaration {
  arguments: ('string' | 'number' | 'array')[];
  returnType: 'string' | 'number';
}

export interface IEMWOptions {
  functions: {[functionName: string]: IFunctionDeclaration};
}


export type PromiseFunction<T> =
  T extends () => infer R ? () => Promise<R> :
  T extends (arg1: infer A1) => infer R ? (arg1: A1) => Promise<R> :
  T extends (arg1: infer A1, arg2: infer A2) => infer R ? (arg1: A1, arg2: A2) => Promise<R> :
  T extends (arg1: infer A1, arg2: infer A2, arg3: infer A3) => infer R ? (arg1: A1, arg2: A2, arg3: A3) => Promise<R> :
  T extends (arg1: infer A1, arg2: infer A2, arg3: infer A3, arg4: infer A4) => infer R ? (arg1: A1, arg2: A2, arg3: A3, arg4: A4) => Promise<R> :
  T extends (...args: (infer A)[]) => infer R ? (...args: A[]) => Promise<R> :
  never;

export type Promisified<T> = {
  [P in keyof T]: PromiseFunction<T[P]>;
}

export interface IEMWMainPromise {
  main(args: string[]): Promise<number>;
}

export interface IEMWMain {
  main(args: string[]): number;
}

export interface IEMWWrapper {
  kill(signal?: string): void;

  stdin: IEMWInStream;
  stdout: IEMWOutStream;
  stderr: IEMWOutStream;

  addListener(event: 'error', listener: (err: Error) => void): this;
  addListener(event: 'exit', listener: (code: number) => void): this;
  addListener(event: 'quit', listener: (status: number) => void): this;

  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  on(event: 'quit', listener: (status: number) => void): this;

  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'exit', listener: (code: number) => void): this;
  once(event: 'quit', listener: (status: number) => void): this;

  prependListener(event: 'error', listener: (err: Error) => void): this;
  prependListener(event: 'exit', listener: (code: number) => void): this;
  prependListener(event: 'quit', listener: (status: number) => void): this;

  prependOnceListener(event: 'error', listener: (err: Error) => void): this;
  prependOnceListener(event: 'exit', listener: (code: number) => void): this;
  prependOnceListener(event: 'quit', listener: (status: number) => void): this;

  removeListener(event: 'error', listener: (err: Error) => void): this;
  removeListener(event: 'exit', listener: (code: number) => void): this;
  removeListener(event: 'quit', listener: (status: number) => void): this;

  off(event: 'error', listener: (err: Error) => void): this;
  off(event: 'exit', listener: (code: number) => void): this;
  off(event: 'quit', listener: (status: number) => void): this;

  removeAllListeners(event?: 'error'): this;
  removeAllListeners(event?: 'exit'): this;
  removeAllListeners(event?: 'quit'): this;
}

export interface ISyncEMWWrapper<T> extends IEMWWrapper {
  readonly FileSystem: EMScriptFS;
  readonly fn: T;
}

export interface IAsyncEMWWrapper<T> extends IEMWWrapper {
  readonly FileSystem: Promise<EMScriptFS>;
  readonly fn: Promisified<T>;

  sync(): Promise<ISyncEMWWrapper<T>>;
}

function buildAsyncFunctions<T>(that: {sync(): Promise<ISyncEMWWrapper<T>>}, functions: {[functioName: string]: IFunctionDeclaration} = {}): Promisified<T> {
  const obj: any = {};
  Object.keys(functions).forEach((k) => {
    obj[k] = (...args: any[]) => that.sync().then((mod) => (<any>mod.fn)[k](...args));
  });
  return obj;
}

function buildSyncFunctions<T>(mod: IModule, functions: {[functioName: string]: IFunctionDeclaration} = {}): T {
  const obj: any = {};
  Object.entries(functions).forEach(([k, v]) => {
    obj[k] = mod.cwrap(k, v.returnType, v.arguments);
  });
  return obj;
}

class EMScriptWrapper<T> extends EventEmitter implements IAsyncEMWWrapper<T>, IEMWMainPromise {
  readonly stdout = new SimpleOutStream();
  readonly stderr = new SimpleOutStream();
  readonly stdin = new SimpleInStream();

  private module: Promise<IModule> | null = null;
  private _sync: Promise<ISyncEMWWrapper<T> & IEMWMain> | null = null;

  readonly fn: Promisified<T>;

  constructor(private readonly _loader: () => Promise<IEMScriptModule>, private readonly options: Partial<IEMWOptions> & {main?: false} = {}) {
    super();
    this.fn = buildAsyncFunctions<T>(this, options.functions);
  }

  private _load() {
    if (this.module) {
      return this.module;
    }
    this.module = this._loader().then((mod) => {
      // export fix
      if ((<any>mod).default === 'function') {
        mod = (<any>mod).default;
      }
      return mod({
        print: this.stdout.push.bind(this.stdout),
        printErr: this.stderr.push.bind(this.stderr),
        stdin: this.stdin.read.bind(this.stdin),
        noInitialRun: true,
        noExitRuntime: true,
        quit: (status) => this.emit('quit', status),
      });
    });
    return this.module;
  }

  main(args: string[]) {
    return this.sync().then((mod) => mod.main(args));
  }

  kill(signal?: string) {
    return this.sync().then((mod) => mod.kill(signal));
  }

  get FileSystem() {
    return this._load().then((mod) => mod.FS);
  }

  private _callMain(mod: IModule, args: string[]) {
    let statusCode = 0;
    let statusError: Error | null = null;
    const quitListener = (status: number, error: Error) => {
      statusCode = status;
      statusError = error;
    }
    this.on('quit', quitListener);
    try {
      mod.callMain(args);

      if (statusCode > 0 && statusError) {
        throw statusError;
      }
      return statusCode;
    }
    finally {
      this.off('quit', quitListener);
    }
  }

  sync() {
    if (this._sync) {
      return this._sync;
    }
    return this._load()
      .then((mod) => new Promise<IModule>((resolve) => mod.then(resolve))) // wait for ready
      .then((mod) => {
        const that = this;
        return <ISyncEMWWrapper<T> & IEMWMain>{
          FileSystem: mod.FS,
          on(event: string, listener: (...args: any[]) => void) {
            that.on(event, listener); return this;
          },
          once(event: string, listener: (...args: any[]) => void) {
            that.once(event, listener); return this;
          },
          prependListener(event: string, listener: (...args: any[]) => void) {
            that.prependListener(event, listener); return this;
          },
          prependOnceListener(event: string, listener: (...args: any[]) => void) {
            that.prependOnceListener(event, listener); return this;
          },
          addListener(event: string, listener: (...args: any[]) => void) {
            that.addListener(event, listener); return this;
          },
          removeListener(event: string, listener: (...args: any[]) => void) {
            that.removeListener(event, listener); return this;
          },
          off(event: string, listener: (...args: any[]) => void) {
            that.off(event, listener); return this;
          },
          removeAllListeners(event?: string) {
            that.removeAllListeners(event); return this;
          },
          kill: (signal) => mod.abort(signal),
          stderr: this.stderr,
          stdin: this.stdin,
          stdout: this.stdout,
          main: (args: string[]) => this._callMain(mod, args),
          fn: buildSyncFunctions<T>(mod, this.options.functions)
        };
      });
  }

  emit(event: 'error', err: Error): boolean;
  emit(event: 'exit', code: number): boolean;
  emit(event: 'quit', status: number): boolean;
  emit(event: string | symbol, ...args: any[]) {
    return super.emit(event, ...args);
  }

  // TODO if there is an exception in ccall and a converter was used (array or string) stackRestore won't be called
}



export default function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule>, options?: Partial<IEMWOptions> & {main: false}): IAsyncEMWWrapper<T>;
export default function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule>, options?: Partial<IEMWOptions>): IEMWMainPromise & IAsyncEMWWrapper<T & IEMWMain>;
export default function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule>, options?: Partial<IEMWOptions> & {main?: false}): IEMWMainPromise & IAsyncEMWWrapper<T & IEMWMain> {
  return new EMScriptWrapper<T & IEMWMain>(loader, options);
}
