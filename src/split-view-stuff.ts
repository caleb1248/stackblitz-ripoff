import {
  SplitView,
  IView,
  Sizing,
  Orientation,
  ISplitViewOptions,
} from 'vscode/vscode/vs/base/browser/ui/splitview/splitview';
import { Emitter } from 'vscode/vscode/vs/base/common/event';
// Define your view class
export class SplitViewView implements IView {
  readonly element: HTMLElement;
  readonly minimumSize: number;
  readonly maximumSize: number = Number.POSITIVE_INFINITY;
  readonly onDidChange = new Emitter<number | undefined>().event;

  constructor(element: HTMLElement, minimumSize?: number) {
    this.element = element;
    this.minimumSize = minimumSize ?? 0;
    this.layout(200, 0);
  }

  layout(size: number, _offset: number): void {
    this.element.style.width = `${size}px`;
  }
}

export function createHorizontalSplitView(
  container: HTMLElement,
  child1: IView,
  child2: IView,
  options: Omit<ISplitViewOptions, 'orientation'> = {}
): SplitView {
  const splitView = new SplitView(container, {
    ...options,
    orientation: Orientation.HORIZONTAL,
  });

  splitView.addView(child1, Sizing.Auto(0));
  splitView.addView(child2, Sizing.Distribute);
  splitView.layout(container.clientWidth);

  return splitView;
}
