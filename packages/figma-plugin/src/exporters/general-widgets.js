/**
 * General Elementor Free Widget Builders (`icon-box`, `image-box`, `icon-list`, `progress`, `alert`, `image-gallery`, `image-carousel`, `testimonial`, `star-rating`, `social-icons`, `counter`).
 */
import { shortId } from '../utils/crypto.js';
import { boxValue, applyGlobalColor, appendCustomCss, applyTextShadowAndEffects, applyTypographySettings, getTextGradientCss, buildTextClipRule, collectSubtreeTexts, collectSubtreeImages, svgMarkupToDataUri } from './compiler-helpers.js';

export function buildBoxWidget(node, nodes, wType, allocId, resolveMedia) {
  const content = node.content || {};
  let title = content.title_text || '';
  let desc = content.description_text || '';
  const texts = collectSubtreeTexts(node, nodes);
  const titleNode = texts[0];
  const descNode = texts[1];

  const titleTypo = content.titleTypography || (titleNode && titleNode.text) || node.text || null;
  const descTypo = content.descriptionTypography || (descNode && descNode.text) || null;

  if (!title) {
    title = (titleTypo && titleTypo.characters) || content.name || 'Feature Title';
    desc = (descTypo && descTypo.characters) || '';
  }

  const pos = content.position || ((node.layout && node.layout.direction === 'row') ? 'left' : 'top');
  const settings = { title_text: title, description_text: desc, position: pos };

  if (node.link) settings.link = { url: node.link, is_external: '', nofollow: '' };
  if (desc) {
    const titleGap = (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) ? Math.min(24, Math.round(node.layout.gap)) : 8;
    settings.title_bottom_space = { unit: 'px', size: titleGap, sizes: [] };
  }
  if (titleTypo && titleTypo.align) settings.text_align = titleTypo.align === 'justified' ? 'justify' : titleTypo.align;

  const titleGrad = getTextGradientCss(titleTypo);
  const titleColor = (titleTypo && (titleTypo.color || (titleTypo.gradient && titleTypo.gradient.color2))) || null;
  if (titleColor) {
    settings.title_color = titleColor;
    if (!titleGrad) applyGlobalColor(settings, 'title_color', titleColor);
  }
  if (titleTypo) {
    applyTypographySettings(settings, 'title_typography', titleTypo, node.responsive);
    applyTextShadowAndEffects(settings, titleTypo, 'selector .elementor-icon-box-title, selector .elementor-image-box-title');
  }
  if (titleGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-box-title, selector .elementor-image-box-title', titleGrad));

  const descGrad = getTextGradientCss(descTypo);
  const descColor = (descTypo && (descTypo.color || (descTypo.gradient && descTypo.gradient.color2))) || null;
  if (descColor) {
    settings.description_color = descColor;
    if (!descGrad) applyGlobalColor(settings, 'description_color', descColor);
  }
  if (descTypo) {
    applyTypographySettings(settings, 'description_typography', descTypo, node.responsive);
    applyTextShadowAndEffects(settings, descTypo, 'selector .elementor-icon-box-description, selector .elementor-image-box-description');
  }
  if (descGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-box-description, selector .elementor-image-box-description', descGrad));

  const sha = (node.raster && node.raster.sha256) || (node.image && node.image.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.raster && node.raster.dataUri) || (node.image && node.image.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: 0, url: fallback };

  const isRasterAsset = Boolean(
    node.raster || node.image || (media && media.url && /^data:image\/(png|jpeg|jpg|webp|gif)|(\.(png|jpe?g|webp|gif)(\?|$))/i.test(media.url))
  );
  const isSvgAsset = Boolean(node.svg) && !isRasterAsset;

  let finalWidgetType = wType;
  if (wType === 'icon-box' && (isRasterAsset || (!isSvgAsset && media && media.url))) {
    finalWidgetType = 'image-box';
  }

  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    const spaceKey = finalWidgetType === 'image-box' ? 'image_space' : 'icon_space';
    settings[spaceKey] = { unit: 'px', size: node.layout.gap, sizes: [] };
  }

  if (finalWidgetType === 'image-box') {
    const imgs = collectSubtreeImages(node, nodes);
    if (media && media.url) settings.image = { id: media.id || '', url: media.url };
    else if (node.svg && node.svg.markup) settings.image = { id: '', url: svgMarkupToDataUri(node.svg.markup) };
    else settings.image = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' };
    settings.thumbnail_size = 'full';
    const imgRadius = (imgs[0] && imgs[0].radius) || (node.image && node.image.radius) || (node.raster && node.raster.radius);
    if (imgRadius) settings.image_border_radius = boxValue(imgRadius);
  } else {
    if (isSvgAsset && media && Number(media.id) > 0 && media.url) {
      settings.selected_icon = { value: { id: Number(media.id), url: media.url }, library: 'svg' };
    } else if (node.svg && node.svg.markup) {
      settings.selected_icon = { value: node.svg.markup, library: 'svg' };
    } else {
      settings.selected_icon = { value: 'fas fa-bolt', library: 'fa-solid' };
    }
    settings.primary_color = content.iconColor || (node.svg && node.svg.color) || '#2563EB';
    if (content.iconSize && Number(content.iconSize) > 0) {
      settings.icon_size = { unit: 'px', size: Number(content.iconSize), sizes: [] };
    }
  }

  return { id: allocId(node.id), elType: 'widget', widgetType: finalWidgetType, isInner: false, settings, elements: [] };
}

function inferIconListFaIcon(textStr, iconSize) {
  const s = String(textStr || '').toLowerCase();
  if (s.includes('@') && /\S+@\S+\.\S+/.test(s)) return 'fas fa-envelope';
  if (/(?:\+84|hotline|tel:|phone|\b0\d[\d\s.-]{7,})/.test(s)) return 'fas fa-phone-alt';
  if (/(?:hà nội|tp\.?\s*hcm|hồ chí minh|đà nẵng|phường|quận|đường|tầng|số\s+\d+|địa chỉ|street|address)/.test(s)) return 'fas fa-map-marker-alt';
  if (/(?:https?:\/\/|www\.)/.test(s)) return 'fas fa-globe';
  if (/(?:24\/7|giờ làm|thứ\s+[2-7])/.test(s)) return 'fas fa-clock';
  return iconSize >= 14 ? 'fas fa-check-circle' : 'fas fa-circle';
}

export function buildIconList(node, nodes, allocId) {
  const items = (node.content && node.content.iconList) || [];
  const texts = collectSubtreeTexts(node, nodes);
  const iconSize = (node.content && node.content.iconSize && Number(node.content.iconSize) > 0) ? Math.round(Number(node.content.iconSize)) : 6;
  let listData = [];
  if (items.length > 0) {
    listData = items.map((it, idx) => ({
      _id: shortId(`il-${idx}`),
      text: it.text,
      selected_icon: { value: inferIconListFaIcon(it.text, iconSize), library: 'fa-solid' },
      ...(it.link ? { link: { url: it.link } } : {}),
    }));
  } else {
    const validTexts = texts.filter((t) => t.text && t.text.characters && t.text.characters.trim().length > 1);
    listData = validTexts.map((t, idx) => {
      const cleanTxt = t.text.characters.replace(/^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]\s*/, '');
      return {
        _id: shortId(`il-${idx}`),
        text: cleanTxt,
        selected_icon: { value: inferIconListFaIcon(cleanTxt, iconSize), library: 'fa-solid' },
      };
    });
  }

  const firstTypo = node.text || (texts[0] && texts[0].text) || null;
  const isRow = (node.layout && node.layout.direction === 'row') || (Number(node.layout && node.layout.width) || 0) > 600;
  const gap = (node.layout && typeof node.layout.gap === 'number' && node.layout.gap >= 0) ? Math.round(node.layout.gap) : 16;
  const textColor = (firstTypo && (firstTypo.color || (firstTypo.gradient && firstTypo.gradient.color2))) || '#FFFFFF';
  const iconColor = (node.content && node.content.iconColor) || textColor;

  const settings = {
    icon_list: listData,
    view: isRow ? 'inline' : 'traditional',
    space_between: { unit: 'px', size: gap, sizes: [] },
    icon_size: { unit: 'px', size: iconSize, sizes: [] },
    text_indent: { unit: 'px', size: Math.max(6, Math.min(16, Math.round(iconSize * 0.5 + 4))), sizes: [] },
    icon_color: iconColor,
    text_color: textColor,
  };
  if (firstTypo && firstTypo.align && /^(left|center|right)$/i.test(firstTypo.align)) {
    settings.icon_align = firstTypo.align.toLowerCase();
  }
  if (textColor) applyGlobalColor(settings, 'text_color', textColor);
  if (iconColor) applyGlobalColor(settings, 'icon_color', iconColor);

  if (firstTypo) {
    applyTypographySettings(settings, 'icon_typography', firstTypo, node.responsive);
    applyTextShadowAndEffects(settings, firstTypo, 'selector .elementor-icon-list-text');
    if (firstTypo.fontSize) settings.typography_font_size = { unit: 'px', size: firstTypo.fontSize, sizes: [] };
    const listGrad = getTextGradientCss(firstTypo);
    if (listGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-list-text', listGrad));
  }

  return { id: allocId(node.id), elType: 'widget', widgetType: 'icon-list', isInner: false, settings, elements: [] };
}

export function buildProgress(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const titleTypo = (texts[0] && texts[0].text) || node.text || null;
  const pctNode = texts.find((t) => /%/.test((t.text && t.text.characters) || ''));
  const pctVal = pctNode ? (parseInt(pctNode.text.characters.replace(/[^0-9]/g, ''), 10) || 85) : 85;
  const settings = {
    title: (titleTypo && titleTypo.characters) || (node.content && node.content.name) || 'Skill',
    percent: { unit: '%', size: Math.min(100, Math.max(0, pctVal)), sizes: [] },
  };
  if (titleTypo) {
    if (titleTypo.color) settings.title_color = titleTypo.color;
    applyTypographySettings(settings, 'typography', titleTypo, node.responsive);
    applyTextShadowAndEffects(settings, titleTypo, 'selector .elementor-title');
    const progGrad = getTextGradientCss(titleTypo);
    if (progGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-title', progGrad));
  }
  if (pctNode && pctNode.text) {
    if (pctNode.text.color) settings.bar_inline_color = pctNode.text.color;
    applyTypographySettings(settings, 'bar_inner_typography', pctNode.text, node.responsive);
  }
  if (node.style && node.style.background) settings.bar_color = node.style.background;
  if (node.style && node.style.borderColor) settings.bar_bg_color = node.style.borderColor;
  if (node.style && node.style.radius) settings.border_radius = boxValue(node.style.radius);
  if (node.layout && node.layout.height && Number(node.layout.height) <= 48) {
    settings.bar_height = { unit: 'px', size: Math.max(4, Math.round(Number(node.layout.height))), sizes: [] };
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'progress', isInner: false, settings, elements: [] };
}

export function buildAlert(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const titleTypo = (texts[0] && texts[0].text) || node.text || null;
  const descTypo = (texts[1] && texts[1].text) || null;
  const settings = {
    alert_title: (titleTypo && titleTypo.characters) || (node.content && node.content.name) || 'Notice',
    alert_description: (descTypo && descTypo.characters) || '',
  };
  if (titleTypo) {
    if (titleTypo.color) settings.title_color = titleTypo.color;
    applyTypographySettings(settings, 'typography_title', titleTypo, node.responsive);
    applyTextShadowAndEffects(settings, titleTypo, 'selector .elementor-alert-title');
    const aTitleGrad = getTextGradientCss(titleTypo);
    if (aTitleGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-alert-title', aTitleGrad));
  }
  if (descTypo) {
    if (descTypo.color) settings.description_color = descTypo.color;
    applyTypographySettings(settings, 'typography_description', descTypo, node.responsive);
    applyTextShadowAndEffects(settings, descTypo, 'selector .elementor-alert-description');
  }
  if (node.style && node.style.background) settings.background_color = node.style.background;
  if (node.style && node.style.borderColor) settings.border_color = node.style.borderColor;
  if (node.style && node.style.borderWidth && Number(node.style.borderWidth.left) > 0) {
    settings.border_left_width = { unit: 'px', size: Math.round(Number(node.style.borderWidth.left)), sizes: [] };
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'alert', isInner: false, settings, elements: [] };
}

export function buildGalleryOrCarousel(node, nodes, wType, allocId, resolveMedia) {
  const imgs = collectSubtreeImages(node, nodes)
    .map((img) => resolveMedia(img.sha256, img.dataUri))
    .filter((m) => m && (m.url || m.id));
  const isCarousel = wType.includes('carousel');
  const cols = String(Math.max(1, Math.min(6, Number(node.layout && node.layout.columns) || Math.min(3, imgs.length || 3))));
  const settings = isCarousel
    ? { carousel: imgs, slides_to_show: cols, navigation: 'both' }
    : { wp_gallery: imgs, gallery_columns: cols, open_lightbox: 'yes' };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.image_spacing = 'custom';
    settings.image_spacing_custom = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (node.style && node.style.radius) settings.image_border_radius = boxValue(node.style.radius);
  if (node.style && node.style.borderWidth && node.style.borderColor) {
    settings.image_border_border = node.style.borderStyle || 'solid';
    settings.image_border_width = boxValue(node.style.borderWidth);
    settings.image_border_color = node.style.borderColor;
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: isCarousel ? 'image-carousel' : 'image-gallery', isInner: false, settings, elements: [] };
}

export function buildTestimonial(node, nodes, allocId, resolveMedia) {
  let textItems = collectSubtreeTexts(node, nodes);
  let imgs = collectSubtreeImages(node, nodes);
  const slides = (node.content && Array.isArray(node.content.slides)) ? node.content.slides : [];
  if (textItems.length === 0 && slides.length > 0 && Array.isArray(slides[0].texts)) {
    textItems = slides[0].texts.map((t, idx) => ({ id: `${node.id}-sl-txt-${idx}`, text: t }));
  }
  if (imgs.length === 0 && slides.length > 0 && slides[0].image) {
    imgs = [slides[0].image];
  }
  const sortedNodes = [...textItems].sort((a, b) => ((b.text && b.text.characters) || '').length - ((a.text && a.text.characters) || '').length);

  const contentNode = sortedNodes[0] || null;
  const nameNode = sortedNodes[1] || null;
  const jobNode = sortedNodes[2] || null;

  const settings = {
    testimonial_content: (contentNode && contentNode.text && contentNode.text.characters) || 'Great experience working with this team.',
    testimonial_name: (nameNode && nameNode.text && nameNode.text.characters) || (node.content && node.content.name) || 'Client Name',
    testimonial_job: (jobNode && jobNode.text && jobNode.text.characters) || 'Customer',
    testimonial_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
  };

  if (contentNode && contentNode.text) {
    if (contentNode.text.align) settings.testimonial_alignment = contentNode.text.align === 'justified' ? 'left' : contentNode.text.align;
    if (contentNode.text.color) settings.content_content_color = contentNode.text.color;
    applyTypographySettings(settings, 'content_typography', contentNode.text, node.responsive);
    applyTextShadowAndEffects(settings, contentNode.text, 'selector .elementor-testimonial-content');
  }
  if (nameNode && nameNode.text) {
    if (nameNode.text.color) settings.name_text_color = nameNode.text.color;
    applyTypographySettings(settings, 'name_typography', nameNode.text, node.responsive);
    applyTextShadowAndEffects(settings, nameNode.text, 'selector .elementor-testimonial-name');
  }
  if (jobNode && jobNode.text) {
    if (jobNode.text.color) settings.job_text_color = jobNode.text.color;
    applyTypographySettings(settings, 'job_typography', jobNode.text, node.responsive);
  }
  if (imgs[0] && imgs[0].width) settings.image_size = { unit: 'px', size: Math.round(Number(imgs[0].width)), sizes: [] };
  if (imgs[0] && imgs[0].radius) settings.image_border_radius = boxValue(imgs[0].radius);
  if (node.style && node.style.borderWidth && node.style.borderColor) {
    settings.image_border_border = node.style.borderStyle || 'solid';
    settings.image_border_width = boxValue(node.style.borderWidth);
    settings.image_border_color = node.style.borderColor;
  }

  return { id: allocId(node.id), elType: 'widget', widgetType: 'testimonial', isInner: false, settings, elements: [] };
}

export function buildStarRating(node, allocId) {
  const starColor = (node.svg && node.svg.color) || (node.text && node.text.color) || (node.style && node.style.background) || '#F59E0B';
  const settings = { rating_scale: '5', rating: 5, star_style: 'star_fontawesome', stars_color: starColor };
  if (node.layout && node.layout.height && Number(node.layout.height) > 0 && Number(node.layout.height) <= 64) {
    settings.star_size = { unit: 'px', size: Math.round(Number(node.layout.height)), sizes: [] };
  }
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.star_space = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (node.text && node.text.align) settings.align = node.text.align;
  return { id: allocId(node.id), elType: 'widget', widgetType: 'star-rating', isInner: false, settings, elements: [] };
}

export function buildSocialIcons(node, nodes, allocId) {
  const platforms = ['facebook', 'twitter', 'x', 'instagram', 'linkedin', 'youtube', 'tiktok', 'github', 'telegram', 'whatsapp'];
  const list = [];
  const extractedSocials = (node.content && Array.isArray(node.content.socialItems)) ? node.content.socialItems : [];

  if (extractedSocials.length > 0) {
    for (const sItem of extractedSocials) {
      const name = String(sItem.name || '').toLowerCase();
      const matched = platforms.find((p) => name.includes(p)) || 'link';
      const iconVal = matched === 'x' || matched === 'twitter' ? 'fab fa-x-twitter' : (matched === 'link' ? 'fas fa-share-alt' : `fab fa-${matched}`);
      list.push({
        _id: shortId(sItem.id || name),
        social_icon: { value: iconVal, library: matched === 'link' ? 'fa-solid' : 'fa-brands' },
        link: { url: sItem.link || '#', is_external: 'true', nofollow: '' },
      });
    }
  } else {
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      const name = String((child.content && child.content.name) || '').toLowerCase();
      const matched = platforms.find((p) => name.includes(p)) || 'link';
      const iconVal = matched === 'x' || matched === 'twitter' ? 'fab fa-x-twitter' : (matched === 'link' ? 'fas fa-share-alt' : `fab fa-${matched}`);
      list.push({
        _id: shortId(cid),
        social_icon: { value: iconVal, library: matched === 'link' ? 'fa-solid' : 'fa-brands' },
        link: { url: child.link || '#', is_external: 'true', nofollow: '' },
      });
    }
  }

  const settings = { social_icon_list: list };
  if (node.layout && node.layout.justify) {
    const jMap = { CENTER: 'center', MAX: 'right', MIN: 'left' };
    if (jMap[node.layout.justify]) settings.align = jMap[node.layout.justify];
  }
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.icon_spacing = { unit: 'px', size: node.layout.gap, sizes: [] };
  }
  const firstStyled = extractedSocials.find((s) => s.background || s.borderColor || s.radius || s.width) || null;
  if (firstStyled) {
    if (firstStyled.background) {
      settings.icon_color = 'custom';
      settings.icon_primary_color = firstStyled.background;
      settings.icon_secondary_color = '#FFFFFF';
    }
    if (firstStyled.width && Number(firstStyled.width) > 0) {
      settings.icon_size = { unit: 'px', size: Math.max(12, Math.round(Number(firstStyled.width) * 0.45)), sizes: [] };
    }
    if (firstStyled.radius) settings.border_radius = boxValue(firstStyled.radius);
    if (firstStyled.borderColor) {
      settings.image_border_border = 'solid';
      settings.image_border_width = boxValue({ top: 1, right: 1, bottom: 1, left: 1 }, true);
      settings.image_border_color = firstStyled.borderColor;
    }
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'social-icons', isInner: false, settings, elements: [] };
}

export function buildCounter(node, nodes, allocId) {
  const textNodes = collectSubtreeTexts(node, nodes);
  const numNode = textNodes.find((n) => /\d/.test((n.text && n.text.characters) || '')) || (node.text ? node : textNodes[0]);
  const labelNode = textNodes.find((n) => n !== numNode) || null;

  const numTypo = (numNode && numNode.text) || node.text || {};
  const numText = String(numTypo.characters || '100').trim();
  const labelText = (labelNode && labelNode.text && labelNode.text.characters) ? String(labelNode.text.characters).trim() : '';

  const numMatch = /^([^0-9+-]*?)([0-9.,]+)(.*)$/.exec(numText);
  let prefix = (numMatch && numMatch[1]) || '';
  const rawDigits = ((numMatch && numMatch[2]) || '100').replace(/,/g, '');
  const suffix = (numMatch && numMatch[3]) || '';

  const leadZeroMatch = /^(0+)(?=\d)/.exec(rawDigits);
  if (leadZeroMatch) prefix += leadZeroMatch[1];
  const endingNumber = Number(rawDigits);

  const settings = {
    starting_number: 0,
    ending_number: Number.isFinite(endingNumber) ? endingNumber : 100,
    prefix,
    suffix,
    title: labelText,
  };

  const gradCss = getTextGradientCss(numTypo);
  const numColor = numTypo.color || (numTypo.gradient && (numTypo.gradient.color2 || numTypo.gradient.color1)) || null;
  if (numColor) {
    settings.number_color = numColor;
    if (!gradCss) applyGlobalColor(settings, 'number_color', numColor);
  }
  if (numTypo.fontFamily || numTypo.fontSize || numTypo.fontWeight) {
    applyTypographySettings(settings, 'typography_number', numTypo, (numNode && numNode.responsive) || node.responsive);
  }
  if (numTypo.align && /^(left|center|right)$/i.test(numTypo.align)) {
    const cAlign = numTypo.align.toLowerCase();
    settings.number_position = cAlign;
    settings.title_horizontal_align = cAlign;
  }
  applyTextShadowAndEffects(settings, numTypo, 'selector .elementor-counter-number-wrapper, selector .elementor-counter-number');

  if (labelNode && labelNode.text) {
    const lblTypo = labelNode.text;
    const lblColor = lblTypo.color || (lblTypo.gradient && (lblTypo.gradient.color2 || lblTypo.gradient.color1)) || null;
    if (lblColor) {
      settings.title_color = lblColor;
      applyGlobalColor(settings, 'title_color', lblColor);
    }
    applyTypographySettings(settings, 'typography_title', lblTypo, labelNode.responsive || node.responsive);
    applyTextShadowAndEffects(settings, lblTypo, 'selector .elementor-counter-title');
    const lblGrad = getTextGradientCss(lblTypo);
    if (lblGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-counter-title', lblGrad));
  }
  if (gradCss) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-counter-number-wrapper, selector .elementor-counter-number', gradCss));
  }

  return { id: allocId(node.id), elType: 'widget', widgetType: 'counter', isInner: false, settings, elements: [] };
}
