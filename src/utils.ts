import {IModule} from './module';


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


export function ensureDir(fileSystem: {mkdir(name: string): void}, dir: string) {
  try {
    fileSystem.mkdir(dir);
  } catch {
    // ignore
  }
}


export function buildAsyncFunctions<T>(that: {sync(): Promise<{fn: any}>}, functions: {[functioName: string]: IFunctionDeclaration} = {}): Promisified<T> {
  const obj: any = {};
  Object.keys(functions).forEach((k) => {
    obj[k] = (...args: any[]) => that.sync().then((mod) => mod.fn[k](...args));
  });
  return obj;
}

export function buildSyncFunctions<T>(mod: IModule, functions: {[functioName: string]: IFunctionDeclaration} = {}): T {
  const obj: any = {};
  Object.entries(functions).forEach(([k, v]) => {
    obj[k] = mod.cwrap(k, v.returnType, v.arguments);
  });
  return obj;
}
