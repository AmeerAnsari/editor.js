/**
 * @class BlockSelection
 * @classdesc Manages Block selection with shortcut CMD+A and with mouse
 *
 * @module BlockSelection
 * @version 1.0.0
 */
declare var Module: any;
declare var _: any;
declare var $: any;

import SelectionUtils from '../selection';

export default class BlockSelection extends Module {
  /**
   * Flag used to define block selection
   * First CMD+A defines it as true and then second CMD+A selects all Blocks
   * @type {boolean}
   */
  private needToSelectAll: boolean = false;

  /**
   * SelectionUtils instance
   * @type {SelectionUtils}
   */
  private selection: SelectionUtils;

  /**
   * Module Preparation
   * Registers Shortcuts CMD+A and CMD+C
   * to select all and copy them
   */
  public prepare(): void {
    const {Shortcuts, Listener} = this.Editor;

    /** Selection shortcut */
    Shortcuts.add({
      name: 'CMD+A',
      handler: (event) => {
        this.handleCommandA(event);
      },
    });

    /** shortcut to copy all selected blocks */
    Shortcuts.add({
      name: 'CMD+C',
      handler: (event) => {
        this.handleCommandC(event);
      },
    });

    this.selection = new SelectionUtils();

    /** Mouse Selection */
    const overlay = $.make('div', 'codex-editor-overlay', {});
    const overlayContainer = $.make('div', 'codex-editor-overlay__container', {});
    const overlayRectangle = $.make('div', 'codex-editor-overlay__rectangle', {});
    const overlayTopScrollZone = $.make('div', 'codex-editor-overlay__scroll-zone--top', {});
    const overlayBottomScrollZone = $.make('div', 'codex-editor-overlay__scroll-zone--bottom', {});

    overlay.appendChild(overlayContainer);
    overlay.appendChild(overlayTopScrollZone);
    overlay.appendChild(overlayBottomScrollZone);
    document.body.appendChild(overlay);

    const scrollSpeed = 5;
    let mousedown = false;
    let inScrollZone = null;
    let sideMoveRect = null;
    let startX = 0;
    let startY = 0;

    let options = {
      root: this.Editor.UI.nodes.redactor,
    };

    let callback = function (entries, observer) {
      /* Content excerpted, show below */
      console.log('entries', entries);
      console.log('observer', observer);
    };

    const observer = new IntersectionObserver(callback, options);
    observer.observe(overlayRectangle);

    function scrollVertical(n) {
      if (inScrollZone && mousedown) {
        window.scrollBy(0, n);
        setImmediate(scrollVertical.bind(this, n));
      }
    }

    overlayBottomScrollZone.addEventListener('mouseenter', (event) => {
      inScrollZone = 'bot';
      scrollVertical(scrollSpeed);
    });

    overlayTopScrollZone.addEventListener('mouseenter', (event) => {
      inScrollZone = 'top';
      scrollVertical(-scrollSpeed);
    });

    overlayBottomScrollZone.addEventListener('mouseleave', (event) => {
      inScrollZone = null;
    });

    overlayTopScrollZone.addEventListener('mouseleave', (event) => {
      inScrollZone = null;
    });

    document.body.addEventListener('mousedown', (event) => {
      mousedown = true;
      startX = event.pageX;
      startY = event.pageY;

      overlayRectangle.style.left = `${startX}px`;
      overlayRectangle.style.top = `${startY}px`;
      overlayRectangle.style.bottom = `calc(100% - ${startY}px`;
      overlayRectangle.style.right = `calc(100% - ${startX}px`;

      overlayContainer.appendChild(overlayRectangle);
    }, false);

    document.body.addEventListener('mousemove', (event) => {
      if (mousedown) {
        event.preventDefault();

        // Depending on the position of the mouse relative to the starting point,
        // change the distance from the desired edge of the screen*/
        if (event.pageY >= startY) {
          sideMoveRect = 'down';
          overlayRectangle.style.top = `${startY - window.pageYOffset}px`;
          overlayRectangle.style.bottom = `calc(100% - ${event.clientY}px`;
        } else {
          sideMoveRect = 'up';
          overlayRectangle.style.bottom = `calc(100% - ${startY - window.pageYOffset}px`;
          overlayRectangle.style.top = `${event.clientY}px`;
        }

        if (event.pageX >= startX) {
          overlayRectangle.style.left = `${startX - window.pageXOffset}px`;
          overlayRectangle.style.right = `calc(100% - ${event.clientX}px`;
        } else {
          overlayRectangle.style.right = `calc(100% - ${startX - window.pageXOffset}px`;
          overlayRectangle.style.left = `${event.clientX}px`;
        }
      }
    }, false);

    document.body.addEventListener('mouseup', (event) => {
      mousedown = false;
      overlayContainer.removeChild(overlayRectangle);

      startX = 0;
      startY = 0;
    }, false);

  }

