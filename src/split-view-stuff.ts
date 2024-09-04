import {
  SplitView,
  IView,
  Sizing,
  Orientation,
  ISplitViewOptions,
  LayoutPriority,
} from 'vscode/vscode/vs/base/browser/ui/splitview/splitview';
import { Emitter } from 'vscode/vscode/vs/base/common/event';

interface ISplitViewViewOptions {
  minimumSize?: number;
  priority?: 'low' | 'normal' | 'high';
  snap?: boolean;
}

// Define your view class
export class SplitViewView implements IView {
  readonly element: HTMLElement;
  readonly minimumSize: number;
  readonly maximumSize: number = Number.POSITIVE_INFINITY;
  readonly priority: LayoutPriority = LayoutPriority.Normal;
  snap?: boolean | undefined;

  readonly onDidChange = new Emitter<number | undefined>().event;
  readonly onLayout = new Emitter<number>().event;
  private readonly onVisibilityChangeEmitter = new Emitter<boolean>();
  readonly onVisibilityChange = this.onVisibilityChangeEmitter.event;

  constructor(element: HTMLElement, options: ISplitViewViewOptions = {}) {
    this.element = element;
    this.minimumSize = options.minimumSize ?? 0;
    this.snap = options.snap ?? false;

    switch (options.priority) {
      case 'low':
        this.priority = LayoutPriority.Low;
        break;
      case 'normal':
        this.priority = LayoutPriority.Normal;
        break;
      case 'high':
        this.priority = LayoutPriority.High;
        break;
    }
  }

  layout(size: number): void {
    this.element.style.width = `${size}px`;
  }

  setVisible(visible: boolean): void {
    this.onVisibilityChangeEmitter.fire(visible);
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
