import {IAsyncEMWWrapper, ISyncEMWWrapper} from './wrapper';

export interface IModuleMessage {
  key: string;
}

export interface IErrorReplyMessage extends IModuleMessage {
  type: 'error';
  error: Error;
  stdout: string;
  stderr: string;
}

export interface IMainRequestMessage extends IModuleMessage {
  type: 'main';
  args: string[];
  stdin?: string;
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
  content: ArrayBuffer;
}

export interface IStdOutReplyMessage extends IModuleMessage {
  type: 'stdout';
  chunk: string;
}

export interface IStdErrReplyMessage extends IModuleMessage {
  type: 'stderr';
  chunk: string;
}

export declare type IRequestMessage = IMainRequestMessage | IFunctionRequestMessage | ISetEnvironmentVariableRequestMessage | IWriteTextFileRequestMessage | IWriteBinaryFileRequestMessage | IReadTextFileRequestMessage | IReadBinaryFileRequestMessage;
export declare type IReplyMessage = IErrorReplyMessage | IFunctionReplyMessage | IStdOutReplyMessage | IStdErrReplyMessage | IMainReplyMessage | IReadTextFileReplyMessage | IReadBinaryFileReplyMessage;

export declare type IReplyer = (msg: IModuleMessage & {[key: string]: any}) => void;

export class ModuleWorker<FN = {}, T extends IAsyncEMWWrapper<FN> = IAsyncEMWWrapper<FN>> {
  constructor(protected readonly module: T) {
    // start loading
    this.module.sync();

    onmessage = this.onMessage.bind(this);
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
        mod.stdin.clear();
      }
    });
  }

  private main(msg: IMainRequestMessage, reply: IReplyer) {
    this.runInModule(msg, (mod, out) => {
      mod.stdin.push(msg.stdin || '');
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

  private setEnv(msg: ISetEnvironmentVariableRequestMessage) {
    this.module.environmentVariables[msg.name] = msg.value;
  }

  private writeTextFile(msg: IWriteTextFileRequestMessage) {
    this.module.fileSystem.then((fs) => fs.writeFile(msg.path, msg.content, {encoding: 'utf8', flags: 'w'}));
  }

  private writeBinaryFile(msg: IWriteBinaryFileRequestMessage) {
    this.module.fileSystem.then((fs) => fs.writeFile(msg.path, msg.content));
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
      });
    });
  }

  protected handleMessage(msg: IRequestMessage, reply: IReplyer) {
    switch (msg.type || 'unknown') {
      case 'main':
        return this.main(<IMainRequestMessage>msg, reply);
      case 'fn':
        return this.fn(<IFunctionRequestMessage>msg, reply);
      case 'setEnv':
        return this.setEnv(<ISetEnvironmentVariableRequestMessage>msg);
      case 'writeTextFile':
        return this.writeTextFile(<IWriteTextFileRequestMessage>msg);
      case 'writeBinaryFile':
        return this.writeBinaryFile(<IWriteBinaryFileRequestMessage>msg);
      case 'readTextFile':
        return this.readTextFile(<IReadTextFileRequestMessage>msg, reply);
      case 'readBinaryFile':
        return this.readBinaryFile(<IReadBinaryFileRequestMessage>msg, reply);
      default: {
        console.log('unknown message type', msg);
      }
    }
  }

  private onMessage(ev: MessageEvent) {
    const msg = <IRequestMessage>ev.data;
    const reply = (msg: any) => postMessage(msg, ev.origin);
    if (!msg.type || !msg.key) {
      console.log('no message type or key given');
    }
    this.handleMessage(msg, reply);
  }
}
