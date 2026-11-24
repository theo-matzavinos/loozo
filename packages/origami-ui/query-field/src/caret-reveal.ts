/** How far inside the content box, in CSS pixels, a revealed caret lands. */
const MARGIN = 2;

const contexts = new WeakMap<Document, CanvasRenderingContext2D | null>();

function measuring(document: Document): CanvasRenderingContext2D | null {
  if (!contexts.has(document)) {
    contexts.set(document, document.createElement("canvas").getContext("2d"));
  }

  return contexts.get(document) ?? null;
}

/**
 * Scrolls `element` horizontally so that its collapsed caret at `caret` is inside its content box,
 * 2 CSS px from the edge it was past; leaves it where it is when the caret is already visible.
 * The caret's position is estimated by measuring the text before it with a canvas in the input's
 * computed font, letter spacing and kerning. Assigning `scrollLeft` moves the input's viewport
 * without changing its selection. Left-to-right text only.
 */
export function revealCaret(element: HTMLInputElement, caret: number): void {
  const context = measuring(element.ownerDocument);

  if (context === null) {
    return;
  }

  const style = getComputedStyle(element);

  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  // The context is shared per document and ignores a value that isn't a length, `normal` included,
  // so `normal` is set as `0px` rather than leaving another input's spacing in place.
  if ("letterSpacing" in context) {
    let spacing = style.letterSpacing;

    if (spacing === "normal") {
      spacing = "0px";
    }

    context.letterSpacing = spacing;
  }

  if ("fontKerning" in context) {
    const kerning = style.fontKerning;

    if (kerning === "auto" || kerning === "normal" || kerning === "none") {
      context.fontKerning = kerning;
    }
  }

  const x = context.measureText(element.value.slice(0, caret)).width;
  const width =
    element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const left = element.scrollLeft;

  if (x < left) {
    element.scrollLeft = Math.max(0, x - MARGIN);
  } else if (x > left + width) {
    element.scrollLeft = x - width + MARGIN;
  }
}
