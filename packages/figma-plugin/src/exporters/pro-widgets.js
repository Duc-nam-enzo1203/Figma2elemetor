/**
 * Elementor Pro Widget Builders (`form`, `nav-menu`, `call-to-action`, `price-table`, `flip-box`, `slides`, `loop-grid`).
 */
import { shortId } from '../utils/crypto.js';
import { boxValue, appendCustomCss, applyTypographySettings, collectSubtreeTexts, collectSubtreeImages, svgMarkupToDataUri } from './compiler-helpers.js';

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
    settings.row_gap = { unit: 'px', size: Math.max(0, Math.round(node.layout.gap)), sizes: [] };
    settings.column_gap = { unit: 'px', size: Math.max(0, Math.round(node.layout.gap)), sizes: [] };
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
    const rawBg = content.fieldStyle.background;
    const textHex = fieldTypo && fieldTypo.color ? String(fieldTypo.color).toUpperCase() : '';
    const sameAsText = Boolean(rawBg && textHex && String(rawBg).toUpperCase() === textHex);
    if (rawBg && !sameAsText) {
      settings.field_background_color = rawBg;
    } else if (content.fieldStyle.borderColor || content.fieldStyle.borderWidth) {
      settings.field_background_color = 'rgba(0,0,0,0)';
    } else {
      settings.field_background_color = '#FFFFFF';
    }
    if (content.fieldStyle.borderColor) settings.field_border_color = content.fieldStyle.borderColor;
    if (content.fieldStyle.borderWidth) settings.field_border_width = boxValue(content.fieldStyle.borderWidth);
    if (content.fieldStyle.radius) settings.field_border_radius = boxValue(content.fieldStyle.radius);
  }
  if (content.buttonTypography) {
    if (content.buttonTypography.color) settings.button_text_color = content.buttonTypography.color;
    applyTypographySettings(settings, 'button_typography', content.buttonTypography, node.responsive);
  }
  if (content.buttonStyle) {
    if (content.buttonStyle.background) {
      settings.button_background_color = content.buttonStyle.background;
    } else if (content.buttonStyle.gradient) {
      const g = content.buttonStyle.gradient;
      settings.button_background_color = g.color1;
      appendCustomCss(settings, `selector .elementor-button {\n  background: linear-gradient(${g.angle ?? 180}deg, ${g.color1} ${g.stop1 ?? 0}%, ${g.color2} ${g.stop2 ?? 100}%);\n}`);
    }
    if (content.buttonStyle.borderWidth && content.buttonStyle.borderColor) {
      settings.button_border_border = content.buttonStyle.borderStyle || 'solid';
      settings.button_border_width = boxValue(content.buttonStyle.borderWidth);
      settings.button_border_color = content.buttonStyle.borderColor;
    }
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

  const justifyAlignMap = { CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between', MIN: 'flex-start' };
  const settings = {
    layout: (node.layout && node.layout.direction === 'column') ? 'vertical' : 'horizontal',
    align_items: (node.layout && node.layout.justify && justifyAlignMap[node.layout.justify]) || 'center',
    pointer: 'underline',
    _f2e_menu_items: items,
  };

  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    const padKey = settings.layout === 'vertical' ? 'padding_vertical_menu_item' : 'padding_horizontal_menu_item';
    settings[padKey] = { unit: 'px', size: Math.round(node.layout.gap / 2), sizes: [] };
  }

  const navTypo = node.text || (textItems[0] && textItems[0].text) || null;
  if (navTypo) {
    applyTypographySettings(settings, 'typography', navTypo, node.responsive);
    if (navTypo.color) {
      settings.color_menu_item = navTypo.color;
    }
  }
  const distinctActive = textItems.find((t) => t.text && t.text.color && navTypo && t.text.color !== navTypo.color);
  if (distinctActive && distinctActive.text) {
    settings.color_menu_item_active = distinctActive.text.color;
    settings.color_menu_item_hover = distinctActive.text.color;
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
    if (textItems[0].text.align) settings.alignment = textItems[0].text.align;
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
  if (node.layout && node.layout.padding && (node.layout.padding.top || node.layout.padding.right || node.layout.padding.bottom || node.layout.padding.left)) {
    settings.padding_content = boxValue(node.layout.padding);
  }
  const ctaBtnNode = (node.children || []).map((cid) => nodes[cid]).find((c) => c && (c.widget === 'button' || /btn|button/i.test((c.content && c.content.name) || '')));
  if (ctaBtnNode && ctaBtnNode.style) {
    if (ctaBtnNode.style.background) settings.button_background_color = ctaBtnNode.style.background;
    if (ctaBtnNode.style.radius) settings.button_border_radius = boxValue(ctaBtnNode.style.radius);
    if (ctaBtnNode.style.borderColor) settings.button_border_color = ctaBtnNode.style.borderColor;
    if (ctaBtnNode.style.borderWidth) {
      const bw = Math.max(Number(ctaBtnNode.style.borderWidth.top) || 0, Number(ctaBtnNode.style.borderWidth.right) || 0, Number(ctaBtnNode.style.borderWidth.bottom) || 0, Number(ctaBtnNode.style.borderWidth.left) || 0);
      if (bw > 0) settings.button_border_width = { unit: 'px', size: bw, sizes: [] };
    }
  }
  if (node.layout && node.layout.height && Number(node.layout.height) >= 160) {
    settings.min_height = { unit: 'px', size: Math.round(Number(node.layout.height)), sizes: [] };
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

  let currencySymbol = 'dollar';
  if (priceText.includes('€')) currencySymbol = 'euro';
  else if (priceText.includes('£')) currencySymbol = 'pound';
  else if (priceText.includes('¥')) currencySymbol = 'yen';
  else if (priceText.includes('₫') || /vnd|đ/i.test(priceText)) currencySymbol = 'custom';

  const settings = {
    heading,
    sub_heading: (subHeadingNode && subHeadingNode.text.characters) || 'Monthly Plan',
    price: numericPrice,
    currency_symbol: currencySymbol,
    ...(currencySymbol === 'custom' ? { currency_symbol_custom: '₫' } : {}),
    period: 'Monthly',
    features_list: features,
    button_text: (btnNode && btnNode.text.characters) || 'Get Started',
  };

  if (headingNode && headingNode.text) {
    if (headingNode.text.color) settings.heading_color = headingNode.text.color;
    applyTypographySettings(settings, 'heading_typography', headingNode.text, node.responsive);
  }
  if (subHeadingNode && subHeadingNode.text) {
    if (subHeadingNode.text.color) settings.sub_heading_color = subHeadingNode.text.color;
    applyTypographySettings(settings, 'sub_heading_typography', subHeadingNode.text, node.responsive);
  }
  if (priceNode && priceNode.text) {
    if (priceNode.text.color) settings.price_color = priceNode.text.color;
    applyTypographySettings(settings, 'price_typography', priceNode.text, node.responsive);
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.features_color = textItems[2].text.color;
    applyTypographySettings(settings, 'features_typography', textItems[2].text, node.responsive);
  }
  if (btnNode && btnNode.text) {
    if (btnNode.text.color) settings.button_text_color = btnNode.text.color;
    applyTypographySettings(settings, 'button_typography', btnNode.text, node.responsive);
  }
  const priceBtnChild = (node.children || []).map((cid) => nodes[cid]).find((c) => c && (c.widget === 'button' || /btn|button/i.test((c.content && c.content.name) || '')));
  if (priceBtnChild && priceBtnChild.style) {
    if (priceBtnChild.style.background) settings.button_background_color = priceBtnChild.style.background;
    if (priceBtnChild.style.radius) settings.button_border_radius = boxValue(priceBtnChild.style.radius);
    if (priceBtnChild.style.borderColor) settings.button_border_color = priceBtnChild.style.borderColor;
    if (priceBtnChild.style.borderWidth) settings.button_border_width = boxValue(priceBtnChild.style.borderWidth);
  }
  if (node.style && node.style.background) {
    settings.pricing_element_bg_color = node.style.background;
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
    if (textItems[0].text.align) settings.alignment = textItems[0].text.align;
    if (textItems[0].text.color) settings.title_color_a = textItems[0].text.color;
    applyTypographySettings(settings, 'title_typography_a', textItems[0].text, node.responsive);
  }
  if (node.layout && node.layout.padding && (node.layout.padding.top || node.layout.padding.right || node.layout.padding.bottom || node.layout.padding.left)) {
    settings.padding_a = boxValue(node.layout.padding);
    settings.padding_b = boxValue(node.layout.padding);
  }
  if (textItems[1] && textItems[1].text) {
    if (textItems[1].text.color) settings.description_color_a = textItems[1].text.color;
    applyTypographySettings(settings, 'description_typography_a', textItems[1].text, node.responsive);
  }
  const titleTypoB = (textItems[2] && textItems[2].text) || (textItems[0] && textItems[0].text) || null;
  if (titleTypoB) {
    if (titleTypoB.color) settings.title_color_b = titleTypoB.color;
    applyTypographySettings(settings, 'title_typography_b', titleTypoB, node.responsive);
  }
  const descTypoB = (textItems[3] && textItems[3].text) || (textItems[1] && textItems[1].text) || null;
  if (descTypoB) {
    if (descTypoB.color) settings.description_color_b = descTypoB.color;
    applyTypographySettings(settings, 'description_typography_b', descTypoB, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.background_a_background = 'classic';
    settings.background_a_color = node.style.background;
    settings.background_b_background = 'classic';
    settings.background_b_color = node.style.background;
  }
  if (node.style && node.style.radius) {
    settings.border_radius = boxValue(node.style.radius);
  }
  if (node.layout && node.layout.height) {
    settings.height = { unit: 'px', size: Math.max(200, Math.round(Number(node.layout.height))), sizes: [] };
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
  const sliderNav = node.content && node.content.sliderNav;
  let navigation = 'both';
  if (sliderNav) {
    if (sliderNav.hasDots && sliderNav.hasArrows) navigation = 'both';
    else if (sliderNav.hasDots) navigation = 'dots';
    else if (sliderNav.hasArrows) navigation = 'arrows';
  }
  const slidesSettings = {
    slides,
    slides_height: { unit: 'px', size: Math.max(360, Number(node.layout && node.layout.height) || 500), sizes: [] },
    navigation,
  };
  if (sliderNav && sliderNav.dotsColor) slidesSettings.dots_color = sliderNav.dotsColor;
  if (sliderNav && sliderNav.arrowsColor) slidesSettings.arrows_color = sliderNav.arrowsColor;
  const firstSlideTexts = (extractedSlides[0] && Array.isArray(extractedSlides[0].texts))
    ? extractedSlides[0].texts.filter((t) => t && typeof t === 'object')
    : collectSubtreeTexts(node, nodes).map((t) => t.text).filter(Boolean);
  if (firstSlideTexts[0]) {
    if (firstSlideTexts[0].align) slidesSettings.text_align = firstSlideTexts[0].align;
    if (firstSlideTexts[0].color) slidesSettings.heading_color = firstSlideTexts[0].color;
    applyTypographySettings(slidesSettings, 'heading_typography', firstSlideTexts[0], node.responsive);
  }
  if (firstSlideTexts[1]) {
    if (firstSlideTexts[1].color) slidesSettings.description_color = firstSlideTexts[1].color;
    applyTypographySettings(slidesSettings, 'description_typography', firstSlideTexts[1], node.responsive);
  }
  if (firstSlideTexts[2]) {
    if (firstSlideTexts[2].color) slidesSettings.button_color = firstSlideTexts[2].color;
    applyTypographySettings(slidesSettings, 'button_typography', firstSlideTexts[2], node.responsive);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'slides',
    isInner: false,
    settings: slidesSettings,
    elements: [],
  };
}

export function buildProLoopGrid(node, allocId, wType = 'loop-grid') {
  const cols = Number(node.layout && node.layout.columns) || 3;
  const gapVal = Number(node.layout && node.layout.gap) || 24;
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings: {
      template_id: '',
      posts_per_page: 6,
      columns: String(cols),
      row_gap: { unit: 'px', size: gapVal, sizes: [] },
      column_gap: { unit: 'px', size: gapVal, sizes: [] },
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
    if (node.style && node.style.borderWidth && node.style.borderColor) {
      settings.image_border_border = node.style.borderStyle || 'solid';
      settings.image_border_width = boxValue(node.style.borderWidth);
      settings.image_border_color = node.style.borderColor;
    }
    if (node.style && node.style.boxShadow) {
      settings.image_box_shadow_box_shadow_type = 'yes';
      settings.image_box_shadow_box_shadow = node.style.boxShadow;
    }
  } else if (wType === 'blockquote') {
    settings.blockquote_content = texts[0] || (node.content && node.content.name) || '';
    settings.author_name = texts[1] || '';
    settings.tweet_button_Label = 'Tweet';
    if (firstTypo) {
      if (firstTypo.color) settings.content_text_color = firstTypo.color;
      applyTypographySettings(settings, 'content_typography', firstTypo, node.responsive);
    }
    if (textItems[1] && textItems[1].text) {
      if (textItems[1].text.color) settings.author_text_color = textItems[1].text.color;
      applyTypographySettings(settings, 'author_typography', textItems[1].text, node.responsive);
    }
    if (node.style && node.style.borderColor) {
      settings.border_color = node.style.borderColor;
    }
  } else if (wType === 'animated-headline') {
    settings.before_text = texts[0] || '';
    settings.highlighted_text = texts[1] || (node.content && node.content.name) || '';
    if (firstTypo) {
      if (firstTypo.color) settings.title_color = firstTypo.color;
      applyTypographySettings(settings, 'title_typography', firstTypo, node.responsive);
    }
  } else if (wType === 'taxonomy-filter') {
    if (firstTypo) {
      if (firstTypo.color) settings.normal_item_color = firstTypo.color;
      applyTypographySettings(settings, 'typography', firstTypo, node.responsive);
    }
    if (node.style && node.style.background) {
      settings.normal_item_background_color = node.style.background;
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

export function buildProPaymentButton(node, wType, allocId) {
  const text = node.text || {};
  const style = node.style || {};
  const layout = node.layout || {};
  const settings = {
    text: (node.content && node.content.characters) || text.characters || (node.content && node.content.name) || (wType === 'stripe-button' ? 'Pay with Stripe' : 'Buy Now'),
    align: text.align || 'center',
  };
  if (style.gradient) {
    settings.background_background = 'gradient';
    settings.background_gradient_type = style.gradient.type || 'linear';
    settings.background_color = style.gradient.color1;
    settings.background_color_b = style.gradient.color2;
  } else if (style.background) {
    settings.background_background = 'classic';
    settings.background_color = style.background;
  }
  if (text.color) settings.button_text_color = text.color;
  applyTypographySettings(settings, 'typography', text, node.responsive);
  if (style.radius) settings.border_radius = boxValue(style.radius);
  if (style.borderWidth && style.borderColor) {
    settings.border_border = style.borderStyle || 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
  }
  if (style.boxShadow) {
    settings.button_box_shadow_box_shadow_type = 'yes';
    settings.button_box_shadow_box_shadow = style.boxShadow;
  }
  if (layout.padding && (layout.padding.top || layout.padding.right || layout.padding.bottom || layout.padding.left)) {
    settings.text_padding = boxValue(layout.padding);
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

export function buildProProgressTracker(node, allocId) {
  const st = node.style || {};
  const settings = {
    type: 'horizontal',
    relative_to: 'entire_page',
  };
  if (st.background) settings.progress_color = st.background;
  if (st.borderColor) settings.progress_bg_color = st.borderColor;
  if (node.layout && node.layout.height && Number(node.layout.height) <= 40) {
    settings.tracker_height = { unit: 'px', size: Math.max(2, Math.round(Number(node.layout.height))), sizes: [] };
  }
  if (st.radius) settings.border_radius = boxValue(st.radius);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'progress-tracker',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProVideoPlaylist(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const firstTypo = textItems[0] && textItems[0].text ? textItems[0].text : node.text;
  const tabs = [];
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const cTexts = collectSubtreeTexts(child, nodes);
    tabs.push({
      _id: shortId(cid),
      title: (cTexts[0] && cTexts[0].text && cTexts[0].text.characters) || (child.content && child.content.name) || `Video ${tabs.length + 1}`,
      youtube_url: child.link || 'https://www.youtube.com/watch?v=XHOmBV4js_E',
    });
  }
  const settings = {
    playlist_title: (node.content && node.content.name) || 'Video Playlist',
    tabs,
  };
  if (firstTypo) {
    if (firstTypo.color) settings.normal_color = firstTypo.color;
    applyTypographySettings(settings, 'normal_typography', firstTypo, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.normal_background = node.style.background;
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'video-playlist',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProOffCanvas(node, nodes, allocId, buildElement) {
  const children = [];
  for (const cid of node.children || []) {
    const el = buildElement ? buildElement(cid, false, node) : null;
    if (el) children.push(el);
  }
  const st = node.style || {};
  const settings = {
    off_canvas_name: (node.content && node.content.name) || 'Off-Canvas',
  };
  if (node.layout && node.layout.width) {
    settings.width = { unit: 'px', size: Math.round(Number(node.layout.width)), sizes: [] };
  }
  if (st.background) {
    settings.background_background = 'classic';
    settings.background_color = st.background;
  }
  if (st.radius) settings.border_radius = boxValue(st.radius);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'off-canvas',
    isInner: false,
    settings,
    elements: children,
  };
}

export function buildProCountdown(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const numNode = textItems.find((t) => /\d/.test((t.text && t.text.characters) || '')) || textItems[0] || null;
  const lblNode = textItems.find((t) => t !== numNode) || null;
  const settings = {
    countdown_type: 'due_date',
    due_date: '2027-12-31 23:59',
    show_days: 'yes',
    show_hours: 'yes',
    show_minutes: 'yes',
    show_seconds: 'yes',
  };
  if (numNode && numNode.text) {
    if (numNode.text.color) settings.digits_color = numNode.text.color;
    applyTypographySettings(settings, 'digits_typography', numNode.text, node.responsive);
  }
  if (lblNode && lblNode.text) {
    if (lblNode.text.color) settings.label_color = lblNode.text.color;
    applyTypographySettings(settings, 'label_typography', lblNode.text, node.responsive);
  }
  if (node.style && node.style.background) settings.box_background_color = node.style.background;
  if (node.style && node.style.radius) settings.box_border_radius = boxValue(node.style.radius);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'countdown',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProShareButtons(node, nodes, allocId) {
  const platforms = ['facebook', 'twitter', 'linkedin', 'pinterest', 'reddit', 'whatsapp', 'telegram', 'email'];
  const shareButtons = [];
  const extracted = (node.content && Array.isArray(node.content.socialItems)) ? node.content.socialItems : [];
  const sourceList = extracted.length > 0
    ? extracted
    : (node.children || []).map((cid) => nodes[cid]).filter(Boolean).map((c) => ({ id: c.id, name: (c.content && c.content.name) || 'facebook' }));
  for (const item of sourceList) {
    const nm = String(item.name || '').toLowerCase();
    const matched = platforms.find((p) => nm.includes(p)) || 'facebook';
    shareButtons.push({ _id: shortId(item.id || matched), button: matched });
  }
  const settings = {
    share_buttons: shareButtons.length > 0 ? shareButtons : [{ _id: shortId('sb1'), button: 'facebook' }],
    view: 'icon-text',
  };
  const styled = extracted.find((s) => s.background);
  if (styled && styled.background) {
    settings.color_source = 'custom';
    settings.primary_color = styled.background;
    settings.secondary_color = '#FFFFFF';
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'share-buttons',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildProPriceList(node, nodes, allocId) {
  const priceList = [];
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const cTexts = collectSubtreeTexts(child, nodes).map((t) => t.text).filter(Boolean);
    const priceT = cTexts.find((t) => /[$€£₫¥]|\d/.test(t.characters || '')) || null;
    const titleT = cTexts.find((t) => t !== priceT) || cTexts[0] || null;
    const descT = cTexts.find((t) => t !== priceT && t !== titleT) || null;
    priceList.push({
      _id: shortId(cid),
      title: (titleT && titleT.characters) || (child.content && child.content.name) || 'Item',
      price: (priceT && priceT.characters) || '$19',
      item_description: (descT && descT.characters) || '',
    });
  }
  const allTexts = collectSubtreeTexts(node, nodes).map((t) => t.text).filter(Boolean);
  const priceTextSample = allTexts.find((t) => /[$€£₫¥]|\d/.test(t.characters || '')) || null;
  const settings = { price_list: priceList };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.row_space = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (allTexts[0]) {
    if (allTexts[0].color) settings.heading_color = allTexts[0].color;
    applyTypographySettings(settings, 'heading_typography', allTexts[0], node.responsive);
  }
  if (priceTextSample) {
    if (priceTextSample.color) settings.price_color = priceTextSample.color;
    applyTypographySettings(settings, 'price_typography', priceTextSample, node.responsive);
  }
  if (allTexts[1]) {
    if (allTexts[1].color) settings.description_color = allTexts[1].color;
    applyTypographySettings(settings, 'description_typography', allTexts[1], node.responsive);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'price-list',
    isInner: false,
    settings,
    elements: [],
  };
}

