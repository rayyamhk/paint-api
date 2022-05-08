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
  #history = new PaintHistory();
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
    if (this.#history.undoable) {
      this.#history.undo();
      this.#hideBoundingBox();
      this.#repaint();
      this.#dispatch('onundo');
    }
  }

  redo() {
    if (this.#history.redoable) {
      this.#history.redo();
      this.#repaint();
      this.#dispatch('onredo');
    }
  }

  clear() {
    this.#hideBoundingBox();
    this.#history.reset();
    this.#ctx.clearRect(0, 0, this.#ctx.canvas.width, this.#ctx.canvas.height);
    this.#dispatch('onclear');
  }

  checkpoint() {}

  save() {}

  get state() {
    return this.#history.history;
  }

  // Geometries
  ellipse(options) {
    this.#geometryShape(CONSTANT.ELLIPSE, options);
  }

  rectangle(options) {
    this.#geometryShape(CONSTANT.RECTANGLE, options);
  }

  triangle(options) {
    this.#geometryShape(CONSTANT.TRIANGLE, options);
  }

  line(options = {}) {
    const onMouseDown = (e) => {
      e.preventDefault();
      this.#x = e.offsetX;
      this.#y = e.offsetY;
      this.#painting = true;
      this.#shouldAppendHistory = true;
      this.#dispatch('onpaintstart', { type: CONSTANT.LINE, x: this.#x, y: this.#y });
    };
    const onMouseMove = ({ offsetX: x, offsetY: y }) => {
      if (this.#painting) {
        if (this.#shouldAppendHistory) {
          this.#shouldAppendHistory = false;
          this.#history.push({
            id: this.#getId(),
            type: CONSTANT.LINE,
            state: {
              lineWidth: options.lineWidth || 5,
              lineColor: options.lineColor || '#000',
              startX: this.#x,
              startY: this.#y,
              endX: undefined,
              endY: undefined,
            },
          });
        }
        const state = this.#history.at(-1).state;
        state.endX = x;
        state.endY = y;
        window.requestAnimationFrame(() => this.#repaint());
        this.#dispatch('onpaint', { type: CONSTANT.LINE, x, y });
      };
    };
    const onMouseUp = () => {
      this.#painting = false;
      this.#dispatch('onpaintend', deepClone(this.#history.at(-1)));
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
    this.#brush(CONSTANT.ERASER, { size: options.size || 5});
  }

  marker(options = {}) {
    this.#brush(CONSTANT.MARKER, {
      color: options.color || '#000000',
      size: options.size || 5,
    });
  }

  // private methods
  #dispatch(event, data) {
    this.#ctx.canvas.dispatchEvent(new CustomEvent(`paint:${event}`, { detail: data }))
  }

  #geometryShape(shape, options = {}) {
    const onMouseDown = (e) => {
      e.preventDefault();
      this.#x = e.offsetX;
      this.#y = e.offsetY;
      this.#painting = true;
      this.#shouldAppendHistory = true;
      this.#dispatch('onpaintstart', { type: shape });
    };
    const onMouseMove = ({ movementX: dx, movementY: dy }) => {
      if (this.#painting) {
        if (this.#shouldAppendHistory) {
          this.#shouldAppendHistory = false;
          this.#history.push({
            id: this.#getId(),
            type: shape,
            state: {
              lineType: options.lineType || 'solid', // 'none', 'solid'
              lineWidth: options.lineWidth || 5,
              lineColor: options.lineColor || '#000',
              fill: options.fill,
              centerX: this.#x,
              centerY: this.#y,
              width: 0,
              height: 0,
              rotate: 0,
            },
          });
        }
        const state = this.#history.at(-1).state;
        state.width += dx * 2;
        state.height += dy * 2;
        window.requestAnimationFrame(() => this.#repaint());
        this.#dispatch('onpaint', { type: shape, dx, dy });
      }
    };
    const onMouseUp = () => {
      this.#painting = false;
      if (!this.#shouldAppendHistory) {
        // It is false if and only if mousemove has been triggered, we can conclude:
        // 1. #undos is non-empty.
        // 2. The last action is editable, i.e. it is a geometry.
        // 3. The drawing has been finished, it's time to show the bounding box.
        const action = this.#history.at(-1);
        this.#showBoundingBox(action.state);
        this.#dispatch('onpaintend', deepClone(action));
      } else {
        // It is true if and only if mousemove hasn't been triggered, i.e. mouseclick.
        this.#hideBoundingBox();
      }
    };
    const onMouseLeave = () => {
      if (this.#painting) {
        // After mouseup, the cursor will enter the bounding box which will trigger uncessary mouseleave.
        this.#painting = false;
        this.#dispatch('onpaintend', deepClone(this.#history.at(-1)));
      }
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
      this.#history.push({
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
      window.requestAnimationFrame(() => this.#repaint());
      this.#dispatch('onpaintstart', { type, x: this.#x, y: this.#y });
    };
    const onMouseMove = ({ offsetX: x2, offsetY: y2 }) => {
      if (this.#painting) {
        const trajectory = this.#history.at(-1).state.trajectory;
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
        this.#dispatch('onpaint', { type, x: x2, y: y2 });
      }
    };
    const onMouseUp = () => {
      this.#painting = false;
      this.#dispatch('onpaintend', deepClone(this.#history.at(-1)));
    };
    const onMouseLeave = () => {
      if (this.#painting) {
        this.#painting = false;
        this.#dispatch('onpaintend', deepClone(this.#history.at(-1)));
      }
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

  #repaint() {
    this.#ctx.clearRect(0, 0, this.#ctx.canvas.width, this.#ctx.canvas.height);
    this.#history.forEach(({ id, type, state }, i) => {
      const nextAction = this.#history.at(i + 1);
      if (nextAction && id === nextAction.id) {
        // Skip the current action, as the next action resizes/drags/rotates the current geometry.
        return;
      }
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
    });
  }

  #drawEllipse(state) {
    if (this.#resizing || this.#rotating || this.#dragging) {
      this.#showBoundingBox(state);
    }
    drawGeometry(this.#ctx, CONSTANT.ELLIPSE, state);
  }

  #drawRectangle(state) {
    if (this.#resizing || this.#rotating || this.#dragging) {
      this.#showBoundingBox(state);
    }
    drawGeometry(this.#ctx, CONSTANT.RECTANGLE, state);
  }

  #drawTriangle(state) {
    if (this.#resizing || this.#rotating || this.#dragging) {
      this.#showBoundingBox(state);
    }
    drawGeometry(this.#ctx, CONSTANT.TRIANGLE, state);
  }

  #drawLine({ startX: x1, startY: y1, endX: x2, endY: y2, lineColor, lineWidth }) {
    this.#ctx.save();
    this.#ctx.beginPath();
    this.#ctx.moveTo(x1, y1);
    this.#ctx.lineTo(x2, y2);
    this.#ctx.lineWidth = lineWidth;
    this.#ctx.strokeStyle = lineColor;
    this.#ctx.stroke();
    this.#ctx.restore();
  }

  #drawMarker({ color, trajectory, size }) {
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

  #drawEraser({ trajectory, size }) {
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

  #showBoundingBox({ centerX: cx, centerY: cy, width: w, height: h, rotate: r }) {
    w = Math.abs(w);
    h = Math.abs(h);

    // bounding box states
    this.#bbox._centerX = cx;
    this.#bbox._centerY = cy;
    this.#bbox._width = w;
    this.#bbox._height = h;

    this.#bbox.style.width = w + 'px';
    this.#bbox.style.height = h + 'px';
    this.#bbox.style.transform = `
      translate(${cx - w * 0.5}px, ${cy - h * 0.5}px)
      rotate(${r}rad)
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
        const state = this.#history.at(-1).state;
        this.#flipX = state.width < 0 ? -1 : 1;
        this.#flipY = state.height < 0 ? -1 : 1;
        overlay.style.zIndex = 1;
        this.#dispatch('onresizestart', { direction: this.#resizeDirection });
      });
    });

    dragController.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.#dragging = true;
      this.#shouldAppendHistory = true;
      overlay.style.zIndex = 1;
      this.#dispatch('ondragstart');
    });

    bbox.addEventListener(('mousedown'), (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.#rotating = true;
      this.#shouldAppendHistory = true;
      this.#x = bbox._centerX - bbox._width * 0.5 + e.offsetX;
      this.#y = bbox._centerY - bbox._height * 0.5 + e.offsetY;
      overlay.style.zIndex = 1;
      this.#dispatch('onrotatestart');
    });

    overlay.addEventListener('mousemove', (e) => {
      e.stopPropagation();

      if (this.#shouldAppendHistory) {
        this.#shouldAppendHistory = false;
        const prev = this.#history.at(-1);
        this.#history.push({
          ...prev,
          state: {
            ...prev.state,
          }
        });
      }

      const {
        offsetX: x,
        offsetY: y,
        movementX: dx,
        movementY: dy,
      } = e;
      const state = this.#history.at(-1).state;

      if (this.#dragging) {
        state.centerX += dx;
        state.centerY += dy;
        overlay.style.cursor = 'move';
        this.#dispatch('ondrag', { dx, dy });
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
        this.#dispatch('onresize', { direction: this.#resizeDirection, dx, dy });
      } else if (this.#rotating) {
        const cx = state.centerX;
        const cy = state.centerY;
        const baseAngle = atan(cx, cy, this.#x, this.#y); // angle of the starting position,
        let rotation = atan(cx, cy, x, y) - baseAngle;
        if (rotation < 0) {
          rotation += Math.PI * 2;
        }
        state.rotate = rotation;
        overlay.style.cursor = 'grab';
        this.#dispatch('onrotate', { rotation });
      }

      window.requestAnimationFrame(() => this.#repaint());
    });

    ['mouseup', 'mouseleave'].forEach((event) => {
      overlay.addEventListener(event, (e) => {
        e.stopPropagation();
        const action = this.#history.at(-1);
        if (this.#dragging) {
          this.#dragging = false;
          this.#dispatch('ondragend', action);
        } else if (this.#resizing) {
          this.#resizing = false;
          this.#dispatch('onresizeend', action);
        } else if (this.#rotating) {
          this.#rotating = false;
          this.#dispatch('onrotateend', action);
        }
        overlay.style.zIndex = -1;
      });
    });
  }

  #getId() {
    return this.#id++;
  }
}

