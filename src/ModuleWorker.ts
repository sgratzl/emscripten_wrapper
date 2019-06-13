import {IAsyncEMWWrapper, ISyncEMWWrapper} from './wrapper';
import {ensureDir} from './utils';

export interface IModuleMessage {
  key: string;
}

export interface IErrorReplyMessage extends IModuleMessage {
  type: 'error';
  error: Error;
  stdout: string;
  stderr: string;
}

export interface IOkReplyMessage extends IModuleMessage {
  type: 'ok';
}

export interface IMainRequestMessage extends IModuleMessage {
  type: 'main';
  args: string[];
}

export interface IMainReplyMessage extends IModuleMessage {
  type: 'main';
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface IFunctionRequestMessage extends IModuleMessage {
  type: 'fn';
  function: string;
  args: (string | number | Uint8Array)[];
}

export interface IFunctionReplyMessage extends IModuleMessage {
  type: 'fn';
  function: string;
  returnValue: (string | number | null);
}

export interface ISetEnvironmentVariableRequestMessage extends IModuleMessage {
  type: 'setEnv';
  name: string;
  value: string;
}

export interface IWriteTextFileRequestMessage extends IModuleMessage {
  type: 'writeTextFile';
  path: string;
  content: string;
}

export interface IWriteBinaryFileRequestMessage extends IModuleMessage {
  type: 'writeBinaryFile';
  path: string;
  content: ArrayBufferView;
}

export interface IReadTextFileRequestMessage extends IModuleMessage {
  type: 'readTextFile';
  path: string;
}

export interface IReadTextFileReplyMessage extends IModuleMessage {
  type: 'readTextFile';
  path: string;
  content: string;
}

export interface IReadBinaryFileRequestMessage extends IModuleMessage {
  type: 'readBinaryFile';
  path: string;
}

export interface IReadBinaryFileReplyMessage extends IModuleMessage {
  type: 'readBinaryFile';
  path: string;
  content: ArrayBufferView;
}

export interface IStdOutReplyMessage extends IModuleMessage {
  type: 'stdout';
  chunk: string;
}

export interface IStdInRequestMessage extends IModuleMessage {
  type: 'stdin';
  chunk: string;
}

export interface IClearStdInRequestMessage extends IModuleMessage {
  type: 'stdinClear';
}

export interface IStdErrReplyMessage extends IModuleMessage {
  type: 'stderr';
  chunk: string;
}

export interface IReadyReplyMessage extends IModuleMessage {
  type: 'ready';
}

export interface IExitReplyMessage extends IModuleMessage {
  type: 'exit';
  code: number;
}

export interface IQuitReplyMessage extends IModuleMessage {
  type: 'quit';
  status: number;
}

export interface IEnsureDirRequestMessage extends IModuleMessage {
  type: 'ensureDir';
  path: string;
}

export declare type IRequestMessage = IStdInRequestMessage | IClearStdInRequestMessage | IEnsureDirRequestMessage | IMainRequestMessage | IFunctionRequestMessage | ISetEnvironmentVariableRequestMessage | IWriteTextFileRequestMessage | IWriteBinaryFileRequestMessage | IReadTextFileRequestMessage | IReadBinaryFileRequestMessage;
export declare type IReplyMessage = IOkReplyMessage | IReadyReplyMessage | IExitReplyMessage | IQuitReplyMessage | IErrorReplyMessage | IFunctionReplyMessage | IStdOutReplyMessage | IStdErrReplyMessage | IMainReplyMessage | IReadTextFileReplyMessage | IReadBinaryFileReplyMessage;

export declare type IReplyer = (msg: IModuleMessage & {[key: string]: any}, transfer?: Transferable[]) => void;

export interface IMessageAdapter {
  postMessage(msg: any, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (msg: any, reply: (msg: any, transfer?: Transferable[]) => void) => void): void;
}

const WORKER_ADAPTER: IMessageAdapter = {
  postMessage: (msg, transfer) => postMessage(msg, '*', transfer),
  addEventListener: (_type, listener) => {
    addEventListener('message', (msg: MessageEvent) => {
      const reply = (msg: any, transfer: Transferable[] = []) => postMessage(msg, msg.origin, transfer);
      listener(msg.data, reply);
    });
  }
};

export class ModuleWorker<FN = {}, T extends IAsyncEMWWrapper<FN> = IAsyncEMWWrapper<FN>> {
  constructor(protected readonly module: T, protected readonly adapter: IMessageAdapter = WORKER_ADAPTER) {
    this.module.on('ready', () => adapter.postMessage(<IReadyReplyMessage>{key: '', type: 'ready'}));
    this.module.on('exit', (code) => adapter.postMessage(<IExitReplyMessage>{key: '', type: 'exit', code}));
    this.module.on('quit', (status) => adapter.postMessage(<IQuitReplyMessage>{key: '', type: 'quit', status}));
    // start loading
    this.module.sync();

    adapter.addEventListener('message', this.onMessage.bind(this));
  }

