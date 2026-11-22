<?php

declare(strict_types=1);

namespace F2EBridge\Elementor;

use F2EBridge\Media\AssetStore;

/**
 * Compiles an `f2e.document` Intermediate Representation into Elementor v4 Atomic Widgets
 * (`e-flexbox`, `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`) with class-based
 * responsive style variants (`desktop`, `tablet`, `mobile`).
 */
final class TranspilerV4
{
    public function __construct(
        private readonly AssetStore $assets = new AssetStore()
    ) {
    }

    /**
     * @param array<string,mixed> $document
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @return list<array<string,mixed>>
     */
    public function transpile(array $document, array $attachmentMap = []): array
    {
        $nodes = is_array($document['nodes'] ?? null) ? $document['nodes'] : [];
        $elements = [];
        foreach ((array) ($document['roots'] ?? []) as $rootId) {
            $built = $this->buildV4Node((string) $rootId, $nodes, $attachmentMap);
            if ($built !== null) {
                $elements[] = $built;
            }
        }
        return $elements;
    }

    /**
     * @param array<string,mixed> $nodes
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @return array<string,mixed>|null
     */
    private function buildV4Node(string $nodeId, array $nodes, array $attachmentMap): ?array
    {
        $node = $nodes[$nodeId] ?? null;
        if (!is_array($node) || ($node['widget'] ?? '') === 'skip') {
            return null;
        }

        $sourceId = (string) ($node['sourceNodeId'] ?? $nodeId);
        $cleanId = preg_replace('/[^a-zA-Z0-9_-]/', '-', $sourceId) ?? 'node';
        $shortHash = substr(bin2hex(random_bytes(4)), 0, 7);
        $classId = 'e-' . $cleanId . '-' . $shortHash;

        $wType = match ((string) ($node['widget'] ?? 'container')) {
            'heading' => 'e-heading',
            'text-editor' => 'e-paragraph',
            'button' => 'e-button',
            'image', 'theme-site-logo', 'site-logo', 'theme-post-featured-image' => (!empty($node['svg']) && empty($node['image']) && empty($node['raster'])) ? 'e-svg' : 'e-image',
            'icon' => 'e-svg',
            default => 'e-flexbox',
        };

        $settings = [
            'classes' => [
                '$$type' => 'classes',
                'value' => [$classId],
            ],
            '_f2e_node_id' => $sourceId,
        ];

        if ($wType === 'e-heading') {
            $settings['title'] = ['$$type' => 'string', 'value' => (string) ($node['text']['characters'] ?? $node['content']['name'] ?? 'Heading')];
            $settings['tag'] = ['$$type' => 'string', 'value' => 'h2'];
        } elseif ($wType === 'e-paragraph') {
            $settings['paragraph'] = ['$$type' => 'string', 'value' => (string) ($node['text']['characters'] ?? '')];
        } elseif ($wType === 'e-button') {
            $settings['text'] = ['$$type' => 'string', 'value' => (string) ($node['content']['characters'] ?? $node['content']['name'] ?? 'Button')];
            $settings['link'] = ['$$type' => 'link', 'value' => ['url' => (string) ($node['link'] ?? '#'), 'target' => '_self']];
        } elseif ($wType === 'e-image') {
            $media = $this->resolveV4Media($node, $attachmentMap, false);
            $settings['image'] = ['$$type' => 'image', 'value' => $media];
        } elseif ($wType === 'e-svg') {
            $media = $this->resolveV4Media($node, $attachmentMap, true);
            $settings['svg'] = ['$$type' => 'svg-src', 'value' => $media];
        }

        $variants = [
            $this->buildVariant('desktop', (array) ($node['layout'] ?? []), (array) ($node['style'] ?? []), (array) ($node['text'] ?? []), $attachmentMap, $wType === 'e-flexbox' ? $node : []),
        ];
        if (is_array($node['responsive']['tablet'] ?? null)) {
            $variants[] = $this->buildVariant('tablet', $node['responsive']['tablet'], [], $node['responsive']['tablet'], $attachmentMap);
        }
        if (is_array($node['responsive']['mobile'] ?? null)) {
            $variants[] = $this->buildVariant('mobile', $node['responsive']['mobile'], [], $node['responsive']['mobile'], $attachmentMap);
        }

        $children = [];
        foreach ((array) ($node['children'] ?? []) as $cid) {
            $childEl = $this->buildV4Node((string) $cid, $nodes, $attachmentMap);
            if ($childEl !== null) {
                $children[] = $childEl;
            }
        }

        return [
            'id' => $shortHash,
            'elType' => $wType === 'e-flexbox' ? 'e-flexbox' : 'widget',
            'widgetType' => $wType,
            'isInner' => false,
            'settings' => $settings,
            'elements' => $children,
            'styles' => [
                $classId => [
                    'id' => $classId,
                    'label' => 'local',
                    'type' => 'class',
                    'variants' => $variants,
                ],
            ],
            'editor_settings' => [],
            'version' => '0.0',
        ];
    }

