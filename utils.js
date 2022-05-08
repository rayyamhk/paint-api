const CONSTANT = {
  ELLIPSE: 'ELLIPSE',
  RECTANGLE: 'RECTANGLE',
  TRIANGLE: 'TRIANGLE',
  ERASER: 'ERASER',
  MARKER: 'MARKER',
  POINT: 'POINT',
  LINE: 'LINE',
  TEXT: 'TEXT',

  TOP: 'TOP',
  TOP_RIGHT: 'TOP_RIGHT',
  RIGHT: 'RIGHT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
  BOTTOM: 'BOTTOM',
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  LEFT: 'LEFT',
  TOP_LEFT: 'TOP_LEFT',
};

const distance = (x1, y1, x2, y2) => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);

const last = (array) => array[array.length - 1];

const atan = (x1, y1, x2, y2) => {
  const oppo = y2 - y1;
  const adja = x2 - x1;

  const theta = Math.atan(oppo / adja); // [-PI/2, PI/2];
  if (oppo >= 0 && adja >= 0) {
    // 1st quadrant: +v2
    return theta;
  }
  if ((oppo >= 0 && adja < 0) || (oppo < 0 && adja < 0)) {
    // 2nd quadrant: -ve
    // 3rd quadrant: +v2
    return Math.PI + theta;
  }
  // 4th quadrant: -ve
  return Math.PI * 2 + theta;
}

const createWrapper = (width, height) => {
  const wrapper = document.createElement('div');
  wrapper.style.width = width + 'px';
  wrapper.style.height = height + 'px';
  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'hidden';
  return wrapper;
};

const createOverlay = () => {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = 0;
  overlay.style.right = 0;
  overlay.style.bottom = 0;
  overlay.style.left = 0;
  overlay.style.zIndex = -1;
  return overlay;
}

const createBoundingBox = (boxOffset, controllerSize) => {
  const controllerOffset = boxOffset + controllerSize * 0.5;

  const box = document.createElement('div');
  box.style.outline = '1px dashed #000';
  box.style.outlineOffset = `${boxOffset}px`;
  box.style.position = 'absolute';
  box.style.top = '0px';
  box.style.left = '0px';
  box.style.cursor = 'grab';
  box.style.transform = 'translate(-9999px, -9999px)';

  // resize controllers
  const top = document.createElement('div');
  top.style.width = `${controllerSize}px`;
  top.style.height = `${controllerSize}px`;
  top.style.borderRadius = '50%';
  top.style.border = '1px solid #fff';
  top.style.backgroundColor = '#3498db';
  top.style.position = 'absolute';

  const topRight = top.cloneNode();
  const right = top.cloneNode();
  const bottomRight = top.cloneNode();
  const bottom = top.cloneNode();
  const bottomLeft = top.cloneNode();
  const left = top.cloneNode();
  const topLeft = top.cloneNode();
  const center = top.cloneNode();

  top._direction = CONSTANT.TOP;
  top.style.top = `-${controllerOffset}px`;
  top.style.left = '50%';
  top.style.transform = 'translateX(-50%)';
  top.style.cursor = 'ns-resize';

  topRight._direction = CONSTANT.TOP_RIGHT;
  topRight.style.top = `-${controllerOffset}px`;
  topRight.style.right = `-${controllerOffset}px`;
  topRight.style.cursor = 'nesw-resize';

  right._direction = CONSTANT.RIGHT;
  right.style.right = `-${controllerOffset}px`;
  right.style.top = '50%';
  right.style.transform = 'translateY(-50%)';
  right.style.cursor = 'ew-resize';

  bottomRight._direction = CONSTANT.BOTTOM_RIGHT;
  bottomRight.style.bottom = `-${controllerOffset}px`;
  bottomRight.style.right = `-${controllerOffset}px`;
  bottomRight.style.cursor = 'nwse-resize';

  bottom._direction = CONSTANT.BOTTOM;
  bottom.style.bottom = `-${controllerOffset}px`;
  bottom.style.left = '50%';
  bottom.style.transform = 'translateX(-50%)';
  bottom.style.cursor = 'ns-resize';

  bottomLeft._direction = CONSTANT.BOTTOM_LEFT;
  bottomLeft.style.bottom = `-${controllerOffset}px`;
  bottomLeft.style.left = `-${controllerOffset}px`;
  bottomLeft.style.cursor = 'nesw-resize';

  left._direction = CONSTANT.LEFT;
  left.style.left = `-${controllerOffset}px`;
  left.style.top = '50%';
  left.style.transform = 'translateY(-50%)';
  left.style.cursor = 'ew-resize';

  topLeft._direction = CONSTANT.TOP_LEFT;
  topLeft.style.left = `-${controllerOffset}px`;
  topLeft.style.top = `-${controllerOffset}px`;
  topLeft.style.cursor = 'nwse-resize';

  // drag controller
  center.style.top = '50%';
  center.style.left = '50%';
  center.style.transform = 'translate(-50%, -50%)';
  center.style.cursor = 'move';

  const resizeControllers = [top, topRight, right, bottomRight, bottom, bottomLeft, left, topLeft];
  box.append(...resizeControllers, center);

  return {
    boundingBox: box,
    resizeControllers,
    dragController: center,
  };
}

const drawGeometry = (ctx, type, state) => {
  const {
    centerX: cx,
    centerY: cy,
    width: w,
    height: h,
    rotate: r,
    fill,
    lineColor,
    lineType,
    lineWidth,
  } = state;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(r);
  ctx.beginPath();

  if (type === CONSTANT.ELLIPSE) {
    ctx.ellipse(0, 0, Math.abs(w) * 0.5, Math.abs(h) * 0.5, 0, 0, Math.PI * 2);
  } else if (type === CONSTANT.RECTANGLE) {
    ctx.rect(-w * 0.5, -h * 0.5, w, h);
  } else if (type === CONSTANT.TRIANGLE) {
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.lineTo(-w * 0.5, h * 0.5);
    ctx.closePath();
  }

  if (lineType !== 'none') {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = lineColor;
    ctx.stroke();
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}