  /**
   * Clear selection from Blocks
   */
  public clearSelection(restoreSelection = false) {
    const {BlockManager} = this.Editor;
    const anyBlockSelected = BlockManager.blocks.findIndex((block) => block.selected === true) !== -1;

    if (!anyBlockSelected) {
      return;
    }

    this.needToSelectAll = false;
    BlockManager.blocks.forEach((block) => block.selected = false);

    /**
     * restore selection when Block is already selected
     * but someone tries to write something.
     */
    if (restoreSelection) {
      this.selection.restore();
    }
  }

  /**
   * First CMD+A Selects current focused blocks,
   * and consequent second CMD+A keypress selects all blocks
   *
   * @param {keydown} event
   */
  private handleCommandA(event): void {
    /** Prevent default selection */
    event.preventDefault();

    if (this.needToSelectAll) {
      this.selectAllBlocks();
      this.needToSelectAll = false;
    } else {
      this.selectBlockByIndex();
      this.needToSelectAll = true;
    }
  }

  /**
   * Copying selected blocks
   * Before putting to the clipboard we sanitize all blocks and then copy to the clipboard
   *
   * @param event
   */
  private handleCommandC(event): void {
    const {BlockManager, Sanitizer} = this.Editor;
    const anyBlockSelected = BlockManager.blocks.some((block) => block.selected === true);

    if (!anyBlockSelected) {
      return;
    }

    const fakeClipboard = $.make('div');

    BlockManager.blocks.filter((block) => block.selected)
      .forEach((block) => {
        /**
         * Make <p> tag that holds clean HTML
         */
        const cleanHTML = Sanitizer.clean(block.holder.innerHTML, this.sanitizerConfig);
        const fragment = $.make('p');

        fragment.innerHTML = cleanHTML;
        fakeClipboard.appendChild(fragment);
      });

    _.copyTextToClipboard(fakeClipboard.innerHTML);
  }

  /**
   * Select All Blocks
   * Each Block has selected setter that makes Block copyable
   */
  private selectAllBlocks() {
    const {BlockManager} = this.Editor;

    BlockManager.blocks.forEach((block) => block.selected = true);
  }

  /**
   * select Block
   * @param {number?} index - Block index according to the BlockManager's indexes
   */
  private selectBlockByIndex(index?) {
    const {BlockManager} = this.Editor;

    /**
     * Remove previous focused Block's state
     */
    BlockManager.clearFocused();

    let block;

    if (isNaN(index)) {
      block = BlockManager.currentBlock;
    } else {
      block = BlockManager.getBlockByIndex(index);
    }

    /** Save selection */
    this.selection.save();
    SelectionUtils.get()
      .removeAllRanges();

    block.selected = true;
  }

  /**
   * Sanitizer Config
   * @return {SanitizerConfig}
   */
  private get sanitizerConfig() {
    return {
      p: {},
      h1: {},
      h2: {},
      h3: {},
      h4: {},
      h5: {},
      h6: {},
      ol: {},
      ul: {},
      li: {},
      br: true,
      img: {
        src: true,
        width: true,
        height: true,
      },
      a: {
        href: true,
      },
      b: {},
      i: {},
      u: {},
    };
  }
}
