import {IAsyncEMWWrapper, ISyncEMWWrapper, IEMWMain, IRunResult} from './wrapper';
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
  type: 'run';
  args?: string[];
  stdin?: string;
}

export interface IMainReplyMessage extends IModuleMessage, IRunResult {
  type: 'run';
}

export interface IFunctionRequestMessage extends IModuleMessage {
  type: 'fn';
  function: string;
  args: (string | number | Uint8Array)[];
}

export interface IFunctionReplyMessage extends IModuleMessage {
  type: 'fn';
  function: string;
  returnValue: (string | number | boolean | null);
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

export interface IBatchRequestMessage extends IModuleMessage {
  type: 'batch';
  messages: IRequestMessage[];
}

export interface IBatchReplyMessage extends IModuleMessage {
  type: 'batch';
  replies: IReplyMessage[];
}

export declare type IRequestMessage = IBatchRequestMessage | IStdInRequestMessage | IClearStdInRequestMessage | IEnsureDirRequestMessage | IMainRequestMessage | IFunctionRequestMessage | ISetEnvironmentVariableRequestMessage | IWriteTextFileRequestMessage | IWriteBinaryFileRequestMessage | IReadTextFileRequestMessage | IReadBinaryFileRequestMessage;
export declare type IReplyMessage = IBatchReplyMessage | IOkReplyMessage | IReadyReplyMessage | IExitReplyMessage | IQuitReplyMessage | IErrorReplyMessage | IFunctionReplyMessage | IStdOutReplyMessage | IStdErrReplyMessage | IMainReplyMessage | IReadTextFileReplyMessage | IReadBinaryFileReplyMessage;

export declare type IReplyer = (msg: IModuleMessage & {[key: string]: any}, transfer?: Transferable[]) => void;

export interface IMessageAdapter {
  postMessage(msg: any, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (msg: any, reply: (msg: any, transfer?: Transferable[]) => void) => void): void;
}

const WORKER_ADAPTER: IMessageAdapter = {
  postMessage: (msg, transfer) => (<any>self.postMessage)(msg, transfer), // wrong typings
  addEventListener: (_type, listener) => {
    addEventListener('message', (msg: MessageEvent) => {
      const reply = (data: any, transfer: Transferable[] = []) => (<any>(msg.source || self)).postMessage(data, transfer);
      listener(msg.data, reply);
    });
  }
};

export class ModuleWorker<FN = {}, T extends IAsyncEMWWrapper<FN> = IAsyncEMWWrapper<FN>> {
  constructor(protected readonly module: T, protected readonly adapter: IMessageAdapter = WORKER_ADAPTER) {
    this.module.on('ready', () => adapter.postMessage(<IReadyReplyMessage>{key: '-1', type: 'ready'}));
    this.module.on('exit', (code) => adapter.postMessage(<IExitReplyMessage>{key: '-1', type: 'exit', code}));
    this.module.on('quit', (status) => adapter.postMessage(<IQuitReplyMessage>{key: '-1', type: 'quit', status}));
    // start loading
    this.module.sync();

    adapter.addEventListener('message', this.onMessage.bind(this));
  }

  protected async streamOut(mod: ISyncEMWWrapper<FN>, msg: IModuleMessage, run: () => void, reply: IReplyer) {
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
      run();
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
  }

  private run(mod: ISyncEMWWrapper<FN>, msg: IMainRequestMessage, reply: IReplyer) {
    this.streamOut(mod, msg, () => {
      const r = (<IEMWMain><unknown>mod).run(msg.args || [], msg.stdin);
      reply({
        key: msg.key,
        type: 'run',
        error: r.error,
        exitCode: r.exitCode,
        stderr: r.stderr,
        stdout: r.stdout
      });
    }, reply);
  }

