import { SplitView, IView, Sizing, Orientation } from 'vscode/vscode/vs/base/browser/ui/splitview/splitview';
import { Emitter } from 'vscode/vscode/vs/base/common/event';
// Define your view class
export class SplitViewView implements IView {
  readonly element: HTMLElement;
  readonly minimumSize: number = 100;
  readonly maximumSize: number = Number.POSITIVE_INFINITY;
  readonly onDidChange = new Emitter<number | undefined>().event;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  layout(size: number, offset: number): void {
    this.element.style.width = `${size}px`;
  }
}

export function createHorizontalSplitView(container: HTMLElement, child1: IView, child2: IView): SplitView {
  const splitView = new SplitView(container, {
    orientation: Orientation.HORIZONTAL,
  });

  splitView.addView(child1, Sizing.Distribute);
  splitView.addView(child2, Sizing.Distribute);
  splitView.layout(container.clientWidth);

  return splitView;
}
