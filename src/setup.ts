import { initialize } from 'vscode/services';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getExtensionsServiceOverride from '@codingame/monaco-vscode-extensions-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getOutputServiceOverride from '@codingame/monaco-vscode-output-service-override';
import getConfigurationServiceOverride, {
  initUserConfiguration,
} from '@codingame/monaco-vscode-configuration-service-override';
import getPreferencesServiceOverride from '@codingame/monaco-vscode-preferences-service-override';
import getDialogServiceOverride from '@codingame/monaco-vscode-dialogs-service-override';
import getExplorerServiceOverride from '@codingame/monaco-vscode-explorer-service-override';
import getViewsServiceOverride, { Parts, attachPart } from '@codingame/monaco-vscode-views-service-override';
import getFilesServiceOverride, {
  createIndexedDBProviders,
  registerFileSystemOverlay,
} from '@codingame/monaco-vscode-files-service-override';
import getMarkersServiceOverride from '@codingame/monaco-vscode-markers-service-override';
import getNotificationsServiceOverride from '@codingame/monaco-vscode-notifications-service-override';
import getTerminalServiceOverride from '@codingame/monaco-vscode-terminal-service-override';

import 'vscode/localExtensionHost';

import { Uri } from 'vscode';

import { Worker } from './tools/crossOriginWorker';
import { workerConfig } from './tools/extHostWorker';
import { WebContainerTerminalBackend } from './webcontainer/terminal';
import WebContainerFileSystemProvider from './webcontainer/fileSystem';

const provider = await WebContainerFileSystemProvider.create();

registerFileSystemOverlay(1, provider);

export type WorkerLoader = () => Worker;
const workerLoaders: Partial<Record<string, WorkerLoader>> = {
  TextEditorWorker: () =>
    new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
      type: 'module',
    }),
  TextMateWorker: () =>
    new Worker(new URL('@codingame/monaco-vscode-textmate-service-override/worker', import.meta.url), {
      type: 'module',
    }),

  OutputLinkDetectionWorker: () =>
    new Worker(new URL('@codingame/monaco-vscode-output-service-override/worker', import.meta.url), { type: 'module' }),
  // LocalFileSearchWorker: () =>
  //   new Worker(
  //     new URL(
  //       '@codingame/monaco-vscode-search-service-override/worker',
  //       import.meta.url
  //     ),
  //     { type: 'module' }
  //   ),
};
window.MonacoEnvironment = {
  getWorker: function (moduleId, label) {
    const workerFactory = workerLoaders[label];
    if (workerFactory != null) {
      return workerFactory();
    }
    throw new Error(`Unimplemented worker ${label} (${moduleId})`);
  },
};

await createIndexedDBProviders();

await initUserConfiguration(`{
  "files.autoSave": false,
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.iconTheme": "material-icon-theme",
  "editor.tabSize": 2,
}`);

await initialize(
  {
    ...getViewsServiceOverride(),
    ...getFilesServiceOverride(),
    ...getThemeServiceOverride(),
    ...getTextmateServiceOverride(),
    ...getModelServiceOverride(),
    ...getExtensionsServiceOverride(workerConfig),
    ...getLanguagesServiceOverride(),
    ...getConfigurationServiceOverride(),
    ...getDialogServiceOverride(),
    ...getExplorerServiceOverride(),
    ...getOutputServiceOverride(),
    ...getMarkersServiceOverride(),
    ...getNotificationsServiceOverride(),
    ...getTerminalServiceOverride(new WebContainerTerminalBackend()),
    ...getPreferencesServiceOverride(),
  },
  document.body,
  {
    workspaceProvider: {
      trusted: true,
      workspace: {
        folderUri: Uri.file('/home/projects'),
      },
      async open() {
        return false;
      },
    },
  }
);

attachPart(Parts.SIDEBAR_PART, document.getElementById('sidebar')!);
attachPart(Parts.EDITOR_PART, document.getElementById('editor')!);
attachPart(Parts.PANEL_PART, document.getElementById('panel')!);
