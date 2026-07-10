/**
 * rehype plugin: wrap each word of streamed text in an animated <span class="sd-word">.
 *
 * This powers the "blur-in" reveal for streaming assistant messages (see the
 * `sdBlurIn` keyframes in index.css). Words are wrapped individually so that,
 * as react-markdown re-parses on each token, React reconciliation keeps already
 * rendered spans mounted (no re-animation) and only newly appended spans fire
 * their CSS mount animation.
 *
 * Zero runtime deps — operates directly on HAST node shapes.
 *
 * Must run AFTER rehype-raw so custom raw-HTML elements (tool-executing,
 * video-embed, ...) already exist as HAST elements and can be skipped.
 */

// Elements whose text we must NOT fragment into per-word spans.
const SKIP_TAGS = new Set([
  'code',
  'pre',
  'svg',
  'a',
  'tool-executing',
  'tool-complete',
  'video-embed',
]);

// Matches runs of whitespace vs. non-whitespace so we can preserve spacing.
const TOKEN_RE = /(\s+)/;

function makeWordSpan(word) {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['sd-word'] },
    children: [{ type: 'text', value: word }],
  };
}

function wrapTextNode(node) {
  // Split into alternating [nonspace, space, nonspace, ...] pieces, preserving
  // the original whitespace as plain text so wrapping/line breaks are unaffected.
  const pieces = node.value.split(TOKEN_RE);
  const out = [];
  for (const piece of pieces) {
    if (piece === '') continue;
    if (/^\s+$/.test(piece)) {
      out.push({ type: 'text', value: piece });
    } else {
      out.push(makeWordSpan(piece));
    }
  }
  return out;
}

function visit(node) {
  if (!node.children || node.children.length === 0) return;
  if (node.type === 'element' && SKIP_TAGS.has(node.tagName)) return;

  const newChildren = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value.trim() !== '') {
      newChildren.push(...wrapTextNode(child));
    } else {
      visit(child);
      newChildren.push(child);
    }
  }
  node.children = newChildren;
}

export function rehypeAnimateWords() {
  return (tree) => {
    visit(tree);
  };
}

export default rehypeAnimateWords;
