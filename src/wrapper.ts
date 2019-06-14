import {EventEmitter} from 'events';
import {IEMScriptModule, EMScriptFS, IModule, IModuleOptions} from './module';
import {SimpleOutStream, SimpleInStream, IEMWInStream, IEMWOutStream} from './stream';
import {ModuleWorker, IMessageAdapter} from './ModuleWorker';
import {IEMWOptions, Promisified, ISimpleFS, ensureDir, IFunctionDeclaration} from './utils';
import {ModuleWorkerClient, IEMWWorkerClient, IWorkerLike} from './ModuleWorkerClient';

export interface IRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: Error;
}

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
  run(args?: string[], stdin?: string): Promise<IRunResult>;
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
  run(args?: string[], stdin?: string): IRunResult;
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
  readonly simpleFileSystem: ISimpleFS;
  /**
   * object of exposed functions
   */
  readonly fn: T;
}

export interface IAsyncEMWWrapperBase<T = {}> extends IEMWWrapper {
  readonly fileSystem: Promise<EMScriptFS>;
  readonly simpleFileSystem: ISimpleFS;

  /**
   * object of exposed functions
   */
  readonly fn: Promisified<T>;

  addListener(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  addListener(event: 'error', listener: (err: Error) => void): this;
  addListener(event: 'exit', listener: (code: number) => void): this;
  addListener(event: 'quit', listener: (status: number) => void): this;

  on(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  on(event: 'quit', listener: (status: number) => void): this;

  once(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'exit', listener: (code: number) => void): this;
  once(event: 'quit', listener: (status: number) => void): this;

  prependListener(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  prependListener(event: 'error', listener: (err: Error) => void): this;
  prependListener(event: 'exit', listener: (code: number) => void): this;
  prependListener(event: 'quit', listener: (status: number) => void): this;

  prependOnceListener(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  prependOnceListener(event: 'error', listener: (err: Error) => void): this;
  prependOnceListener(event: 'exit', listener: (code: number) => void): this;
  prependOnceListener(event: 'quit', listener: (status: number) => void): this;

  removeListener(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  removeListener(event: 'error', listener: (err: Error) => void): this;
  removeListener(event: 'exit', listener: (code: number) => void): this;
  removeListener(event: 'quit', listener: (status: number) => void): this;

  off(event: 'ready', listener: (wrapper: ISyncEMWWrapper<T>) => void): this;
  off(event: 'error', listener: (err: Error) => void): this;
  off(event: 'exit', listener: (code: number) => void): this;
  off(event: 'quit', listener: (status: number) => void): this;

  removeAllListeners(event?: 'ready'): this;
  removeAllListeners(event?: 'error'): this;
  removeAllListeners(event?: 'exit'): this;
  removeAllListeners(event?: 'quit'): this;
}

export interface IAsyncEMWWrapper<T = {}> extends IAsyncEMWWrapperBase<T> {
  /**
   * returns a sync version of this wrapper that was resolved then the module is ready
   */
  sync(): Promise<ISyncEMWWrapper<T>>;

  createWorker(adapter?: IMessageAdapter): ModuleWorker<T>;
  createWorkerClient(worker: IWorkerLike): IEMWWorkerClient<T>;
}

export interface IAsyncEMWMainWrapper<T = {}> extends IAsyncEMWWrapperBase<T>, IEMWMainPromise {
  /**
   * returns a sync version of this wrapper that was resolved then the module is ready
   */
  sync(): Promise<ISyncEMWWrapper<T> & IEMWMain>;

  createWorker(adapter?: IMessageAdapter): ModuleWorker<T>;
  createWorkerClient(worker: IWorkerLike): IEMWWorkerClient<T> & IEMWMainPromise;
}

declare type IModuleLike<T> = PromiseLike<T | {default: T}> | T | {default: T};
declare type IEMScriptModuleLike = IModuleLike<IEMScriptModule>;

export interface ILoaders {
  module(): IEMScriptModuleLike;
  wasm?(): IModuleLike<string | ArrayBuffer>;
  mem?(): IModuleLike<string | ArrayBuffer>;
  data?(): IModuleLike<string | ArrayBuffer>;
}

function loadHelper<T>(fn?: (() => IModuleLike<T>)): Promise<T | null> {
  if (!fn) {
    return Promise.resolve(null);
  }
  return Promise.resolve(fn()).then((modOrDefault) => {
    if (modOrDefault && typeof (<{default: T}>modOrDefault).default !== 'undefined') {
      return (<{default: T}>modOrDefault).default;
    }
    return <T>modOrDefault;
  });
}

function string2arrayBuffer(str: string) {
  const buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
  const bufView = new Uint16Array(buf);
  for (let i = 0; i < str.length; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function buildAsyncFunctions<T>(that: {sync(): Promise<{fn: any}>}, functions: {[functioName: string]: IFunctionDeclaration} = {}): Promisified<T> {
  const obj: any = {};
  Object.keys(functions).forEach((k) => {
    obj[k] = (...args: any[]) => that.sync().then((mod) => mod.fn[k](...args));
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


  readonly simpleFileSystem: ISimpleFS;

  constructor(private readonly _loaders: ILoaders, private readonly options: Partial<IEMWOptions> & {main?: false} = {}) {
    super();
    this.fn = buildAsyncFunctions<T>(this, options.functions);

    this.simpleFileSystem = {
      ensureDir: (dir) => this.fileSystem.then((fs) => {
        ensureDir(fs, dir);
        return <true>true;
      }),
      readBinaryFile: (path) => this.fileSystem.then((fs) => {
        return fs.readFile(path);
      }),
      readTextFile: (path) => this.fileSystem.then((fs) => {
        return fs.readFile(path, {encoding: 'utf8', flags: 'r'});
      }),
      writeTextFile: (path, content) => this.fileSystem.then((fs) => {
        fs.writeFile(path, content, {encoding: 'utf8', flags: 'w'});
        return <true>true;
      }),
      writeBinaryFile: (path, content) => this.fileSystem.then((fs) => {
        fs.writeFile(path, content);
        return <true>true;
      })
    };
  }

  private _load() {
    if (this.module) {
      return this.module;
    }
    let readyResolve: (() => void) | null = null;
    this.readySemaphore = new Promise((resolve) => readyResolve = resolve);

    this.module = Promise.all([loadHelper(this._loaders.module), loadHelper(this._loaders.wasm), loadHelper(this._loaders.mem), loadHelper(this._loaders.data)]).then(([mod, wasm, mem, data]) => {
      const modOptions: Partial<IModuleOptions> = {
        // readd missing new line
        print: (chunk) => this.stdout.push(`${chunk}\n`),
        printErr: (chunk) => this.stderr.push(`${chunk}\n`),
        stdin: () => this.stdin.read(),
        noInitialRun: true,
        noExitRuntime: true,
        onRuntimeInitialized: () => {
          setTimeout(() => readyResolve!(), 1);
        },
        quit: (status) => {
          this.emit('quit', status);
        }
      };

      // console.log(wasm, data, mem);
      const toLocate: {suffix: string, location: string}[] = [];

      // WASM
      if (wasm instanceof ArrayBuffer || (typeof wasm === 'string' && !wasm.endsWith('.wasm'))) {
        // array buffer or a string which is an arraybuffer
        if (typeof wasm === 'string') {
          wasm = string2arrayBuffer(wasm);
        }
        modOptions.wasmBinary = wasm;
      } else if (typeof wasm === 'string') {
        // location
        toLocate.push({suffix: '.wasm', location: wasm});
      }

      // DATA
      if (data instanceof ArrayBuffer || (typeof data === 'string' && !data.endsWith('.data'))) {
        // array buffer or a string which is an arraybuffer
        const d = (typeof data === 'string') ? string2arrayBuffer(data) : data;
        modOptions.getPreloadedPackage = () => d;
      } else if (typeof data === 'string') {
        // location
        toLocate.push({suffix: '.data', location: data});
      }

      // MemoryDump
      if (mem instanceof ArrayBuffer || (typeof mem === 'string' && !mem.endsWith('.mem'))) {
        // array buffer or a string which is an arraybuffer
        if (typeof mem === 'string') {
          mem = string2arrayBuffer(mem);
        }
        modOptions.memoryInitializerRequest = {response: mem, status: 200};
      } else if (typeof mem === 'string') {
        // location
        toLocate.push({suffix: '.mem', location: mem});
      }

      if (toLocate.length > 0) {
        modOptions.locateFile = (name, prefix) => {
          const entry = toLocate.find((d) => name.endsWith(d.suffix));
          return entry ? entry.location : `${prefix || ''}${name}`;
        };
      }

      const m = mod!(modOptions);
      // wrap module since it has a 'then' by itself and then the promise thinks it is another promise to wait for
      // however the then doesn't work properly
      return {mod: m};
    });
    return this.module;
  }

  main(args?: string[]) {
    return this.sync().then((mod) => mod.main(args));
  }

  run(args?: string[], stdin?: string) {
    return this.sync().then((mod) => mod.run(args, stdin));
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

  private _runMain(mod: IModule, args?: string[], stdin?: string) {
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

    console.log('_runMain', args, stdin);
    if (stdin) {
      this.stdin.clear();
      this.stdin.push(stdin);
    }

    try {
      mod.callMain(args || []);
    } catch (error) {
      statusError = error;
    } finally {
      this.off('quit', quitListener);
      this.stdout.off('data', stdoutListener);
      this.stderr.off('data', stderrListener);
      if (stdin) {
        this.stdin.clear();
      }
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
      run: (args?: string[], stdin?: string) => this._runMain(mod, args, stdin),
      fn: buildSyncFunctions<T>(mod, this.options.functions),
      simpleFileSystem: {
        ensureDir: (dir) => {
          ensureDir(mod.FS, dir);
          return Promise.resolve(<true>true);
        },
        readBinaryFile: (path) => {
          return Promise.resolve(mod.FS.readFile(path));
        },
        readTextFile: (path) => {
          return Promise.resolve(mod.FS.readFile(path, {encoding: 'utf8', flags: 'r'}));
        },
        writeTextFile: (path, content) => {
          mod.FS.writeFile(path, content, {encoding: 'utf8', flags: 'w'});
          return Promise.resolve(<true>true);
        },
        writeBinaryFile: (path, content) => {
          mod.FS.writeFile(path, content);
          return Promise.resolve(<true>true);
        }
      }
    };
  }

  sync() {
    if (this._sync) {
      return this._sync;
    }
    return this._sync = this._load()
      .then((mod) => this.readySemaphore!.then(() => mod)) // wait for ready
      .then((mod) => {
        const wrapper = this.module2wrapper(mod.mod);
        this.emit('ready', wrapper);
        return wrapper;
      });
  }

  emit(event: 'ready', wrapper: ISyncEMWWrapper<T> & IEMWMain): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(event: 'exit', code: number): boolean;
  emit(event: 'quit', status: number): boolean;
  emit(event: string | symbol, ...args: any[]) {
    return super.emit(event, ...args);
  }

  // TODO if there is an exception in ccall and a converter was used (array or string) stackRestore won't be called

  createWorker(adapter?: IMessageAdapter): ModuleWorker<T> {
    return new ModuleWorker<T>(this, adapter);
  }

  createWorkerClient(worker: IWorkerLike) {
    return new ModuleWorkerClient<T>(worker, this.options);
  }
}

/**
 * creates an easy to use wrapper around an emscripten module
 * @param loader loader function to return the emscripten module
 * @param options additional options foremost which functions and whether a main function is available
 */
export function createWrapper<T = {}>(loaders: (() => IEMScriptModuleLike) | ILoaders, options?: Partial<IEMWOptions> & {main: false}): IAsyncEMWWrapper<T>;
export function createWrapper<T = {}>(loaders: (() => IEMScriptModuleLike) | ILoaders, options?: Partial<IEMWOptions>): IAsyncEMWMainWrapper<T>;
export function createWrapper<T = {}>(loaders: (() => IEMScriptModuleLike) | ILoaders, options?: Partial<IEMWOptions> & {main?: false}): IAsyncEMWMainWrapper<T> {
  return new EMScriptWrapper<T>(typeof loaders === 'function' ? {module: loaders} : loaders, options);
}

export default createWrapper;
