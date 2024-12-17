import { ITerminalChildProcess, SimpleTerminalBackend } from '@codingame/monaco-vscode-terminal-service-override';
import webContainer from './init';
import { IProcessEnvironment } from 'vscode/vscode/vs/base/common/platform';
import {
  IProcessReadyEvent,
  IShellLaunchConfig,
  ITerminalProcessOptions,
} from 'vscode/vscode/vs/platform/terminal/common/terminal';
import { Emitter, Event } from 'vscode/vscode/vs/base/common/event';
import { SpawnOptions, WebContainerProcess } from '@webcontainer/api';

let pidCount = 0;

function unsupported(name: string) {
  return function () {
    throw new Error(`Unsupported method '${name}'`);
  };
}

export class WebContainerTerminalBackend extends SimpleTerminalBackend {
  getDefaultSystemShell = () => Promise.resolve('jsh');
  createProcess = async (
    shellLaunchConfig: IShellLaunchConfig,
    cwd: string,
    cols: number,
    rows: number,
    unicodeVersion: '6' | '11',
    env: IProcessEnvironment,
    options: ITerminalProcessOptions,
    shouldPersist: boolean
  ) => {
    return new WebContainerTerminalProcess({
      shellLaunchConfig,
      cwd,
      cols,
      rows,
      unicodeVersion,
      env,
      options,
      shouldPersist,
    });
  };
}

interface WebContainerTerminalProcessOptions {
  shellLaunchConfig: IShellLaunchConfig;
  cwd: string;
  cols: number;
  rows: number;
  /**
   * Unsupported
   */
  unicodeVersion: '6' | '11';
  env: IProcessEnvironment;
  options: ITerminalProcessOptions;
  /**
   * Unsupported
   */
  shouldPersist: boolean;
}

class WebContainerTerminalProcess implements ITerminalChildProcess {
  private _process: WebContainerProcess | undefined;
  private _input: WritableStreamDefaultWriter | undefined;

  private _readyEmitter = new Emitter<IProcessReadyEvent>();
  public onProcessReady = this._readyEmitter.event;

  private _dataEmitter = new Emitter<string>();
  public onProcessData = this._dataEmitter.event;

  private _exitEmitter = new Emitter<number>();
  public onProcessExit = this._exitEmitter.event;

  public onDidChangeProperty = Event.None;

  shouldPersist = false;

  private _inputQueue = new InputQueue();

  id = 0;
  constructor(private _options: WebContainerTerminalProcessOptions) {}

  public async start() {
    const args = this._options.shellLaunchConfig.args || [];

    let spawnOptions: SpawnOptions = {};

    spawnOptions.cwd = '/';
    console.log(this._options.cwd);

    if (this._options.shellLaunchConfig.env) {
      for (const [key, value] of Object.entries(this._options.shellLaunchConfig.env)) {
        if (value) {
          if (!spawnOptions.env) spawnOptions.env = {};
          spawnOptions.env[key] = value;
        }
      }
    }

    spawnOptions.terminal = { rows: this._options.rows, cols: this._options.cols };
    console.log(this._options.shellLaunchConfig.executable, args);
    this._process = await webContainer.spawn(
      this._options.shellLaunchConfig.executable || 'jsh',
      Array.isArray(args) ? args : [args],
      spawnOptions
    );

    this._input = this._process.input.getWriter();

    this._readyEmitter.fire({
      pid: ++pidCount,
      cwd: this._options.cwd,
      windowsPty: undefined,
    });

    this._process.output.pipeTo(
      new WritableStream({
        write: (data) => this._dataEmitter.fire(data),
      })
    );

    this._process.exit.then((code) => this._exitEmitter.fire(code));
    console.log('process started!');
    return undefined;
  }

  resize(cols: number, rows: number): void {
    if (this._process) {
      this._process.resize({ rows, cols });
    }
  }

  input(data: string): void {
    if (this._input) {
      this._inputQueue.push(this._input.write(data));
    }
  }

  shutdown(immediate: boolean): void {
    console.log('Shutting down...');
    if (!this._process) return;
    if (immediate) {
      this._process.kill();
    } else {
      this._inputQueue.whenEmpty().then(() => this._process?.kill());
    }
  }

  processBinary = async () => {
    console.log('process binary');
    unsupported('processBinary')();
  };
  clearBuffer() {}
  setUnicodeVersion(_version: '6' | '11') {
    // Unsupported
    return Promise.resolve();
  }

  getInitialCwd(): Promise<string> {
    return Promise.resolve(this._options.cwd);
  }

  getCwd(): Promise<string> {
    return Promise.resolve(this._options.cwd);
  }

  /**
   * Unsupported
   */
  async refreshProperty(prop: string): Promise<any | never> {
    if (prop === 'cwd') return this._options.cwd;
    console.error('Attempted to refresh property ' + prop);
    throw 'Attempted to refresh property ' + prop;
  }

  /**
   * Unsupported
   */
  updateProperty = async () => undefined;

  acknowledgeDataEvent() {}

  getLatency = async () => 0;
}

class InputQueue {
  private _currentId = 0;
  private _queue: { id: number }[] = [];

  private _emptyEmitter = new Emitter<void>();
  public onEmpty = this._emptyEmitter.event;

  private _removeById(id: number) {
    const index = this._queue.findIndex((item) => item.id === id);
    if (index > -1) {
      this._queue.splice(index);
      if (this._queue.length === 0) this._emptyEmitter.fire();
    }
  }

  push(promise: PromiseLike<unknown>) {
    const id = ++this._currentId;
    this._queue.push({ id });
    promise.then(
      () => this._removeById(id),
      () => this._removeById(id)
    );
  }

  whenEmpty() {
    return new Promise<void>((resolve) => {
      const subscription = this.onEmpty(() => {
        subscription.dispose();
        resolve();
      });
    });
  }
}
