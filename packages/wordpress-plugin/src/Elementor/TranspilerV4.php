<?php

declare(strict_types=1);

namespace F2EBridge\Elementor;

/**
 * Compiles an `f2e.document` Intermediate Representation into Elementor v4 Atomic Widgets
 * (`e-flexbox`, `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`) with class-based
 * responsive style variants (`desktop`, `tablet`, `mobile`).
 */
final class TranspilerV4
{
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
            'image' => 'e-image',
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
            $sha = (string) ($node['image']['sha256'] ?? '');
            $media = ($sha !== '' && isset($attachmentMap[$sha])) ? $attachmentMap[$sha] : ['id' => 0, 'url' => (string) ($node['image']['dataUri'] ?? '')];
            $settings['image'] = ['$$type' => 'image', 'value' => $media];
        }

        $variants = [
            $this->buildVariant('desktop', (array) ($node['layout'] ?? []), (array) ($node['style'] ?? []), (array) ($node['text'] ?? [])),
        ];
        if (is_array($node['responsive']['tablet'] ?? null)) {
            $variants[] = $this->buildVariant('tablet', $node['responsive']['tablet'], [], $node['responsive']['tablet']);
        }
        if (is_array($node['responsive']['mobile'] ?? null)) {
            $variants[] = $this->buildVariant('mobile', $node['responsive']['mobile'], [], $node['responsive']['mobile']);
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
     * @param array<string,mixed> $layout
     * @param array<string,mixed> $style
     * @param array<string,mixed> $text
     * @return array<string,mixed>
     */
    private function buildVariant(string $breakpoint, array $layout, array $style, array $text): array
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
