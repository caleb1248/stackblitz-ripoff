import { WebContainer } from '@webcontainer/api';

const webContainer = await WebContainer.boot({
  workdirName: 'projects',
});

const portMap = new Map<number, string>();
webContainer.on('port', (port, type, url) => {
  if (type === 'open') {
    portMap.set(port, url);
  } else {
    portMap.delete(port);
  }
});

export default webContainer;
export { portMap };
