
import 'emscripten';

export type EMScriptFS = typeof FS;

export interface IExitStatus extends Error {
  name: string;
  message: string;
  status: number;
}

export interface IModuleOptions {
  arguments: string[];

  print(str: string): void;
  printErr(str: string): void;

  noInitialRun: boolean;
  noExitRuntime: boolean;

  getPreloadedPackage(remotePackageName: string, remotePackageSize: number): ArrayBuffer | null;
  locateFile(url: string, prefix?: string): string;

  stdin(): string | null;
  stdout(chunk: string): void;
  stderr(chunk: string): void;

  onAbort(what?: string): void;
  quit(code: number, status: IExitStatus): void;
  onExit(code: number): void;

  onRuntimeInitialized(): void;

  setStatus(status: string): void;
}

export interface IModule {
  ccall(ident: string, returnType: 'string' | 'number' | null, argTypes: ('string' | 'number' | 'array')[], args: any[]): any;
  cwrap(ident: string, returnType: 'string' | 'number' | null, argTypes: ('string' | 'number' | 'array')[]): Function;
  abort(what?: string): void;
  callMain(args: string[]): void;
  stackSave(): number;
  stackRestore(saveNumber: number): void;

  then(callback: (module: IModule) => void): this;

  FS: EMScriptFS;
}

export interface IEMScriptModule {
  (module: Partial<IModuleOptions>): IModule;
}
