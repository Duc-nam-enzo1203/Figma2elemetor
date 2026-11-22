/**
 * Elementor v4 Atomic Widgets Compiler (`e-flexbox`, `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`).
 */
import { shortId } from '../utils/crypto.js';
import { inferHeadingTag, svgMarkupToDataUri } from './compiler-helpers.js';

function buildV4ImageSrcProp(media) {
  if (media && Number(media.id) > 0) {
    return {
      $$type: 'image-src',
      value: {
        id: { $$type: 'image-attachment-id', value: Number(media.id) },
        url: null,
      },
    };
  }
  if (media && media.url) {
    return {
      $$type: 'image-src',
      value: {
        id: null,
        url: { $$type: 'url', value: media.url },
      },
    };
  }
  return null;
}

export function compileElementorV4(doc, options = {}) {
  const { attachmentMap = {} } = options;
  const nodes = doc.nodes || {};

  const resolveMedia = (sha, fallbackDataUri = '') => {
    if (sha && attachmentMap[sha] && attachmentMap[sha].url) {
      return { id: Number(attachmentMap[sha].id) || 0, url: attachmentMap[sha].url };
    }
    return { id: 0, url: fallbackDataUri || '' };
  };

  const buildV4Node = (nodeId) => {
    const node = nodes[nodeId];
    if (!node) return null;

    const cleanId = String(node.sourceNodeId || nodeId).replace(/[^a-zA-Z0-9_-]/g, '-');
    const classId = `e-${cleanId}-${shortId(cleanId)}`;
    const wType = mapToV4WidgetType(node);

    const settings = {
      classes: {
        $$type: 'classes',
        value: [classId],
      },
      _f2e_node_id: node.sourceNodeId || node.id,
    };

    if (wType === 'e-heading') {
      settings.title = { $$type: 'string', value: (node.content && (node.content.characters || node.content.name)) || 'Heading' };
      settings.tag = { $$type: 'string', value: inferHeadingTag(node) };
    } else if (wType === 'e-paragraph') {
      settings.paragraph = { $$type: 'string', value: (node.content && node.content.characters) || '' };
    } else if (wType === 'e-button') {
      settings.text = { $$type: 'string', value: (node.content && (node.content.characters || node.content.name)) || 'Button' };
      settings.link = { $$type: 'link', value: { url: node.link || '#', target: '_self' } };
    } else if (wType === 'e-image') {
      const imgRef = node.image || node.raster || node.svg;
      const fallbackUri = (imgRef && imgRef.dataUri) || (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '');
      const media = imgRef ? resolveMedia(imgRef.sha256, fallbackUri) : { id: 0, url: fallbackUri };
      const srcProp = buildV4ImageSrcProp(media) || {
        $$type: 'image-src',
        value: { id: null, url: { $$type: 'url', value: '' } },
      };
      settings.image = {
        $$type: 'image',
        value: {
          src: srcProp,
          size: { $$type: 'string', value: 'full' },
        },
      };
    } else if (wType === 'e-svg') {
      const svgRef = node.svg || node.image || node.raster;
      const fallbackUri = (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '') || (svgRef && svgRef.dataUri) || '';
      const media = svgRef ? resolveMedia(svgRef.sha256, fallbackUri) : { id: 0, url: fallbackUri };
      settings.svg = {
        $$type: 'svg-src',
        value: media && Number(media.id) > 0
          ? { id: { $$type: 'image-attachment-id', value: Number(media.id) }, url: null }
          : { id: null, url: { $$type: 'url', value: (media && media.url) || '' } },
      };
    }

    const variants = [buildV4Variant('desktop', node.layout, node.style, node.text, resolveMedia)];
    if (node.responsive && node.responsive.tablet) {
      variants.push(buildV4Variant('tablet', node.responsive.tablet, {}, node.responsive.tablet, resolveMedia));
    }
    if (node.responsive && node.responsive.mobile) {
      variants.push(buildV4Variant('mobile', node.responsive.mobile, {}, node.responsive.mobile, resolveMedia));
    }

    const children = [];
    for (const cid of node.children || []) {
      const builtChild = buildV4Node(cid);
      if (builtChild) children.push(builtChild);
    }

    return {
      id: shortId(node.id),
      elType: wType === 'e-flexbox' ? 'e-flexbox' : 'widget',
      widgetType: wType,
      isInner: false,
      settings,
      elements: children,
      styles: {
        [classId]: {
          id: classId,
          label: 'local',
          type: 'class',
          variants,
        },
      },
      editor_settings: [],
      version: '0.0',
    };
  };

  const content = (doc.roots || []).map((rid) => buildV4Node(rid)).filter(Boolean);
  return {
    title: doc.title || 'Figma Design (Elementor v4)',
    type: 'e-flexbox',
    version: '0.4',
    page_settings: [],
    content,
  };
}

