import './style.css';
const html = String.raw;

declare global {
  var currentHandle: FileSystemDirectoryHandle;
  var autoSyncFiles: boolean;
}

globalThis.autoSyncFiles = true;

const loadingScreen = document.getElementById('loading-screen')!;
loadingScreen.innerHTML = html`<div>
  <h1>Webcontainer Editor</h1>
  <h2>Open a folder to get started</h2>
  <div class="start-container">
    <button class="folder-upload">Select folder</button>
    <div>
      <input type="checkbox" checked id="sync-files" />
      <label for="sync-files">Auto sync files</label>
    </div>
    <button class="folder-upload go">Go</button>
  </div>
</div>`;
loadingScreen.querySelector('.folder-upload')?.addEventListener('click', async function (this: HTMLButtonElement) {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });

    globalThis.currentHandle = handle;
    this.innerHTML = 'Select folder<br><small>' + handle.name.replace('<', '&lt') + '</small>';
  } catch (e) {
    console.error(e);
  }
});

(loadingScreen.querySelector('#sync-files') as HTMLInputElement).addEventListener('change', (e) => {
  globalThis.autoSyncFiles = (e.target as HTMLInputElement).checked;
});

loadingScreen.querySelector('.go')?.addEventListener('click', () => {
  if (!globalThis.currentHandle) return;
  loadingScreen.innerHTML = 'Loading...';
  import('./main');
});
