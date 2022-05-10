class Paint {
  #dpr;
  #width;
  #height;
  #bbox;
  #ctx;
  #cleanUp = () => {};

  // background may be zoomed, so store an additional copy of the original background.
  #background;
  #backgroundCache;

  #painters = {};
  #checkpoints = [];
  #activeCheckpoint = -1;

  // zoom states
  #zoomingIn = false;
  #zf = 1; // factor
  #zx; // center x
  #zy; // center y

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
    this.#dpr = window && window.devicePixelRatio || 1;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = width * this.#dpr;
    canvas.height = height * this.#dpr;
    this.#width = width;
    this.#height = height;
    this.#zx = width / 2;
    this.#zy = height / 2;
    this.#ctx = canvas.getContext('2d');
    this.#ctx.scale(this.#dpr, this.#dpr);
    this.#initDOM();
  }

  // utilities
  undo() {
    if (this.#history.undoable) {
      this.#history.undo();
      this.#hideBoundingBox();
      this.#repaint();
      this.#dispatch('undo');
    }
  }

  redo() {
    if (this.#history.redoable) {
      this.#history.redo();
      this.#repaint();
      this.#dispatch('redo');
    }
  }

  clear() {
    this.#hideBoundingBox();
    this.#history.reset();
    this.#ctx.clearRect(0, 0, this.#width, this.#height);
    this.#dispatch('clear');
  }

  save() {
    this.#cleanUp();
    this.#hideBoundingBox();

    const canvas = this.#ctx.canvas.cloneNode();
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.#ctx.canvas, 0, 0);
    this.#checkpoints.push(canvas);
    this.#activeCheckpoint = this.#checkpoints.length - 1;
    this.#history.reset();
    this.#cleanUp = () => {};
    this.#dispatch('checkpoint', { checkpoint: this.#activeCheckpoint });
  }

  restore(i) {
    if (this.#checkpoints[i]) {
      this.#activeCheckpoint = i;
      this.#history.reset();
      this.#repaint();
      this.#hideBoundingBox();
      this.#dispatch('loadcheckpoint', { checkpoint: i });
    }
  }

  // TODO:
  // 1. combine background and the canvas together.
  // 2. Export - single canvas.
  export() {}

  background(type, content) {
    if (type === 'fill' || type === 'image') {
      if (type === 'fill') {
        this.#background.fillStyle = content;
        this.#background.fillRect(0, 0, this.#width, this.#height);
      } else {
        this.#background.drawImage(content, 0, 0, this.#width, this.#height);
      }
      this.#backgroundCache.drawImage(this.#background.canvas, 0, 0);
      this.#dispatch('background');
    }
  }

  zoom(factor) {
    const w = this.#width / factor;
    const h = this.#height / factor;
    const hw = w * 0.5; // half width
    const hh = h * 0.5; // half height

    const onMouseMove = ({ offsetX: x, offsetY: y }) => {
      if (!this.#zoomingIn) {
        window.requestAnimationFrame(() => {
          this.#repaint();
          this.#ctx.beginPath();
          this.#ctx.moveTo(x - hw, y - hh);
          this.#ctx.lineTo(x + hw, y - hh);
          this.#ctx.lineTo(x + hw, y + hh);
          this.#ctx.lineTo(x - hw, y + hh);
          this.#ctx.closePath();
          this.#ctx.lineWidth = 2;
          this.#ctx.strokeStyle = '#fff';
          this.#ctx.stroke();
          this.#ctx.lineWidth = 1.0;
          this.#ctx.strokeStyle = '#000';
        });
      }
    };
    const onMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.#zoomingIn) {
        // modify zoom states
        this.#zoomingIn = true;
        this.#zf = factor;
        this.#zx = Math.min(Math.max(e.offsetX, hw), this.#width - hw);
        this.#zy = Math.min(Math.max(e.offsetY, hh), this.#height - hh);

        // transform the canvas
        this.#ctx.canvas.style.cursor = 'zoom-out';
        this.#ctx.save();
        this.#ctx.scale(this.#zf, this.#zf);
        this.#ctx.translate(-this.#zx + hw, -this.#zy + hh);
        this.#repaint();

        // transform the background
        this.#background.save();
        this.#background.clearRect(0, 0, this.#width, this.#height);
        this.#background.scale(this.#zf, this.#zf);
        this.#background.translate(-this.#zx + hw, -this.#zy + hh);
        this.#background.drawImage(this.#backgroundCache.canvas, 0, 0);
      } else {
        // reset zoom states
        this.#zoomingIn = false;
        this.#zf = 1;
        this.#zx = this.#width / 2;
        this.#zy = this.#height / 2;

        // reset canvas
        this.#ctx.canvas.style.cursor = 'zoom-in';
        this.#ctx.restore();
        this.#repaint();

        // reset background
        this.#background.restore();
        this.#background.clearRect(0, 0, this.#width, this.#height);
        this.#background.drawImage(this.#backgroundCache.canvas, 0, 0);
      }
    };

    this.#cleanUp();
    this.#ctx.canvas.style.cursor = this.#zoomingIn ? 'zoom-out' : 'zoom-in';
    this.#ctx.canvas.addEventListener('mousemove', onMouseMove);
    this.#ctx.canvas.addEventListener('mousedown', onMouseDown);
    this.#hideBoundingBox();
    this.#cleanUp = () => {
      this.#ctx.canvas.style.cursor = 'default';
      this.#ctx.canvas.removeEventListener('mousemove', onMouseMove);
      this.#ctx.canvas.removeEventListener('mousedown', onMouseDown);
      this.#repaint(); // remove the zoom box.
    }
  }

  customGeometry(shape, painter) {
    this.#painters[shape] = (ctx, state) => {
      if (this.#resizing || this.#rotating || this.#dragging) {
        this.#showBoundingBox(state);
      }
      painter(ctx, state);
    };

    return (width, height, options = {}) => {
      const bboxState = {
        // always placed in the center of the canvas
        centerX: this.#zoomingIn ? this.#zx : this.#width * 0.5,
        centerY: this.#zoomingIn ? this.#zy : this.#height * 0.5,
        width,
        height,
        rotate: 0,
      };
      this.#history.push({
        id: this.#getId(),
        type: shape,
        state: {
          ...options,
          ...bboxState,
        },
      });
  
      const handler = (e) => {
        e.preventDefault();
        this.#hideBoundingBox();
      };
  
      this.#cleanUp();
      this.#ctx.canvas.addEventListener('mousedown', handler);
      this.#showBoundingBox(bboxState);
      window.requestAnimationFrame(() => this.#repaint());
      this.#cleanUp = () => this.#ctx.canvas.removeEventListener('mousedown', handler);
      this.#dispatch('geometry', deepClone(this.#history.at(-1)));
    };
  }

  customBrush(type, painter) {
    this.#painters[type] = painter;

    return (options = {}) => {
      const onMouseDown = (e) => {
        e.preventDefault();
        const [x, y] = this.#zoomCoordinateToActual([e.offsetX, e.offsetY]);
        this.#x = x;
        this.#y = y;
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
        this.#dispatch('brushstart', { type, x: this.#x, y: this.#y });
      };
      const onMouseMove = ({ offsetX, offsetY }) => {
        if (this.#painting) {
          const [x2, y2] = this.#zoomCoordinateToActual([offsetX, offsetY]);
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
          this.#dispatch('brush', { type, x: x2, y: y2 });
        }
      };
      const onMouseUp = () => {
        this.#painting = false;
        this.#dispatch('brushend', deepClone(this.#history.at(-1)));
      };
  
      this.#cleanUp();
      this.#ctx.canvas.addEventListener('mousedown', onMouseDown);
      this.#ctx.canvas.addEventListener('mousemove', onMouseMove);
      this.#ctx.canvas.addEventListener('mouseup', onMouseUp);
      this.#ctx.canvas.addEventListener('mouseleave', onMouseUp);
      this.#hideBoundingBox();
      this.#cleanUp = () => {
        this.#ctx.canvas.removeEventListener('mousedown', onMouseDown);
        this.#ctx.canvas.removeEventListener('mousemove', onMouseMove);
        this.#ctx.canvas.removeEventListener('mouseup', onMouseUp);
        this.#ctx.canvas.removeEventListener('mouseleave', onMouseUp);
      };
    };
  }

  loadImage(image, width, height) {
    this.customGeometry(CONSTANT.IMAGE, (ctx, state) => {
      const { source, centerX: cx, centerY: cy, width: w, height: h, rotate: r } = state;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(r);
      ctx.drawImage(source, -w * 0.5, -h * 0.5, w, h);
      ctx.restore();
    })(width, height, { source: image });
  }

  // Geometries
  ellipse(width, height, options) {
    this.customGeometry(CONSTANT.ELLIPSE, (ctx, state) => {
      drawGeometry(CONSTANT.ELLIPSE, ctx, state);
    })(width, height, options);
  }

  rectangle(width, height, options) {
    this.customGeometry(CONSTANT.RECTANGLE, (ctx, state) => {
      drawGeometry(CONSTANT.RECTANGLE, ctx, state);
    })(width, height, options);
  }

  triangle(width, height, options) {
    this.customGeometry(CONSTANT.TRIANGLE, (ctx, state) => {
      drawGeometry(CONSTANT.TRIANGLE, ctx, state);
    })(width, height, options);
  }

  // TODO: bounding box
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
  eraser(options) {
    this.customBrush(CONSTANT.ERASER, (ctx, { size = 5, trajectory }) => {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      trajectory.forEach(({ pt, type }, i) => {
        const [x, y] = pt;
        if (type === CONSTANT.POINT) {
          ctx.beginPath();
          ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (type === CONSTANT.LINE) {
          const [x1, y1] = trajectory[i - 1].pt;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      });
      ctx.restore();
    })(options);
  }

  marker(options) {
    this.customBrush(CONSTANT.MARKER, (ctx, { color = '#000', size = 5, trajectory }) => {
      ctx.save()
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      trajectory.forEach(({ pt, type }, i) => {
        const [x, y] = pt;
        if (type === CONSTANT.POINT) {
          ctx.beginPath();
          ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (type === CONSTANT.LINE) {
          const [x1, y1] = trajectory[i - 1].pt;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      });
      ctx.restore();
    })(options);
  }

  // private methods
  #dispatch(event, data) {
    this.#ctx.canvas.dispatchEvent(new CustomEvent(`paint:${event}`, { detail: data }))
  }

  #repaint() {
    // clear the canvas
    this.#ctx.clearRect(0, 0, this.#width, this.#height);

    // paint the checkpoint
    const checkpoint = this.#checkpoints[this.#activeCheckpoint];
    if (checkpoint) {
      this.#ctx.drawImage(checkpoint, 0, 0);
    }

    // paint the action history
    this.#history.forEach(({ id, type, state }, i) => {
      const nextAction = this.#history.at(i + 1);
      if (nextAction && id === nextAction.id) {
        // Skip the current action, as the next action resizes/drags/rotates the current geometry.
        return;
      }
      this.#painters[type](this.#ctx, state);
    });
  }

  // cursor coordinates to actual coordinate
  #zoomCoordinateToActual(xy) {
    if (this.#zoomingIn) {
      xy[0] = this.#zx + (xy[0] - this.#width / 2) / this.#zf;
      xy[1] = this.#zy + (xy[1] - this.#height / 2) / this.#zf;
    }
    return xy;
  }

  #actualCoordinateToZoom(xy) {
    if (this.#zoomingIn) {
      xy[0] = this.#width / 2 + (xy[0] - this.#zx) * this.#zf;
      xy[1] = this.#height / 2 + (xy[1] - this.#zy) * this.#zf;
    }
    return xy;
  }

  #showBoundingBox({ centerX: cx, centerY: cy, width: w, height: h, rotate: r }) {
    const _w = Math.abs(w) * this.#zf;
    const _h = Math.abs(h) * this.#zf;
    const [_x, _y] = this.#actualCoordinateToZoom([cx, cy]);

    this.#bbox.style.width = _w + 'px';
    this.#bbox.style.height = _h + 'px';
    this.#bbox.style.transform = `
      translate(${_x - _w * 0.5}px, ${_y - _h * 0.5}px)
      rotate(${r}rad)
    `;

    // bounding box states
    this.#bbox._cx = cx;
    this.#bbox._cy = cy;
    this.#bbox._w = w;
    this.#bbox._h = h;
    this.#bbox._r = r;
  }

  #hideBoundingBox() {
    this.#bbox.style.transform = 'translate(-9999px, -9999px)';
  }

  #initDOM() {
    this.#background = this.#ctx.canvas.cloneNode();
    this.#background.id = 'paint-background';
    this.#background = this.#background.getContext('2d');
    this.#background.scale(this.#dpr, this.#dpr);
    this.#backgroundCache = this.#ctx.canvas.cloneNode().getContext('2d');
    this.#backgroundCache.scale(this.#dpr, this.#dpr);

    const wrapper = createWrapper(this.#width, this.#height);
    const overlay = createOverlay();
    const {
      boundingBox: bbox,
      resizers,
      dragger,
    } = createBoundingBox();

    this.#bbox = bbox;
    this.#ctx.canvas.parentNode.replaceChild(wrapper, canvas);
    wrapper.appendChild(canvas);
    wrapper.appendChild(this.#background.canvas)
    wrapper.appendChild(bbox);
    wrapper.appendChild(overlay);

    resizers.forEach((dot) => {
      dot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#resizing = true;
        this.#resizeDirection = dot._direction;
        this.#shouldAppendHistory = true;
        this.#flipX = bbox._w < 0 ? -1 : 1;
        this.#flipY = bbox._h < 0 ? -1 : 1;
        overlay.style.zIndex = 9999;
        this.#dispatch('onresizestart', { direction: this.#resizeDirection });
      });
    });

    dragger.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.#dragging = true;
      this.#shouldAppendHistory = true;
      overlay.style.zIndex = 9999;
      this.#dispatch('ondragstart');
    });

    bbox.addEventListener(('mousedown'), (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.#rotating = true;
      this.#shouldAppendHistory = true;
      this.#x = bbox._cx - Math.abs(bbox._w) * 0.5 + e.offsetX / this.#zf; // the x, y are w.r.t. bbox, simply rescale it.
      this.#y = bbox._cy - Math.abs(bbox._h) * 0.5 + e.offsetY / this.#zf;
      overlay.style.zIndex = 9999;
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

      const [x, y] = this.#zoomCoordinateToActual([e.offsetX, e.offsetY]);
      const dx = e.movementX / this.#zf;
      const dy = e.movementY / this.#zf;
      const state = this.#history.at(-1).state;

      if (this.#dragging) {
        state.centerX += dx;
        state.centerY += dy;
        overlay.style.cursor = 'move';
        this.#dispatch('ondrag', { dx, dy });
      }
      else if (this.#resizing) {
        const d = this.#resizeDirection;

        if (d === CONSTANT.TOP) {
          state.centerY += dy * 0.5;
          state.height -= dy * this.#flipY;
          overlay.style.cursor = 'ns-resize';
        }
        else if (d === CONSTANT.BOTTOM) {
          state.centerY += dy * 0.5;
          state.height += dy * this.#flipY;
          overlay.style.cursor = 'ns-resize';
        }
        else if (d === CONSTANT.LEFT) {
          state.centerX += dx * 0.5;
          state.width -= dx * this.#flipX;
          overlay.style.cursor = 'ew-resize';
        }
        else if (d === CONSTANT.RIGHT) {
          state.centerX += dx * 0.5;
          state.width += dx * this.#flipX;
          overlay.style.cursor = 'ew-resize';
        }
        else if (d === CONSTANT.TOP_RIGHT) {
          state.centerX += dx * 0.5;
          state.centerY += dy * 0.5;
          state.width += dx * this.#flipX;
          state.height -= dy * this.#flipY;
          overlay.style.cursor = 'nesw-resize';
        }
        else if (d === CONSTANT.BOTTOM_RIGHT) {
          state.centerX += dx * 0.5;
          state.centerY += dy * 0.5;
          state.width += dx * this.#flipX;
          state.height += dy * this.#flipY;
          overlay.style.cursor = 'nwse-resize';
        }
        else if (d === CONSTANT.BOTTOM_LEFT) {
          state.centerX += dx * 0.5;
          state.centerY += dy * 0.5;
          state.width -= dx * this.#flipX;
          state.height += dy * this.#flipY;
          overlay.style.cursor = 'nesw-resize';
        }
        else if (d === CONSTANT.TOP_LEFT) {
          state.centerX += dx * 0.5;
          state.centerY += dy * 0.5;
          state.width -= dx * this.#flipX;
          state.height -= dy * this.#flipY;
          overlay.style.cursor = 'nwse-resize';
        }
        this.#dispatch('onresize', { direction: d, dx, dy });
      }
      else if (this.#rotating) {
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
        const action = deepClone(this.#history.at(-1));
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
const paint = new Paint(canvas, 1200, 1200);

const image = document.querySelector('#image');
paint.background('image', image);


document.querySelector('#redo-btn').addEventListener('click', () => paint.redo());
document.querySelector('#undo-btn').addEventListener('click', () => paint.undo());
document.querySelector('#clear-btn').addEventListener('click', () => paint.clear());
document.querySelector('#zoom-btn').addEventListener('click', () => paint.zoom(2));
document.querySelector('#checkpoint-btn').addEventListener('click', () => paint.save());
document.querySelector('#load-checkpoint-btn-1').addEventListener('click', () => paint.restore(1));
document.querySelector('#load-checkpoint-btn-2').addEventListener('click', () => paint.restore(2));
document.querySelector('#ellipse-btn').addEventListener('click', () => paint.ellipse(200, 200));
document.querySelector('#rectangle-btn').addEventListener('click', () => paint.rectangle(300, 150));
document.querySelector('#triangle-btn').addEventListener('click', () => paint.triangle(300*1.118, 300));
document.querySelector('#marker-btn').addEventListener('click', () => paint.marker({ size : 20 }));
document.querySelector('#eraser-btn').addEventListener('click', () => paint.eraser({ size: 20 }));
document.querySelector('#load-img-btn').addEventListener('click', () => paint.loadImage(image, 300, 300));
document.querySelector('#line-btn').addEventListener('click', () => paint.line());