import {EventEmitter} from 'events';
import 'emscripten';


interface IFunctionDeclaration {
    arguments: ('string' | 'number' | 'array')[];
    returnType: 'string' | 'number';
}

interface IEMScriptOptions {
    wasm(): Promise<IEMScriptModule> | IEMScriptModule;
    asm(): Promise<IEMScriptModule> | IEMScriptModule;

    functions: {
        [functionName: string]: IFunctionDeclaration;
    }
}


type PromiseFunction<T> =
    T extends () => infer R ? () => Promise<R> :
    T extends (arg1: infer A1) => infer R ? (arg1: A1) => Promise<R> :
    T extends (arg1: infer A1, arg2: infer A2) => infer R ? (arg1: A1, arg2: A2) => Promise<R> :
    T extends (arg1: infer A1, arg2: infer A2, arg3: infer A3) => infer R ? (arg1: A1, arg2: A2, arg3: A3) => Promise<R> :
    T extends (arg1: infer A1, arg2: infer A2, arg3: infer A3, arg4: infer A4) => infer R ? (arg1: A1, arg2: A2, arg3: A3, arg4: A4) => Promise<R> :
    T extends (...args: (infer A)[]) => infer R ? (...args: A[]) => Promise<R> :
    never;

type Promisified<T> = {
    [P in keyof T]: PromiseFunction<T[P]>;
}

interface IEMainPromise {
    main(args: string[]): Promise<number>;
}

interface IEMMain {
    main(args: string[]): number;
}

interface ISTDInStream extends ISTDOutStream {
    readonly buffer: string;
    push(chunk: string): void;
    clear(): void;
}

interface ISTDOutStream {
    addListener(event: 'data', listener: (chunk: string) => void): this;

    on(event: 'data', listener: (chunk: string) => void): this;

    once(event: 'data', listener: (chunk: string) => void): this;

    prependListener(event: 'data', listener: (chunk: string) => void): this;

    prependOnceListener(event: 'data', listener: (chunk: string) => void): this;
}


interface IEMScriptWrapper {
    kill(signal?: string): void;

    stdin: ISTDInStream;
    stdout: ISTDOutStream;
    stderr: ISTDOutStream;

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
}

interface ISyncEMScriptWrapper<T> extends IEMScriptWrapper {
    readonly FileSystem: EMScriptFS;
    readonly fn: T;
}

interface IAsyncEMScriptWrapper<T> extends IEMScriptWrapper {
    readonly FileSystem: Promise<EMScriptFS>;
    readonly fn: Promisified<T>;

    sync(): Promise<ISyncEMScriptWrapper<T>>;
}

function buildAsyncFunctions<T>(that: {sync(): Promise<ISyncEMScriptWrapper<T>>}, functions: {[functioName: string]: IFunctionDeclaration} = {}): Promisified<T> {
    const obj: any = {};
    Object.entries(functions).forEach(([k, v]) => {
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

class EMScriptWrapper<T> extends EventEmitter implements IAsyncEMScriptWrapper<T>, IEMainPromise {
    readonly stdout = new STDOutStream();
    readonly stderr = new STDOutStream();
    readonly stdin = new STDInStream();

    private _module: Promise<IModule> | null = null;
    private _sync: Promise<ISyncEMScriptWrapper<T> & IEMMain> | null = null;

    readonly fn: Promisified<T>;

    constructor(private readonly _loader: () => Promise<IEMScriptModule>, options: Partial<IEMScriptOptions> & {main?: false}) {
        super();
        this.fn = buildAsyncFunctions<T>(this, options.functions);
    }

    private _load() {
        if (this._module) {
            return this._module;
        }
        this._module = this._loader().then((mod) => {
            return mod({
                print: this.stdout.push.bind(this.stdout),
                printErr: this.stderr.push.bind(this.stderr),
                stdin: this.stdin.read.bind(this.stdin),
                noInitialRun: true,
                noExitRuntime: true,
                quit: (status) => this.emit('quit', status),
            });
        });
        return this._module;
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
                return <ISyncEMScriptWrapper<T> & IEMMain>{
                    FileSystem: mod.FS,
                    on: this.on.bind(this),
                    once: this.once.bind(this),
                    prependListener: this.prependListener.bind(this),
                    prependOnceListener: this.prependOnceListener.bind(this),
                    addListener: this.addListener.bind(this),
                    kill: (signal) => mod.abort(signal),
                    stderr: this.stderr,
                    stdin: this.stdin,
                    stdout: this.stdout,
                    main: (args: string[]) => this._callMain(mod, args),
                    fn: buildSyncFunctions<T>(mod)
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



export default function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule>, options: Partial<IEMScriptOptions> & { main: false}): IAsyncEMScriptWrapper<T>;
export default function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule>, options: Partial<IEMScriptOptions>): IEMainPromise & IAsyncEMScriptWrapper<T>;
export default function createWrapper<T = {}>(loader: () => Promise<IEMScriptModule>, options: Partial<IEMScriptOptions> & {main?: false}): IEMainPromise & IAsyncEMScriptWrapper<T & IEMMain> {
    return new EMScriptWrapper<T & IEMMain>(loader, options);
}


// const wrapper = createWrapper<{
//     add_values(a: number, b: number): number;
// }>(() => <Promise<IEMScriptModule>><unknown>import('./helloworld'), {
//     functions: {
//         add_values: {arguments: ['number', 'string'], returnType: 'number'}
//     },
//     main: false,
// //    main: true
// });



