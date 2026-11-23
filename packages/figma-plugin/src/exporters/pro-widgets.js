/**
 * Elementor Pro Widget Builders (`form`, `nav-menu`, `call-to-action`, `price-table`, `flip-box`, `slides`, `loop-grid`).
 */
import { shortId } from '../utils/crypto.js';
import { boxValue, applyTypographySettings, collectSubtreeTexts, collectSubtreeImages, svgMarkupToDataUri } from './compiler-helpers.js';

export function buildProForm(node, nodes, allocId) {
  const formFields = [];
  const content = node.content || {};
  let submitLabel = content.submitLabel || 'Send Message';

  if (Array.isArray(content.formFields) && content.formFields.length > 0) {
    for (const [idx, f] of content.formFields.entries()) {
      const fieldEntry = {
        _id: shortId(`${node.id}-fld-${idx}`),
        custom_id: `field_${idx + 1}`,
        field_type: f.type || 'text',
        field_label: f.label,
        placeholder: f.placeholder || f.label,
        required: f.required ? 'true' : '',
        width: f.width || '100',
      };
      if (f.type === 'select') {
        fieldEntry.field_options = f.options || `${f.placeholder || f.label}\nOption 1\nOption 2\nOption 3`;
      }
      formFields.push(fieldEntry);
    }
  } else {
    let idx = 1;
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      if (child.widget === 'button') {
        submitLabel = (child.content && (child.content.characters || child.content.name)) || submitLabel;
        continue;
      }
      const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters);
      const label = texts[0] || (child.content && child.content.name) || `Field ${idx}`;
      const lower = label.toLowerCase();
      let fieldType = 'text';
      if (lower.includes('email') || lower.includes('mail')) fieldType = 'email';
      else if (lower.includes('phone') || lower.includes('tel') || lower.includes('số điện thoại')) fieldType = 'tel';
      else if (lower.includes('message') || lower.includes('comment') || lower.includes('nội dung') || (Number(child.layout && child.layout.height) || 0) >= 90) fieldType = 'textarea';

      formFields.push({
        _id: shortId(cid),
        custom_id: `field_${idx}`,
        field_type: fieldType,
        field_label: label,
        placeholder: texts[1] || label,
        required: lower.includes('email') || lower.includes('name') ? 'true' : '',
        width: '100',
      });
      idx += 1;
    }
  }

  if (formFields.length === 0) {
    formFields.push(
      { _id: shortId('f1'), custom_id: 'name', field_type: 'text', field_label: 'Name', placeholder: 'Your Name', width: '100' },
      { _id: shortId('f2'), custom_id: 'email', field_type: 'email', field_label: 'Email', placeholder: 'your@email.com', required: 'true', width: '100' }
    );
  }

  const hasRequired = formFields.some((f) => f.required === 'true');
  const settings = {
    form_name: content.name || 'Figma Form',
    form_fields: formFields,
    button_text: submitLabel,
    button_size: 'md',
    show_labels: content.hasExternalLabels ? 'yes' : '',
    ...(hasRequired ? { mark_required: 'yes' } : {}),
  };

  if (node.layout && typeof node.layout.gap === 'number') {
    settings.row_gap = { unit: 'px', size: node.layout.gap, sizes: [] };
  }
  const isAsteriskRed = (hex) => {
    const c = String(hex || '').toUpperCase();
    return c === '#FF0000' || c === '#EF4444' || c === '#DC2626';
  };
  if (content.labelTypography) {
    if (content.labelTypography.color && !isAsteriskRed(content.labelTypography.color)) {
      settings.label_color = content.labelTypography.color;
    }
    applyTypographySettings(settings, 'label_typography', content.labelTypography, node.responsive);
  }
  const fieldTypo = content.fieldTypography || node.text || null;
  if (fieldTypo) {
    if (fieldTypo.color && !isAsteriskRed(fieldTypo.color)) {
      settings.field_text_color = fieldTypo.color;
    }
    applyTypographySettings(settings, 'field_typography', fieldTypo, node.responsive);
  }
  if (content.fieldStyle) {
    settings.field_background_color = content.fieldStyle.background || '#FFFFFF';
    if (content.fieldStyle.borderColor) settings.field_border_color = content.fieldStyle.borderColor;
    if (content.fieldStyle.borderWidth) settings.field_border_width = boxValue(content.fieldStyle.borderWidth);
    if (content.fieldStyle.radius) settings.field_border_radius = boxValue(content.fieldStyle.radius);
  }
  if (content.buttonTypography) {
    if (content.buttonTypography.color) settings.button_text_color = content.buttonTypography.color;
    applyTypographySettings(settings, 'button_typography', content.buttonTypography, node.responsive);
  }
  if (content.buttonStyle) {
    if (content.buttonStyle.background) settings.button_background_color = content.buttonStyle.background;
    else if (content.buttonStyle.gradient) settings.button_background_color = content.buttonStyle.gradient.color1;
    if (content.buttonStyle.radius) settings.button_border_radius = boxValue(content.buttonStyle.radius);
  }
  if (content.buttonPadding) {
    settings.button_text_padding = boxValue(content.buttonPadding);
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'form',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProNavMenu(node, nodes, allocId) {
  const menuItems = (node.content && node.content.menuItems) || [];
  const textItems = collectSubtreeTexts(node, nodes);
  let items = menuItems.map((m) => (typeof m === 'string' ? m : m.name));
  if (items.length === 0) {
    items = textItems.map((t) => t.text.characters);
  }
  if (items.length === 0) {
    items = ['Trang chủ', 'Dịch vụ', 'Giới thiệu', 'Liên hệ'];
  }

  const settings = {
    layout: (node.layout && node.layout.direction === 'column') ? 'vertical' : 'horizontal',
    align_items: 'center',
    pointer: 'underline',
    _f2e_menu_items: items,
  };

  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.padding_horizontal_menu_item = { unit: 'px', size: Math.round(node.layout.gap / 2), sizes: [] };
  }

  const navTypo = node.text || (textItems[0] && textItems[0].text) || null;
  if (navTypo) {
    applyTypographySettings(settings, 'typography', navTypo, node.responsive);
    if (navTypo.color) {
      settings.color_menu_item = navTypo.color;
    }
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'nav-menu',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProCta(node, nodes, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  const settings = {
    skin: 'classic',
    title: texts[0] || (node.content && node.content.name) || 'Call to Action',
    description: texts[1] || '',
    button: (node.content && node.content.ctaButtonText) || texts[2] || 'Learn More',
    bg_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
  };

  if (textItems[0] && textItems[0].text) {
    if (textItems[0].text.color) settings.title_color = textItems[0].text.color;
    applyTypographySettings(settings, 'title_typography', textItems[0].text, node.responsive);
  }
  if (textItems[1] && textItems[1].text) {
    if (textItems[1].text.color) settings.description_color = textItems[1].text.color;
    applyTypographySettings(settings, 'description_typography', textItems[1].text, node.responsive);
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.button_text_color = textItems[2].text.color;
    applyTypographySettings(settings, 'button_typography', textItems[2].text, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.content_bg_color = node.style.background;
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'call-to-action',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProPriceTable(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const priceNode = textItems.find((t) => /[$€£₫¥]|\d+\s*\/\s*(mo|yr|tháng|năm)/i.test(t.text.characters) || /^\$?\d+$/.test(t.text.characters.trim()));
  const priceText = (priceNode && priceNode.text.characters) || '49';
  const numericPrice = priceText.replace(/[^0-9.]/g, '') || '49';
  const headingNode = textItems[0] || null;
  const heading = (headingNode && headingNode.text.characters) || (node.content && node.content.name) || 'Pro Plan';
  const subHeadingNode = (textItems[1] && textItems[1] !== priceNode) ? textItems[1] : null;
  const btnNode = textItems.length > 2 ? textItems[textItems.length - 1] : null;
  const excludeSet = new Set([headingNode, subHeadingNode, priceNode, btnNode].filter(Boolean));
  const featureTexts = textItems
    .filter((t) => !excludeSet.has(t))
    .map((t) => t.text.characters)
    .filter(Boolean);
  const features = featureTexts.map((ft, idx) => ({
    _id: shortId(`feat-${idx}`),
    item_text: ft,
    selected_icon: { value: 'fas fa-check', library: 'fa-solid' },
  }));

  const settings = {
    heading,
    sub_heading: (subHeadingNode && subHeadingNode.text.characters) || 'Monthly Plan',
    price: numericPrice,
    currency_symbol: 'dollar',
    period: 'Monthly',
    features_list: features,
    button_text: (btnNode && btnNode.text.characters) || 'Get Started',
  };

  if (headingNode && headingNode.text) {
    if (headingNode.text.color) settings.heading_color = headingNode.text.color;
    applyTypographySettings(settings, 'heading_typography', headingNode.text, node.responsive);
  }
  if (priceNode && priceNode.text) {
    if (priceNode.text.color) settings.price_color = priceNode.text.color;
    applyTypographySettings(settings, 'price_typography', priceNode.text, node.responsive);
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.features_color = textItems[2].text.color;
    applyTypographySettings(settings, 'features_typography', textItems[2].text, node.responsive);
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'price-table',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProFlipBox(node, nodes, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  const settings = {
    title_text_a: texts[0] || (node.content && node.content.name) || 'Front Title',
    description_text_a: texts[1] || '',
    title_text_b: texts[2] || texts[0] || 'Back Title',
    description_text_b: texts[3] || texts[1] || '',
    button_text: texts[4] || 'Read More',
  };
  if (textItems[0] && textItems[0].text) {
    if (textItems[0].text.color) settings.title_color_a = textItems[0].text.color;
    applyTypographySettings(settings, 'title_typography_a', textItems[0].text, node.responsive);
  }
  if (textItems[1] && textItems[1].text) {
    if (textItems[1].text.color) settings.description_color_a = textItems[1].text.color;
    applyTypographySettings(settings, 'description_typography_a', textItems[1].text, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.background_a_background = 'classic';
    settings.background_a_color = node.style.background;
  }
  if (imgs[0] && resolveMedia) {
    const mediaA = resolveMedia(imgs[0].sha256, imgs[0].dataUri);
    if (mediaA && mediaA.url) {
      settings.background_a_background = 'classic';
      settings.background_a_image = mediaA;
    }
  }
  if (imgs[1] && resolveMedia) {
    const mediaB = resolveMedia(imgs[1].sha256, imgs[1].dataUri);
    if (mediaB && mediaB.url) {
      settings.background_b_background = 'classic';
      settings.background_b_image = mediaB;
    }
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'flip-box',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProSlides(node, nodes, allocId, resolveMedia) {
  const slides = [];
  const extractedSlides = (node.content && Array.isArray(node.content.slides)) ? node.content.slides : [];
  if (extractedSlides.length > 0) {
    for (let i = 0; i < extractedSlides.length; i += 1) {
      const sl = extractedSlides[i];
      const texts = (sl.texts || []).map((t) => (typeof t === 'string' ? t : t.characters)).filter(Boolean);
      const media = sl.image && resolveMedia ? resolveMedia(sl.image.sha256, sl.image.dataUri) : { id: '', url: '' };
      slides.push({
        _id: shortId(sl.id || `${node.id}-slide-${i}`),
        heading: texts[0] || sl.name || `Slide ${i + 1}`,
        description: texts[1] || '',
        button_text: texts[2] || 'Click Here',
        background_color: sl.background || '#1E293B',
        background_image: media,
      });
    }
  } else {
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters);
      const imgs = collectSubtreeImages(child, nodes);
      const media = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' };
      slides.push({
        _id: shortId(cid),
        heading: texts[0] || (child.content && child.content.name) || 'Slide Heading',
        description: texts[1] || '',
        button_text: texts[2] || 'Click Here',
        background_color: (child.style && child.style.background) || '#1E293B',
        background_image: media,
      });
    }
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'slides',
    isInner: false,
    settings: {
      slides,
      slides_height: { unit: 'px', size: Math.max(360, Number(node.layout && node.layout.height) || 500), sizes: [] },
    },
    elements: [],
  };
}

export function buildProLoopGrid(node, allocId, wType = 'loop-grid') {
  const cols = Number(node.layout && node.layout.columns) || 3;
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings: {
      template_id: '',
      posts_per_page: 6,
      columns: String(cols),
      row_gap: { unit: 'px', size: Number(node.layout && node.layout.gap) || 24, sizes: [] },
    },
    elements: [],
  };
}

export function buildGenericProWidget(node, nodes, wType, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const firstTypo = node.text || (textItems[0] && textItems[0].text) || null;
  const settings = {};
  if (wType === 'theme-post-featured-image') {
    const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
    const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '');
    const media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
    settings.image = media;
    settings.image_size = 'full';
    if (node.layout && node.layout.width) {
      settings.width = { unit: 'px', size: Math.round(Number(node.layout.width)), sizes: [] };
    }
    if (node.style && node.style.radius) {
      settings.image_border_radius = boxValue(node.style.radius);
    }
  } else if (wType === 'blockquote') {
    settings.blockquote_content = texts[0] || (node.content && node.content.name) || '';
    settings.author_name = texts[1] || '';
    settings.tweet_button_Label = 'Tweet';
    if (firstTypo) {
      if (firstTypo.color) settings.content_text_color = firstTypo.color;
      applyTypographySettings(settings, 'content_typography', firstTypo, node.responsive);
    }
  } else if (wType === 'animated-headline') {
    settings.before_text = texts[0] || '';
    settings.highlighted_text = texts[1] || (node.content && node.content.name) || '';
    if (firstTypo) {
      if (firstTypo.color) settings.title_color = firstTypo.color;
      applyTypographySettings(settings, 'title_typography', firstTypo, node.responsive);
    }
  } else if (firstTypo) {
    if (firstTypo.color) settings.title_color = firstTypo.color;
    applyTypographySettings(settings, 'typography', firstTypo, node.responsive);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings,
    elements: [],
  };
}

