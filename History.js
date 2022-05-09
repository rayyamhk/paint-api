class PaintHistory {
  #undos = [];
  #redos = [];

  get undoable() {
    return this.#undos.length > 0;
  }

  get redoable() {
    return this.#redos.length > 0;
  }

  get size() {
    return this.#undos.length;
  }

  push(el) {
    this.#undos.push(el);
    this.#redos = [];
  }

  forEach(cb) {
    this.#undos.forEach(cb);
  }

  undo() {
    if (this.#undos.length > 0) {
      this.#redos.push(this.#undos.pop());
    }
  }

  undoAll() {
    this.#redos = this.#undos;
    this.#undos = [];
  }

  redo() {
    if (this.#redos.length > 0) {
      this.#undos.push(this.#redos.pop());
    }
  }

  reset() {
    this.#undos = [];
    this.#redos = [];
  }

  at(i) {
    if (i >= 0) {
      return this.#undos[i];
    }
    return this.#undos[this.#undos.length + i];
  }
}