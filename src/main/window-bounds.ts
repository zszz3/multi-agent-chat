export interface WindowWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function centeredWindowBounds(workArea: WindowWorkArea, desiredWidth: number, desiredHeight: number): WindowBounds {
  const width = Math.min(desiredWidth, workArea.width);
  const height = Math.min(desiredHeight, workArea.height);
  return {
    x: workArea.x + Math.max(0, Math.round((workArea.width - width) / 2)),
    y: workArea.y + Math.max(0, Math.round((workArea.height - height) / 2)),
    width,
    height,
  };
}