    /**
     * @param array<string,mixed> $node
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @return array{id:int,url:string}
     */
    private function resolveV4Media(array $node, array $attachmentMap, bool $preferSvg = false): array
    {
        $order = $preferSvg ? ['svg', 'image', 'raster', 'style'] : ['image', 'raster', 'style', 'svg'];
        $title = (string) ($node['content']['name'] ?? 'Figma Asset');

        foreach ($order as $source) {
            if ($source === 'style') {
                $style = is_array($node['style'] ?? null) ? $node['style'] : [];
                $bgMedia = $this->resolveStyleBgMedia($style, $attachmentMap);
                if ($bgMedia['id'] > 0 || $bgMedia['url'] !== '') {
                    return $bgMedia;
                }
                continue;
            }
            $slot = $node[$source] ?? null;
            if (!is_array($slot)) {
                continue;
            }
            $sha = (string) ($slot['sha256'] ?? '');
            $fallback = (string) ($slot['dataUri'] ?? '');
            if ($sha !== '') {
                if (isset($attachmentMap[$sha])) {
                    return [
                        'id' => (int) ($attachmentMap[$sha]['id'] ?? 0),
                        'url' => (string) ($attachmentMap[$sha]['url'] ?? ''),
                    ];
                }
                $stored = $this->assets->findBySha256($sha);
                if ($stored !== null) {
                    return $stored;
                }
            }
            if ($source === 'svg' && !empty($slot['markup'])) {
                $cleanSvg = AssetStore::sanitizeSvg((string) $slot['markup']);
                if ($cleanSvg !== '') {
                    $uploaded = $this->assets->storeBase64Asset($sha, base64_encode($cleanSvg), 'image/svg+xml', $title);
                    if ($uploaded !== null && !empty($uploaded['url'])) {
                        return ['id' => (int) ($uploaded['id'] ?? 0), 'url' => (string) $uploaded['url']];
                    }
                    return ['id' => 0, 'url' => 'data:image/svg+xml;base64,' . base64_encode($cleanSvg)];
                }
            }
            if ($fallback !== '') {
                return ['id' => 0, 'url' => $fallback];
            }
        }

        return ['id' => 0, 'url' => ''];
    }

    /**
     * @param array<string,mixed> $style
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @return array{id:int,url:string}
     */
    private function resolveStyleBgMedia(array $style, array $attachmentMap): array
    {
        $bgRef = (string) ($style['backgroundImage'] ?? '');
        $bgData = (string) ($style['backgroundImageDataUri'] ?? '');
        if ($bgRef === '' && $bgData === '') {
            return ['id' => 0, 'url' => ''];
        }
        $isDirectUrl = preg_match('/^(https?:\/\/|data:image\/)/i', $bgRef) === 1;
        $sha = $isDirectUrl ? '' : $bgRef;
        if ($sha !== '') {
            if (isset($attachmentMap[$sha])) {
                return [
                    'id' => (int) ($attachmentMap[$sha]['id'] ?? 0),
                    'url' => (string) ($attachmentMap[$sha]['url'] ?? ''),
                ];
            }
            $stored = $this->assets->findBySha256($sha);
            if ($stored !== null) {
                return $stored;
            }
        }
        $fallback = $bgData !== '' ? $bgData : ($isDirectUrl ? $bgRef : '');
        return ['id' => 0, 'url' => $fallback];
    }

    /**
     * @param array<string,mixed> $layout
     * @param array<string,mixed> $style
     * @param array<string,mixed> $text
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @param array<string,mixed> $node
     * @return array<string,mixed>
     */
    private function buildVariant(string $breakpoint, array $layout, array $style, array $text, array $attachmentMap = [], array $node = []): array
    {
        $props = [];
        if (!empty($layout['direction'])) {
            $props['flex-direction'] = ['$$type' => 'string', 'value' => (string) $layout['direction']];
        }
        if (isset($layout['gap']) && is_numeric($layout['gap'])) {
            $props['gap'] = ['$$type' => 'size', 'value' => ['size' => (int) $layout['gap'], 'unit' => 'px', 'isLinked' => true]];
        }
        if (!empty($style['background'])) {
            $props['backgroundColor'] = ['$$type' => 'color', 'value' => (string) $style['background']];
        }
        $bgMedia = $this->resolveStyleBgMedia($style, $attachmentMap);
        if ($bgMedia['id'] === 0 && $bgMedia['url'] === '' && !empty($node['raster'])) {
            $bgMedia = $this->resolveV4Media(['raster' => $node['raster']], $attachmentMap, false);
        }
        if ($bgMedia['id'] > 0 || $bgMedia['url'] !== '') {
            $props['backgroundImage'] = ['$$type' => 'image', 'value' => $bgMedia];
        }
        if (!empty($text['color'])) {
            $props['color'] = ['$$type' => 'color', 'value' => (string) $text['color']];
        }
        if (isset($text['fontSize']) && is_numeric($text['fontSize'])) {
            $props['fontSize'] = ['$$type' => 'size', 'value' => ['size' => (float) $text['fontSize'], 'unit' => 'px']];
        }
        return [
            'meta' => ['breakpoint' => $breakpoint, 'state' => null],
            'props' => $props,
        ];
    }
}