const canvas = document.querySelector('#painting-board');
canvas.addEventListener('paint:onpaintstart', ({ detail }) => {
  console.log('paint start: ', detail);
});
canvas.addEventListener('paint:onpaint', ({detail}) => {
  console.log('painting: ', detail);
});
canvas.addEventListener('paint:onpaintend', ({detail}) => {
  console.log('paint end: ', detail);
});
canvas.addEventListener('paint:onrotatestart', ({detail}) => {
  console.log('rotate start: ', detail);
});
canvas.addEventListener('paint:onrotate', ({detail}) => {
  console.log('rotating: ', detail);
});
canvas.addEventListener('paint:onrotateend', ({detail}) => {
  console.log('rotate end: ', detail);
});
canvas.addEventListener('paint:onresizestart', ({detail}) => {
  console.log('resize start: ', detail);
});
canvas.addEventListener('paint:onresize', ({detail}) => {
  console.log('resizing: ', detail);
});
canvas.addEventListener('paint:onresizeend', ({detail}) => {
  console.log('resize end: ', detail);
});
canvas.addEventListener('paint:ondragstart', ({detail}) => {
  console.log('drag start: ', detail);
});
canvas.addEventListener('paint:ondrag', ({detail}) => {
  console.log('dragging: ', detail);
});
canvas.addEventListener('paint:ondragend', ({detail}) => {
  console.log('drag end: ', detail);
});

const paint = new Paint(canvas, 1200, 1200);
document.querySelector('#redo-btn').addEventListener('click', () => paint.redo());
document.querySelector('#undo-btn').addEventListener('click', () => paint.undo());
document.querySelector('#checkpoint-btn').addEventListener('click', () => paint.checkpoint());
document.querySelector('#ellipse-btn').addEventListener('click', () => paint.ellipse());
document.querySelector('#rectangle-btn').addEventListener('click', () => paint.rectangle());
document.querySelector('#triangle-btn').addEventListener('click', () => paint.triangle({ lineType: 'none', fill: 'skyblue'}));
document.querySelector('#marker-btn').addEventListener('click', () => paint.marker({ size : 20 }));
document.querySelector('#eraser-btn').addEventListener('click', () => paint.eraser({ size: 20 }));
document.querySelector('#line-btn').addEventListener('click', () => paint.line());