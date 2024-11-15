import {
  ITerminalBackend,
  ITerminalChildProcess,
  SimpleTerminalBackend,
} from '@codingame/monaco-vscode-terminal-service-override';
import webContainer from './init';
import { IProcessEnvironment, OperatingSystem } from 'vscode/vscode/vs/base/common/platform';
import { IShellLaunchConfig, ITerminalProcessOptions } from 'vscode/vscode/vs/platform/terminal/common/terminal';

export class WebContainerTerminalBackend extends SimpleTerminalBackend {
  getDefaultSystemShell = () => Promise.resolve('jsh');
  createProcess: (
    shellLaunchConfig: IShellLaunchConfig,
    cwd: string,
    cols: number,
    rows: number,
    unicodeVersion: '6' | '11',
    env: IProcessEnvironment,
    options: ITerminalProcessOptions,
    shouldPersist: boolean
  ) => Promise<ITerminalChildProcess>;
}
