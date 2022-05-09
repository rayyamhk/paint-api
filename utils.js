const CONSTANT = {
  ELLIPSE: 'ellipse',
  RECTANGLE: 'rectangle',
  TRIANGLE: 'triangle',
  IMAGE: 'image',
  ERASER: 'eraser',
  MARKER: 'marker',
  HIGHLIGHTER: 'highlither',

  POINT: 'point',
  LINE: 'line',

  TOP: 'top',
  TOP_RIGHT: 'top-right',
  RIGHT: 'right',
  BOTTOM_RIGHT: 'bottom-right',
  BOTTOM: 'bottom',
  BOTTOM_LEFT: 'bottom-left',
  LEFT: 'left',
  TOP_LEFT: 'top-left',
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
  wrapper.id = 'paint-wrapper';
  wrapper.style.width = width + 'px';
  wrapper.style.height = height + 'px';
  return wrapper;
}

const createOverlay = () => {
  const overlay = document.createElement('div');
  overlay.id = 'paint-overlay';
  return overlay;
}

const createBoundingBox = () => {
  const box = document.createElement('div');
  box.id = 'paint-bbox';

  // resize controllers
  const top = document.createElement('div');
  top.classList.add('controller');

  const topRight = top.cloneNode();
  const right = top.cloneNode();
  const bottomRight = top.cloneNode();
  const bottom = top.cloneNode();
  const bottomLeft = top.cloneNode();
  const left = top.cloneNode();
  const topLeft = top.cloneNode();
  const center = top.cloneNode();

  top._direction = CONSTANT.TOP;
  topRight._direction = CONSTANT.TOP_RIGHT;
  right._direction = CONSTANT.RIGHT;
  bottomRight._direction = CONSTANT.BOTTOM_RIGHT;
  bottom._direction = CONSTANT.BOTTOM;
  bottomLeft._direction = CONSTANT.BOTTOM_LEFT;
  left._direction = CONSTANT.LEFT;
  topLeft._direction = CONSTANT.TOP_LEFT;

  const resizers = [top, topRight, right, bottomRight, bottom, bottomLeft, left, topLeft];
  box.append(...resizers, center);

  return {
    boundingBox: box,
    resizers,
    dragger: center,
  };
}

const drawGeometry = (type, ctx, state) => {
  const {
    centerX: cx,
    centerY: cy,
    width: w,
    height: h,
    rotate: r,
    fill,
    lineColor = '#000',
    lineType = 'solid',
    lineWidth = 5,
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

const isPrimitive = (el) => Object(el) !== el || typeof el === 'function';

const cloneArray = (assigned, array) => {
  array.forEach((el, i) => {
    if (isPrimitive(el)) {
      assigned[i] = el;
    } else if (Array.isArray(el)) {
      assigned[i] = [];
      cloneArray(assigned[i], el);
    } else {
      assigned[i] = {};
      cloneObject(assigned[i], el);
    }
  });
};

const cloneObject = (assigned, obj) => {
  Object.entries(obj).forEach(([k, v]) => {
    if (isPrimitive(v)) {
      assigned[k] = v;
    } else if (Array.isArray(v)) {
      assigned[k] = [];
      cloneArray(assigned[k], v);
    } else {
      assigned[k] = {};
      cloneObject(assigned[k], v);
    }
  });
};

const deepClone = (obj) => {
  if (typeof obj !== 'object') {
    return obj;
  }

  let assigned;
  if (Array.isArray(obj)) {
    assigned = [];
    cloneArray(assigned, obj);
  } else {
    assigned = {};
    cloneObject(assigned, obj);
  }
  return assigned;
};