  protected async runInModule(msg: IModuleMessage, run: (mod: ISyncEMWWrapper<FN>, out: () => ({stdout: string, stderr: string})) => void, reply: IReplyer) {
    this.module.sync().then((mod) => {
      let stdout = '';
      const stdoutListener = (chunk: string) => {
        stdout += chunk;
        reply({key: msg.key, type: 'stdout', chunk});
      };
      let stderr = '';
      const stderrListener = (chunk: string) => {
        stderr += chunk;
        reply({key: msg.key, type: 'stderr', chunk});
      };
      try {
        mod.stdout.on('data', stdoutListener);
        mod.stderr.on('data', stderrListener);
        run(mod, () => ({stdout, stderr}));
      } catch (error) {
        reply({
          key: msg.key,
          type: 'error',
          error,
          stdout,
          stderr
        });
      } finally {
        mod.stdout.off('data', stdoutListener);
        mod.stderr.off('data', stderrListener);
      }
    });
  }

  private main(msg: IMainRequestMessage, reply: IReplyer) {
    this.runInModule(msg, (mod, out) => {
      const exitCode = (<any>mod).main(msg.args);
      const {stdout, stderr} = out();
      reply({
        key: msg.key,
        type: 'main',
        exitCode,
        stderr,
        stdout
      });
    }, reply);
  }

  private fn(msg: IFunctionRequestMessage, reply: IReplyer) {
    this.runInModule(msg, (mod) => {
      const fn = (<any>mod.fn)[msg.function];
      if (typeof fn !== 'function') {
        reply({
          key: msg.key,
          type: 'error',
          error: new Error(`invalid function ${fn}`),
          stderr: '',
          stdout: ''
        });
      }
      const returnValue = fn(...msg.args);
      reply({
        key: msg.key,
        type: 'fn',
        function: msg.function,
        returnValue
      });
    }, reply);
  }

  private setEnv(msg: ISetEnvironmentVariableRequestMessage, reply: IReplyer) {
    this.module.environmentVariables[msg.name] = msg.value;
    reply({
      key: msg.key,
      type: 'ok',
    });
  }

  private stdin(msg: IStdInRequestMessage, reply: IReplyer) {
    this.module.sync().then((m) => {
      m.stdin.push(msg.chunk);
      reply({
        key: msg.key,
        type: 'ok',
      });
    });
  }

  private stdinClear(msg: IClearStdInRequestMessage, reply: IReplyer) {
    this.module.sync().then((m) => {
      m.stdin.clear();
      reply({
        key: msg.key,
        type: 'ok',
      });
    });
  }

  private writeTextFile(msg: IWriteTextFileRequestMessage, reply: IReplyer) {
    this.module.fileSystem.then((fs) => {
      fs.writeFile(msg.path, msg.content, {encoding: 'utf8', flags: 'w'});
      reply({
        key: msg.key,
        type: 'ok',
      });
    });
  }

  private writeBinaryFile(msg: IWriteBinaryFileRequestMessage, reply: IReplyer) {
    this.module.fileSystem.then((fs) => {
      fs.writeFile(msg.path, msg.content);
      reply({
        key: msg.key,
        type: 'ok',
      });
    });
  }

  private ensureDir(msg: IEnsureDirRequestMessage, reply: IReplyer) {
    this.module.fileSystem.then((fs) => {
      ensureDir(fs, msg.path);
      reply({
        key: msg.key,
        type: 'ok',
      });
    });
  }

  private readTextFile(msg: IReadTextFileRequestMessage, reply: IReplyer) {
    this.module.fileSystem.then((fs) => {
      const content = fs.readFile(msg.path, {encoding: 'utf8', flags: 'r'});
      reply({
        key: msg.key,
        type: 'readTextFile',
        path: msg.path,
        content
      });
    });
  }

  private readBinaryFile(msg: IReadBinaryFileRequestMessage, reply: IReplyer) {
    this.module.fileSystem.then((fs) => {
      const content = fs.readFile(msg.path);
      reply({
        key: msg.key,
        type: 'readBinaryFile',
        path: msg.path,
        content
      }, [content]);
    });
  }

  protected handleMessage(msg: IRequestMessage, reply: IReplyer) {
    switch (msg.type || 'unknown') {
      case 'main':
        return this.main(<IMainRequestMessage>msg, reply);
      case 'fn':
        return this.fn(<IFunctionRequestMessage>msg, reply);
      case 'stdin':
        return this.stdin(<IStdInRequestMessage>msg, reply);
      case 'stdinClear':
        return this.stdinClear(<IClearStdInRequestMessage>msg, reply);
      case 'setEnv':
        return this.setEnv(<ISetEnvironmentVariableRequestMessage>msg, reply);
      case 'ensureDir':
        return this.ensureDir(<IEnsureDirRequestMessage>msg, reply);
      case 'writeTextFile':
        return this.writeTextFile(<IWriteTextFileRequestMessage>msg, reply);
      case 'writeBinaryFile':
        return this.writeBinaryFile(<IWriteBinaryFileRequestMessage>msg, reply);
      case 'readTextFile':
        return this.readTextFile(<IReadTextFileRequestMessage>msg, reply);
      case 'readBinaryFile':
        return this.readBinaryFile(<IReadBinaryFileRequestMessage>msg, reply);
      default: {
        console.log('unknown message type', msg);
      }
    }
  }

  private onMessage(msg: any, reply: IReplyer) {
    if (!msg.type || !msg.key) {
      console.log('no message type or key given');
    }
    this.handleMessage(msg, reply);
  }
}
