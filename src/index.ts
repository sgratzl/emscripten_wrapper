import {EventEmitter} from 'events';
import {IEMScriptModule, EMScriptFS, IModule} from './module';
import {SimpleOutStream, SimpleInStream, IEMWInStream, IEMWOutStream} from './stream';

export * from './module';
export {IEMWInStream, IEMWOutStream} from './stream';


export interface IFunctionDeclaration {
  /**
   * defines the argument types, supported types are string and number, arrays have to be Uint8Typed Arrays to work
   */
  arguments: ('string' | 'number' | 'array')[];
  /**
   * defines the return type of this function
   */
  returnType: 'string' | 'number';
}

export interface IEMWOptions {
  /**
   * function defintions that will be available via `.fn`
   */
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
};

export interface IEMWMainPromise {
  /**
   * executes the main function returns or throws an error
   * @param args optional main arguments
   */
  main(args?: string[]): Promise<number>;

  /**
   * similar to main but returns a status object including stdout, stderr, and the exitCode
   * @param args optional main arguments
   */
  run(args?: string[]): Promise<{stdout: string, stderr: string, exitCode: number, error?: Error}>;
}

export interface IEMWMain {
  /**
   * executes the main function returns or throws an error
   * @param args optional main arguments
   */
  main(args?: string[]): number;

  /**
   * similar to main but returns a status object including stdout, stderr, and the exitCode
   * @param args optional main arguments
   */
  run(args?: string[]): {stdout: string, stderr: string, exitCode: number, error?: Error};
}

export interface IEMWWrapper {
  readonly environmentVariables: {[key: string]: string};

  kill(signal?: string): void;

  readonly stdin: IEMWInStream;
  readonly stdout: IEMWOutStream;
  readonly stderr: IEMWOutStream;

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
  readonly fileSystem: EMScriptFS;
  /**
   * object of exposed functions
   */
  readonly fn: T;
}

export interface IAsyncEMWWrapper<T = {}> extends IEMWWrapper {
  readonly fileSystem: Promise<EMScriptFS>;
  /**
   * object of exposed functions
   */
  readonly fn: Promisified<T>;

  /**
   * returns a sync version of this wrapper that was resolved then the module is ready
   */
  sync(): Promise<ISyncEMWWrapper<T>>;
}

export interface IAsyncEMWMainWrapper<T = {}> extends IEMWWrapper, IEMWMainPromise {
  readonly fileSystem: Promise<EMScriptFS>;
  /**
   * object of exposed functions
   */
  readonly fn: Promisified<T>;

  /**
   * returns a sync version of this wrapper that was resolved then the module is ready
   */
  sync(): Promise<ISyncEMWWrapper<T> & IEMWMain>;
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

class EMScriptWrapper<T> extends EventEmitter implements IAsyncEMWMainWrapper<T> {
  readonly stdout = new SimpleOutStream();
  readonly stderr = new SimpleOutStream();
  readonly stdin = new SimpleInStream();

  private module: Promise<{mod: IModule}> | null = null;
  private readySemaphore: Promise<void> | null = null;
  private _sync: Promise<ISyncEMWWrapper<T> & IEMWMain> | null = null;

  readonly fn: Promisified<T>;
  environmentVariables: {[key: string]: string} = {};

  constructor(private readonly _loader: () => Promise<IEMScriptModule | {default: IEMScriptModule}> | IEMScriptModule | {default: IEMScriptModule}, private readonly options: Partial<IEMWOptions> & {main?: false} = {}) {
    super();
    this.fn = buildAsyncFunctions<T>(this, options.functions);
  }

  private _load() {
    if (this.module) {
      return this.module;
    }
    let readyResolve: (() => void) | null = null;
    this.readySemaphore = new Promise((resolve) => readyResolve = resolve);

    this.module = Promise.resolve(this._loader()).then((loaded) => {
      // export fix
      const mod = (typeof (<{default: IEMScriptModule}>loaded).default === 'function') ? (<{default: IEMScriptModule}>loaded).default : <IEMScriptModule>loaded;

      const m = mod({
        print: this.stdout.push.bind(this.stdout),
        printErr: this.stderr.push.bind(this.stderr),
        stdin: this.stdin.read.bind(this.stdin),
        noInitialRun: true,
        noExitRuntime: true,
        onRuntimeInitialized: () => {
          setTimeout(() => readyResolve!(), 1);
        },
        quit: (status) => {
          this.emit('quit', status);
        }
      });
      // wrap module since it has a 'then' by itself and then the promise thinks it is another promise to wait for
      // however the then doesn't work properly
      return {mod: m};
    });
    return this.module;
  }

