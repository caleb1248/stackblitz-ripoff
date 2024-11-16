import { WebContainer } from '@webcontainer/api';

const webContainer = await WebContainer.boot({
  workdirName: 'projects',
});
export default webContainer;
