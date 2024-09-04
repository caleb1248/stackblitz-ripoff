import { initialize as initializeMonacoServices, getService, IWorkbenchLayoutService } from 'vscode/services';
import getViewsServiceOverride, {
  attachPart,
  Parts,
  isPartVisibile,
  onPartVisibilityChange,
  isEditorPartVisible,
} from '@codingame/monaco-vscode-views-service-override';

import getFilesServiceOverride, {
  // InMemoryFileSystemProvider,
  // registerFileSystemOverlay,
  registerHTMLFileSystemProvider,
  createIndexedDBProviders,
  initFile,
} from '@codingame/monaco-vscode-files-service-override';

import getConfigurationServiceOverride, {
  IStoredWorkspace,
} from '@codingame/monaco-vscode-configuration-service-override';

import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getExtensionServiceOverride from '@codingame/monaco-vscode-extensions-service-override';
import getQuickAccessServiceOverride from '@codingame/monaco-vscode-quickaccess-service-override';
import getExplorerServiceOverride from '@codingame/monaco-vscode-explorer-service-override';
import getSearchServiceOverride from '@codingame/monaco-vscode-search-service-override';
import getPreferencesServiceOverride from '@codingame/monaco-vscode-preferences-service-override';
import getDialogServiceOverride from '@codingame/monaco-vscode-dialogs-service-override';
import getMarkersServiceOverride from '@codingame/monaco-vscode-markers-service-override';

import { createHorizontalSplitView, SplitViewView } from './split-view-stuff';
import * as monaco from 'monaco-editor';

import 'vscode/localExtensionHost';

import { Worker } from './tools/crossOriginWorker';
import { workerConfig } from './tools/extHostWorker';

export type WorkerLoader = () => Worker;
const workerLoaders: Partial<Record<string, WorkerLoader>> = {
  editorWorkerService: () =>
    new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
      type: 'module',
    }),
  textMateWorker: () =>
    new Worker(new URL('@codingame/monaco-vscode-textmate-service-override/worker', import.meta.url), {
      type: 'module',
    }),
  // outputLinkComputer: () =>
  //   new Worker(new URL("@codingame/monaco-vscode-output-service-override/worker", import.meta.url), { type: "module" }),
  // languageDetectionWorkerService: () =>
  //   new Worker(new URL("@codingame/monaco-vscode-language-detection-worker-service-override/worker", import.meta.url), {
  //     type: "module",
  //   }),
  // notebookEditorWorkerService: () =>
  //   new Worker(new URL("@codingame/monaco-vscode-notebook-service-override/worker", import.meta.url), {
  //     type: "module",
  //   }),
  localFileSearchWorker: () =>
    new Worker(new URL('@codingame/monaco-vscode-search-service-override/worker', import.meta.url), { type: 'module' }),
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

// const fsProvider = new InMemoryFileSystemProvider();
await createIndexedDBProviders();
const workspaceFile = monaco.Uri.from({ scheme: 'tmp', path: '/test.code-workspace' });
await initFile(
  workspaceFile,
  JSON.stringify(
    <IStoredWorkspace>{
      folders: [],
    },
    null,
    2
  )
);
registerHTMLFileSystemProvider();
// registerFileSystemOverlay(1, fsProvider);

initializeMonacoServices(
  {
    ...getExtensionServiceOverride(workerConfig),
    ...getModelServiceOverride(),
    ...getTextmateServiceOverride(),
    ...getThemeServiceOverride(),
    ...getLanguagesServiceOverride(),
    ...getFilesServiceOverride(),
    ...getConfigurationServiceOverride(),
    ...getViewsServiceOverride(),
    ...getQuickAccessServiceOverride({
      isKeybindingConfigurationVisible: isEditorPartVisible,
      shouldUseGlobalPicker: (_editor, isStandalone) => !isStandalone && isEditorPartVisible(),
    }),
    ...getSearchServiceOverride(),
    ...getExplorerServiceOverride(),
    ...getPreferencesServiceOverride(),
    ...getDialogServiceOverride(),
    ...getMarkersServiceOverride(),
  },
  document.body,
  {
    workspaceProvider: {
      trusted: true,
      async open() {
        window.open(window.location.href);
        return true;
      },
      workspace: { workspaceUri: workspaceFile },
    },
  },
  {}
);

const appDiv = document.getElementById('app') as HTMLDivElement;

appDiv.innerHTML = `
<div id="workbench-top">
  <div style="display: flex; flex: none; border: 1px solid var(--vscode-editorWidget-border)">
    <div id="activityBar"></div>
    <div id="sidebar" style="width: 400px"></div>
    <div id="auxiliaryBar-left" style="max-width: 300px"></div>
  </div>
  <div style="flex: 1; min-width: 0">
    <div id="editors"></div>
  </div>
</div>`;

const layoutService = await getService(IWorkbenchLayoutService); // Bug happens without this line
layoutService;

const sidebarView = new SplitViewView(document.getElementById('sidebar')!);
const editorsView = new SplitViewView(document.getElementById('editors')!, 100);

const splitView = createHorizontalSplitView(document.querySelector('#workbench-top')!, sidebarView, editorsView);
splitView;
for (const config of [
  {
    part: Parts.SIDEBAR_PART,
    element: '#sidebar',
  },
  {
    part: Parts.ACTIVITYBAR_PART,
    element: '#activityBar',
  },
  { part: Parts.EDITOR_PART, element: '#editors' },
]) {
  attachPart(config.part, document.querySelector<HTMLDivElement>(config.element)!);

  if (config.part === Parts.SIDEBAR_PART) {
    if (!isPartVisibile(config.part)) {
      sidebarView.layout(0);
    }

    onPartVisibilityChange(config.part, (visible) => {
      document.querySelector<HTMLElement>(config.element)!.style.width = visible ? '0' : '200px';
    });
  }

  onPartVisibilityChange(config.part, (visible) => {
    document.querySelector<HTMLDivElement>(config.element)!.style.display = visible ? 'block' : 'none';
  });
}