function mapToV4WidgetType(nodeOrWidget) {
  const widget = typeof nodeOrWidget === 'string' ? nodeOrWidget : (nodeOrWidget && nodeOrWidget.widget);
  const node = typeof nodeOrWidget === 'object' ? nodeOrWidget : null;
  switch (widget) {
    case 'heading': return 'e-heading';
    case 'text-editor': return 'e-paragraph';
    case 'button': return 'e-button';
    case 'image':
    case 'theme-post-featured-image':
      return 'e-image';
    case 'theme-site-logo':
    case 'site-logo':
      return (node && node.svg && !node.raster && !node.image) ? 'e-svg' : 'e-image';
    case 'icon': return 'e-svg';
    default: return 'e-flexbox';
  }
}

function buildV4Variant(breakpoint, layout = {}, style = {}, text = {}, resolveMedia = null) {
  const props = {};
  if (layout.direction) {
    props['flex-direction'] = { $$type: 'string', value: layout.direction };
  }
  if (typeof layout.gap === 'number') {
    props.gap = { $$type: 'size', value: { size: layout.gap, unit: 'px', isLinked: true } };
  }
  if (layout.padding) {
    const pUnit = layout.padding.unit || 'px';
    props.padding = {
      $$type: 'dimensions',
      value: {
        'block-start': { $$type: 'size', value: { size: Number(layout.padding.top) || 0, unit: pUnit } },
        'inline-end': { $$type: 'size', value: { size: Number(layout.padding.right) || 0, unit: pUnit } },
        'block-end': { $$type: 'size', value: { size: Number(layout.padding.bottom) || 0, unit: pUnit } },
        'inline-start': { $$type: 'size', value: { size: Number(layout.padding.left) || 0, unit: pUnit } },
      },
    };
  }
  if (style.background || (style.backgroundImage && resolveMedia)) {
    const bgVal = {};
    if (style.background) {
      bgVal.color = { $$type: 'color', value: style.background };
    }
    if (style.backgroundImage && resolveMedia) {
      const bgMedia = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
      const bgSrc = buildV4ImageSrcProp(bgMedia);
      if (bgSrc) {
        bgVal['background-overlay'] = {
          $$type: 'background-overlay',
          value: [
            {
              $$type: 'background-image-overlay',
              value: {
                image: {
                  $$type: 'image',
                  value: {
                    src: bgSrc,
                    size: { $$type: 'string', value: 'full' },
                  },
                },
                size: { $$type: 'string', value: style.backgroundSize || 'cover' },
                position: { $$type: 'string', value: style.backgroundPosition || 'center center' },
                repeat: { $$type: 'string', value: style.backgroundRepeat || 'no-repeat' },
              },
            },
          ],
        };
      }
    }
    if (Object.keys(bgVal).length > 0) {
      props.background = { $$type: 'background', value: bgVal };
    }
  }
  if (text && text.color) {
    props.color = { $$type: 'color', value: text.color };
  }
  if (text && text.fontSize) {
    props['font-size'] = { $$type: 'size', value: { size: text.fontSize, unit: 'px' } };
  }
  if (text && text.fontFamily) {
    props['font-family'] = { $$type: 'string', value: text.fontFamily };
  }
  return {
    meta: { breakpoint, state: null },
    props,
  };
}

