export interface ExecutionResizeProps {
  height: number;
  available: number;
  onPreview: (height: number) => void;
  onCommit: (height: number) => void;
  onCancel: () => void;
}