  main(args?: string[]) {
    return this.sync().then((mod) => mod.main(args));
  }

  run(args?: string[]) {
    return this.sync().then((mod) => mod.run(args));
  }

  kill(signal?: string) {
    return this.sync().then((mod) => mod.kill(signal));
  }

  get fileSystem() {
    return this._load().then((mod) => mod.mod.FS);
  }

  private _callMain(mod: IModule, args?: string[]) {
    let statusCode = 0;
    let statusError: Error | null = null;
    const quitListener = (status: number, error: Error) => {
      statusCode = status;
      statusError = error;
    };
    this.on('quit', quitListener);
    try {
      mod.callMain(args || []);

      if (statusCode > 0 && statusError) {
        throw statusError;
      }
      return statusCode;
    }
    finally {
      this.off('quit', quitListener);
    }
  }

  private _runMain(mod: IModule, args?: string[]) {
    let statusCode = 0;
    let statusError: Error | null = null;
    let stdout = '';
    let stderr = '';

    const quitListener = (status: number, error: Error) => {
      statusCode = status;
      statusError = error;
    };
    this.on('quit', quitListener);
    const stdoutListener = (chunk: string) => {
      stdout += chunk;
    };
    this.stdout.on('data', stdoutListener);
    const stderrListener = (chunk: string) => {
      stderr += chunk;
    };
    this.stderr.on('data', stderrListener);
    try {
      mod.callMain(args || []);
    } catch (error) {
      statusError = error;
    } finally {
      this.off('quit', quitListener);
      this.stdout.off('data', stdoutListener);
      this.stderr.off('data', stderrListener);
    }
    return {
      stdout,
      stderr,
      exitCode: statusCode,
      error: statusError || undefined
    };
  }

  private module2wrapper(mod: IModule) {
    const that = this;
    // inject environment variables that where set before
    Object.assign(mod.ENV, this.environmentVariables);
    this.environmentVariables = mod.ENV;

    return <ISyncEMWWrapper<T> & IEMWMain>{
      fileSystem: mod.FS,
      environmentVariables: mod.ENV,
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
      main: (args?: string[]) => this._callMain(mod, args),
      run: (args?: string[]) => this._runMain(mod, args),
      fn: buildSyncFunctions<T>(mod, this.options.functions)
    };
  }

  sync() {
    if (this._sync) {
      return this._sync;
    }
    return this._sync = this._load()
      .then((mod) => this.readySemaphore!.then(() => mod)) // wait for ready
      .then((mod) => this.module2wrapper(mod.mod));
  }

  emit(event: 'error', err: Error): boolean;
  emit(event: 'exit', code: number): boolean;
  emit(event: 'quit', status: number): boolean;
  emit(event: string | symbol, ...args: any[]) {
    return super.emit(event, ...args);
  }

  // TODO if there is an exception in ccall and a converter was used (array or string) stackRestore won't be called
}


/**
 * creates an easy to use wrapper around an emscripten module
 * @param loader loader function to return the emscripten module
 * @param options additional options foremost which functions and whether a main function is available
 */
export function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule | {default: IEMScriptModule}> | IEMScriptModule | {default: IEMScriptModule}, options?: Partial<IEMWOptions> & {main: false}): IAsyncEMWWrapper<T>;
export function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule | {default: IEMScriptModule}> | IEMScriptModule | {default: IEMScriptModule}, options?: Partial<IEMWOptions>): IAsyncEMWMainWrapper<T>;
export function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule | {default: IEMScriptModule}> | IEMScriptModule | {default: IEMScriptModule}, options?: Partial<IEMWOptions> & {main?: false}): IAsyncEMWMainWrapper<T> {
  return new EMScriptWrapper<T>(loader, options);
}

export default createWrapper;
