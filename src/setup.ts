import { initialize as initializeMonacoServices, getService, IWorkbenchLayoutService } from 'vscode/services';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getExtensionServiceOverride from '@codingame/monaco-vscode-extensions-service-override';
import getFilesServiceOverride, {
  InMemoryFileSystemProvider,
  registerFileSystemOverlay,
} from '@codingame/monaco-vscode-files-service-override';
import getConfigurationServiceOverride from '@codingame/monaco-vscode-configuration-service-override';
import getViewsServiceOverride, {
  attachPart,
  Parts,
  isPartVisibile,
  onPartVisibilityChange,
  isEditorPartVisible,
} from '@codingame/monaco-vscode-views-service-override';
import getQuickAccessServiceOverride from '@codingame/monaco-vscode-quickaccess-service-override';
import getExplorerServiceOverride from '@codingame/monaco-vscode-explorer-service-override';
import getSearchServiceOverride from '@codingame/monaco-vscode-search-service-override';

import { createHorizontalSplitView, SplitViewView } from './split-view-stuff';

import 'vscode/localExtensionHost';

import { Worker } from './tools/crossOriginWorker';

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

const fsProvider = new InMemoryFileSystemProvider();

registerFileSystemOverlay(1, fsProvider);

initializeMonacoServices(
  {
    ...getExtensionServiceOverride(),
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
  },
  document.body,
  {},
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

  if (!isPartVisibile(config.part)) {
    document.querySelector<HTMLDivElement>(config.element)!.style.display = 'none';
  }

  onPartVisibilityChange(config.part, (visible) => {
    document.querySelector<HTMLDivElement>(config.element)!.style.display = visible ? 'block' : 'none';
  });
}

createHorizontalSplitView(document.getElementById('workbench-top')!, new SplitViewView(), new SplitViewView(document.createElement('div'));