  private fn(mod: ISyncEMWWrapper<FN>, msg: IFunctionRequestMessage, reply: IReplyer) {
    this.streamOut(mod, msg, () => {
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

  private setEnv(mod: ISyncEMWWrapper<FN>, msg: ISetEnvironmentVariableRequestMessage, reply: IReplyer) {
    mod.environmentVariables[msg.name] = msg.value;
    reply(this.ok(msg));
  }

  private stdin(mod: ISyncEMWWrapper<FN>, msg: IStdInRequestMessage, reply: IReplyer) {
    mod.stdin.push(msg.chunk);
    reply(this.ok(msg));
  }

  protected ok(msg: IModuleMessage) {
    return {
      key: msg.key,
      type: 'ok',
    };
  }

  private stdinClear(mod: ISyncEMWWrapper<FN>, msg: IClearStdInRequestMessage, reply: IReplyer) {
    mod.stdin.clear();
    reply(this.ok(msg));
  }

  private writeTextFile(mod: ISyncEMWWrapper<FN>, msg: IWriteTextFileRequestMessage, reply: IReplyer) {
    mod.fileSystem.writeFile(msg.path, msg.content, {encoding: 'utf8', flags: 'w'});
    reply(this.ok(msg));
  }

  private writeBinaryFile(mod: ISyncEMWWrapper<FN>, msg: IWriteBinaryFileRequestMessage, reply: IReplyer) {
    mod.fileSystem.writeFile(msg.path, msg.content);
    reply(this.ok(msg));
  }

  private ensureDir(mod: ISyncEMWWrapper<FN>, msg: IEnsureDirRequestMessage, reply: IReplyer) {
    ensureDir(mod.fileSystem, msg.path);
    reply(this.ok(msg));
  }

  private readTextFile(mod: ISyncEMWWrapper<FN>, msg: IReadTextFileRequestMessage, reply: IReplyer) {
    const content = mod.fileSystem.readFile(msg.path, {encoding: 'utf8', flags: 'r'});
    reply({
      key: msg.key,
      type: 'readTextFile',
      path: msg.path,
      content
    });
  }

  private readBinaryFile(mod: ISyncEMWWrapper<FN>, msg: IReadBinaryFileRequestMessage, reply: IReplyer) {
    const content = mod.fileSystem.readFile(msg.path);
    reply({
      key: msg.key,
      type: 'readBinaryFile',
      path: msg.path,
      content
    }, [content]);
  }

  private batch(mod: ISyncEMWWrapper<FN>, msg: IBatchRequestMessage, reply: IReplyer) {
    const replies: IReplyMessage[] = [];
    const transfers: Transferable[] = [];
    for (const sub of msg.messages) {
      this.handleModuleMessage(mod, sub, (reply, t = []) => {
        replies.push(<any>reply);
        transfers.push(...t);
      });
    }
    reply({
      key: msg.key,
      type: 'batch',
      replies
    });
  }

  protected handleModuleMessage(mod: ISyncEMWWrapper<FN>, msg: IRequestMessage, reply: IReplyer) {
    switch (msg.type || 'unknown') {
      case 'run':
        return this.run(mod, <IMainRequestMessage>msg, reply);
      case 'fn':
        return this.fn(mod, <IFunctionRequestMessage>msg, reply);
      case 'stdin':
        return this.stdin(mod, <IStdInRequestMessage>msg, reply);
      case 'stdinClear':
        return this.stdinClear(mod, <IClearStdInRequestMessage>msg, reply);
      case 'setEnv':
        return this.setEnv(mod, <ISetEnvironmentVariableRequestMessage>msg, reply);
      case 'ensureDir':
        return this.ensureDir(mod, <IEnsureDirRequestMessage>msg, reply);
      case 'writeTextFile':
        return this.writeTextFile(mod, <IWriteTextFileRequestMessage>msg, reply);
      case 'writeBinaryFile':
        return this.writeBinaryFile(mod, <IWriteBinaryFileRequestMessage>msg, reply);
      case 'readTextFile':
        return this.readTextFile(mod, <IReadTextFileRequestMessage>msg, reply);
      case 'readBinaryFile':
        return this.readBinaryFile(mod, <IReadBinaryFileRequestMessage>msg, reply);
      case 'batch':
        return this.batch(mod, <IBatchRequestMessage>msg, reply);
      default: {
        console.log('unknown message type', msg);
      }
    }
  }

  protected handleMessage(msg: IRequestMessage, reply: IReplyer) {
    this.module.sync().then((mod) => this.handleModuleMessage(mod, msg, reply));
  }

  private onMessage(msg: any, reply: IReplyer) {
    if (!msg.type || !msg.key) {
      console.log('no message type or key given');
    }
    this.handleMessage(msg, reply);
  }
}
