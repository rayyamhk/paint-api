class Paint {
  #bbox;
  #ctx;
  #cleanUp = () => {};

  // initial mousedown position
  #x;
  #y;

  // action id
  #id = 0;

  // action history
  #undos = [];
  #redos = [];
  #shouldAppendHistory = false;

  // actions state
  #painting = false;
  #dragging = false;
  #rotating = false;
  #resizing = false;
  #resizeDirection; 
  #flipX = 1; // check if the bounding box has been flipped, use to correct the result of resize result.
  #flipY = 1;

  constructor(canvas, width, height) {
    const dpr = window && window.devicePixelRatio || 1;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    this.#ctx = canvas.getContext('2d');
    this.#ctx.scale(dpr, dpr);
    this.#initDOM();
  }

  // utilities
  undo() {
    if (this.#undos.length > 0) {
      this.#redos.push(this.#undos.pop());
      this.#hideBoundingBox();
      this.#repaint();
    }
  }

  redo() {
    if (this.#redos.length > 0) {
      this.#undos.push(this.#redos.pop());
      this.#repaint();
    }
  }

  clear() {
    this.#hideBoundingBox();
    this.#ctx.clearRect(0, 0, this.#ctx.canvas.width, this.#ctx.canvas.height);
  }

  checkpoint() {}

  save() {}

  get state() {
    return this.#undos;
  }

  // Geometries
  ellipse(options = {}) {
    const _options = {
      lineType: options.lineType || 'solid', // 'none', 'solid'
      lineWidth: options.lineWidth || 5,
      lineColor: options.lineColor || '#000',
      fill: options.fill,
    };
    this.#geometryShape(CONSTANT.ELLIPSE, _options);
  }

  rectangle(options = {}) {
    const _options = {
      lineType: options.lineType || 'solid', // 'none', 'solid'
      lineWidth: options.lineWidth || 5,
      lineColor: options.lineColor || '#000',
      fill: options.fill,
    };
    this.#geometryShape(CONSTANT.RECTANGLE, _options);
  }

  triangle(options = {}) {
    const _options = {
      lineType: options.lineType || 'solid', // 'none', 'solid'
      lineWidth: options.lineWidth || 5,
      lineColor: options.lineColor || '#000',
      fill: options.fill,
    };
    this.#geometryShape(CONSTANT.TRIANGLE, _options);
  }

  line(options = {}) {
    const _options = {
      lineWidth: options.lineWidth || 5,
      lineColor: options.lineColor || '#000',
    };
    const onMouseDown = (e) => {
      e.preventDefault();
      this.#x = e.offsetX;
      this.#y = e.offsetY;
      this.#painting = true;
      this.#shouldAppendHistory = true;
    };
    const onMouseMove = ({ offsetX: x, offsetY: y }) => {
      if (this.#painting) {
        if (this.#shouldAppendHistory) {
          this.#shouldAppendHistory = false;
          this.#redos = [];
          this.#undos.push({
            id: this.#getId(),
            type: CONSTANT.LINE,
            state: {
              ..._options,
              startX: this.#x,
              startY: this.#y,
              endX: undefined,
              endY: undefined,
            },
          })
        }
        const state = last(this.#undos).state;
        state.endX = x;
        state.endY = y;
        window.requestAnimationFrame(() => this.#repaint());
      };
    };
    const onMouseUp = () => {
      this.#painting = false;
    };

    this.#cleanUp();
    this.#hideBoundingBox();
    this.#ctx.canvas.addEventListener('mousedown', onMouseDown);
    this.#ctx.canvas.addEventListener('mousemove', onMouseMove);
    this.#ctx.canvas.addEventListener('mouseup', onMouseUp);
    this.#ctx.canvas.addEventListener('mouseleave', onMouseUp);
    this.#cleanUp = () => {
      this.#ctx.canvas.removeEventListener('mousedown', onMouseDown);
      this.#ctx.canvas.removeEventListener('mousemove', onMouseMove);
      this.#ctx.canvas.removeEventListener('mouseup', onMouseUp);
      this.#ctx.canvas.removeEventListener('mouseleave', onMouseUp);
    };
  }

  // Brushes
  eraser(options = {}) {
    const _options = {
      size: options.size || 5,
    };
    this.#brush(CONSTANT.ERASER, _options);
  }

  marker(options = {}) {
    const _options = {
      color: options.color || '#000000',
      size: options.size || 5,
    };
    this.#brush(CONSTANT.MARKER, _options);
  }

  // private methods
  #geometryShape(shape, options) {
    const onMouseDown = (e) => {
      e.preventDefault();
      this.#x = e.offsetX;
      this.#y = e.offsetY;
      this.#painting = true;
      this.#shouldAppendHistory = true;
    };
    const onMouseMove = ({ movementX: dx, movementY: dy }) => {
      if (this.#painting) {
        if (this.#shouldAppendHistory) {
          this.#shouldAppendHistory = false;
          this.#redos = [];
          this.#undos.push({
            id: this.#getId(),
            type: shape,
            state: {
              ...options,
              centerX: this.#x,
              centerY: this.#y,
              width: 0,
              height: 0,
              rotate: 0,
            },
          });
        }
        const state = last(this.#undos).state;
        state.width += dx * 2;
        state.height += dy * 2;
        window.requestAnimationFrame(() => this.#repaint());
      }
    };
    const onMouseUp = () => {
      this.#painting = false;
      if (!this.#shouldAppendHistory) {
        // It is false if and only if mousemove has been triggered, we can conclude:
        // 1. #undos is non-empty.
        // 2. The last action is editable, i.e. it is a geometry.
        // 3. The drawing has been finished, it's time to show the bounding box.
        const state = last(this.#undos).state;
        const { centerX, centerY, width, height, rotate } = state;
        this.#showBoundingBox(centerX, centerY, width, height, rotate);
      } else {
        // It is true if and only if mousemove hasn't been triggered, i.e. mouseclick.
        this.#hideBoundingBox();
      }
    };
    const onMouseLeave = () => {
      this.#painting = false;
    }

    this.#cleanUp();
    this.#hideBoundingBox();
    this.#ctx.canvas.addEventListener('mousedown', onMouseDown);
    this.#ctx.canvas.addEventListener('mousemove', onMouseMove);
    this.#ctx.canvas.addEventListener('mouseup', onMouseUp);
    this.#ctx.canvas.addEventListener('mouseleave', onMouseLeave);
    this.#cleanUp = () => {
      this.#ctx.canvas.removeEventListener('mousedown', onMouseDown);
      this.#ctx.canvas.removeEventListener('mousemove', onMouseMove);
      this.#ctx.canvas.removeEventListener('mouseup', onMouseUp);
      this.#ctx.canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }

  #brush(type, options) {
    const onMouseDown = (e) => {
      e.preventDefault();
      this.#x = e.offsetX;
      this.#y = e.offsetY;
      this.#painting = true;
      this.#shouldAppendHistory = true;
    };
    const onMouseMove = ({ offsetX: x2, offsetY: y2 }) => {
      if (this.#painting) {
        if (this.#shouldAppendHistory) {
          this.#shouldAppendHistory = false;
          this.#redos = [];
          this.#undos.push({
            id: this.#getId(),
            type,
            state: {
              ...options,
              trajectory: [{
                pt: [this.#x, this.#y],
                type: CONSTANT.POINT,
              }],
            }
          });
        }
        const trajectory = last(this.#undos).state.trajectory;
        const [x1, y1] = last(trajectory).pt;
        const dist = distance(x1, y1, x2, y2);
        if (dist < options.size * 0.35) {
          // If two points are closed enough, connect by a point.
          trajectory.push({
            pt: [x2, y2],
            type: CONSTANT.POINT,
          });
        } else if (dist > options.size / Math.sqrt(2)) {
          // If two points are far enough, connect by a straight line.
          trajectory.push({
            pt: [x2, y2],
            type: CONSTANT.LINE,
          });
        }
        window.requestAnimationFrame(() => this.#repaint());
      }
    };
    const onMouseUp = () => {
      this.#painting = false;
    };

    this.#cleanUp();
    this.#hideBoundingBox();
    this.#ctx.canvas.addEventListener('mousedown', onMouseDown);
    this.#ctx.canvas.addEventListener('mousemove', onMouseMove);
    this.#ctx.canvas.addEventListener('mouseup', onMouseUp);
    this.#ctx.canvas.addEventListener('mouseleave', onMouseUp);
    this.#cleanUp = () => {
      this.#ctx.canvas.removeEventListener('mousedown', onMouseDown);
      this.#ctx.canvas.removeEventListener('mousemove', onMouseMove);
      this.#ctx.canvas.removeEventListener('mouseup', onMouseUp);
      this.#ctx.canvas.removeEventListener('mouseleave', onMouseUp);
    };
  }

  #repaint() {
    this.#ctx.clearRect(0, 0, this.#ctx.canvas.width, this.#ctx.canvas.height);
    for (let i = 0; i < this.#undos.length; i++) {
      const action = this.#undos[i];
      const nextAction = this.#undos[i + 1];
      if (nextAction && action.id === nextAction.id) {
        // Skip the current action, as the next action resizes/drags/rotates the current geometry.
        continue;
      }
      const { type, state } = action;
      if (type === CONSTANT.MARKER) {
        this.#drawMarker(state);
      } else if (type === CONSTANT.ERASER) {
        this.#drawEraser(state);
      } else if (type === CONSTANT.ELLIPSE) {
        this.#drawEllipse(state);
      } else if (type === CONSTANT.RECTANGLE) {
        this.#drawRectangle(state);
      } else if (type === CONSTANT.TRIANGLE) {
        this.#drawTriangle(state);
      } else if (type === CONSTANT.LINE) {
        this.#drawLine(state);
      }
    }
  }

  #drawEllipse(state) {
    const {
      centerX: cx,
      centerY: cy,
      width: w,
      height: h,
      rotate: r,
    } = state;
    if (this.#resizing || this.#rotating || this.#dragging) {
      this.#showBoundingBox(cx, cy, w, h, r);
    }
    drawGeometry(this.#ctx, CONSTANT.ELLIPSE, state);
  }

  #drawRectangle(state) {
    const {
      centerX: cx,
      centerY: cy,
      width: w,
      height: h,
      rotate: r,
    } = state;
    if (this.#resizing || this.#rotating || this.#dragging) {
      this.#showBoundingBox(cx, cy, w, h, r);
    }
    drawGeometry(this.#ctx, CONSTANT.RECTANGLE, state);
  }

  #drawTriangle(state) {
    const {
      centerX: cx,
      centerY: cy,
      width: w,
      height: h,
      rotate: r,
    } = state;
    if (this.#resizing || this.#rotating || this.#dragging) {
      this.#showBoundingBox(cx, cy, w, h, r);
    }
    drawGeometry(this.#ctx, CONSTANT.TRIANGLE, state);
  }

  #drawLine(state) {
    const {
      startX: x1,
      startY: y1,
      endX: x2,
      endY: y2,
      lineColor,
      lineWidth,
    } = state;

    this.#ctx.save();
    this.#ctx.beginPath();
    this.#ctx.moveTo(x1, y1);
    this.#ctx.lineTo(x2, y2);
    this.#ctx.lineWidth = lineWidth;
    this.#ctx.strokeStyle = lineColor;
    this.#ctx.stroke();
    this.#ctx.restore();
  }

  #drawMarker(state) {
    const { color, trajectory, size } = state;
    this.#ctx.save();
    this.#ctx.fillStyle = color;
    this.#ctx.strokeStyle = color;
    this.#ctx.lineWidth = size;
    this.#ctx.lineCap = 'round';
    trajectory.forEach(({ pt, type }, i) => {
      const [x, y] = pt;
      if (type === CONSTANT.POINT) {
        this.#ctx.beginPath();
        this.#ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
        this.#ctx.fill();
      } else if (type === CONSTANT.LINE) {
        const [x1, y1] = trajectory[i - 1].pt;
        this.#ctx.beginPath();
        this.#ctx.moveTo(x1, y1);
        this.#ctx.lineTo(x, y);
        this.#ctx.stroke();
      }
    });
    this.#ctx.restore();
  }

  #drawEraser(state) {
    const { trajectory, size } = state;
    this.#ctx.save();
    this.#ctx.globalCompositeOperation = 'destination-out';
    this.#ctx.lineWidth = size;
    this.#ctx.lineCap = 'round';
    trajectory.forEach(({ pt, type }, i) => {
      const [x, y] = pt;
      if (type === CONSTANT.POINT) {
        this.#ctx.beginPath();
        this.#ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
        this.#ctx.fill();
      } else if (type === CONSTANT.LINE) {
        const [x1, y1] = trajectory[i - 1].pt;
        this.#ctx.beginPath();
        this.#ctx.moveTo(x1, y1);
        this.#ctx.lineTo(x, y);
        this.#ctx.stroke();
      }
    });
    this.#ctx.restore();
  }

  #showBoundingBox(centerX, centerY, width, height, rotate) {
    width = Math.abs(width);
    height = Math.abs(height);

    // bounding box states
    this.#bbox._centerX = centerX;
    this.#bbox._centerY = centerY;
    this.#bbox._width = width;
    this.#bbox._height = height;

    this.#bbox.style.width = width + 'px';
    this.#bbox.style.height = height + 'px';
    this.#bbox.style.transform = `
      translate(${centerX - width * 0.5}px, ${centerY - height * 0.5}px)
      rotate(${rotate}rad)
    `;
  }

  #hideBoundingBox() {
    this.#bbox.style.transform = 'translate(-9999px, -9999px)';
  }

  #initDOM(width, height) {
    const wrapper = createWrapper(width, height);
    const overlay = createOverlay();
    const {
      boundingBox: bbox,
      resizeControllers,
      dragController,
    } = createBoundingBox(2, 10);

    this.#bbox = bbox;
    this.#ctx.canvas.parentNode.replaceChild(wrapper, canvas);
    wrapper.appendChild(canvas);
    wrapper.appendChild(bbox);
    wrapper.appendChild(overlay);

    resizeControllers.forEach((controller) => {
      controller.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#resizing = true;
        this.#resizeDirection = controller._direction;
        this.#shouldAppendHistory = true;
        const state = last(this.#undos).state;
        this.#flipX = state.width < 0 ? -1 : 1;
        this.#flipY = state.height < 0 ? -1 : 1;
        overlay.style.zIndex = 1;
      });
    });

    dragController.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.#dragging = true;
      this.#shouldAppendHistory = true;
      overlay.style.zIndex = 1;
    });

    bbox.addEventListener(('mousedown'), (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.#rotating = true;
      this.#shouldAppendHistory = true;
      this.#x = bbox._centerX - bbox._width * 0.5 + e.offsetX;
      this.#y = bbox._centerY - bbox._height * 0.5 + e.offsetY;
      overlay.style.zIndex = 1;
    });

    overlay.addEventListener('mousemove', (e) => {
      e.stopPropagation();
      if (this.#shouldAppendHistory) {
        this.#shouldAppendHistory = false;
        const prev = last(this.#undos);
        this.#undos.push({
          ...prev,
          state: {
            ...prev.state
          },
        });
      }

      const {
        offsetX: x,
        offsetY: y,
        movementX: dx,
        movementY: dy,
      } = e;
      const state = last(this.#undos).state;

      if (this.#dragging) {
        state.centerX += dx;
        state.centerY += dy;
        overlay.style.cursor = 'move';
      } else if (this.#resizing) {
        switch (this.#resizeDirection) {
          case CONSTANT.TOP:
            state.centerY += dy * 0.5;
            state.height -= dy * this.#flipY;
            overlay.style.cursor = 'ns-resize';
            break;
          case CONSTANT.BOTTOM:
            state.centerY += dy * 0.5;
            state.height += dy * this.#flipY;
            overlay.style.cursor = 'ns-resize';
            break;
          case CONSTANT.LEFT:
            state.centerX += dx * 0.5;
            state.width -= dx * this.#flipX;
            overlay.style.cursor = 'ew-resize';
            break;
          case CONSTANT.RIGHT:
            state.centerX += dx * 0.5;
            state.width += dx * this.#flipX;
            overlay.style.cursor = 'ew-resize';
            break;
          case CONSTANT.TOP_RIGHT:
            state.centerX += dx * 0.5;
            state.centerY += dy * 0.5;
            state.width += dx * this.#flipX;
            state.height -= dy * this.#flipY;
            overlay.style.cursor = 'nesw-resize';
            break;
          case CONSTANT.BOTTOM_RIGHT:
            state.centerX += dx * 0.5;
            state.centerY += dy * 0.5;
            state.width += dx * this.#flipX;
            state.height += dy * this.#flipY;
            overlay.style.cursor = 'nwse-resize';
            break;
          case CONSTANT.BOTTOM_LEFT:
            state.centerX += dx * 0.5;
            state.centerY += dy * 0.5;
            state.width -= dx * this.#flipX;
            state.height += dy * this.#flipY;
            overlay.style.cursor = 'nesw-resize';
            break;
          case CONSTANT.TOP_LEFT:
            state.centerX += dx * 0.5;
            state.centerY += dy * 0.5;
            state.width -= dx * this.#flipX;
            state.height -= dy * this.#flipY;
            overlay.style.cursor = 'nwse-resize';
            break;
        }
      } else if (this.#rotating) {
        const cx = state.centerX;
        const cy = state.centerY;
        const baseAngle = atan(cx, cy, this.#x, this.#y); // angle of the starting position,
        state.rotate = atan(cx, cy, x, y) - baseAngle;
        overlay.style.cursor = 'grab';
      }

      window.requestAnimationFrame(() => this.#repaint());
    });

    ['mouseup', 'mouseleave'].forEach((event) => {
      overlay.addEventListener(event, (e) => {
        e.stopPropagation();
        this.#dragging = false;
        this.#resizing = false;
        this.#rotating = false;
        overlay.style.zIndex = -1;
      });
    });
  }

  #getId() {
    return this.#id++;
  }
}

const canvas = document.querySelector('#painting-board');
const paint = new Paint(canvas, 1200, 1200);
document.querySelector('#redo-btn').addEventListener('click', () => paint.redo());
document.querySelector('#undo-btn').addEventListener('click', () => paint.undo());
document.querySelector('#checkpoint-btn').addEventListener('click', () => paint.checkpoint());
document.querySelector('#ellipse-btn').addEventListener('click', () => paint.ellipse());
document.querySelector('#rectangle-btn').addEventListener('click', () => paint.rectangle());
document.querySelector('#triangle-btn').addEventListener('click', () => paint.triangle({ lineType: 'none', fill: 'skyblue'}));
document.querySelector('#marker-btn').addEventListener('click', () => paint.marker());
document.querySelector('#eraser-btn').addEventListener('click', () => paint.eraser({ size: 20 }));
document.querySelector('#line-btn').addEventListener('click', () => paint.line());