<?php

declare(strict_types=1);

namespace F2EBridge\Elementor;

/**
 * Saves or Incrementally Re-syncs Elementor documents across:
 * - Standard WordPress Pages (`post_type = page`)
 * - Elementor Saved Templates & Pro Theme Builder (`post_type = elementor_library`:
 *   `page`, `section`, `container`, `header`, `footer`, `single-post`, `loop-item`)
 *
 * Incremental Re-sync (`mode = resync`):
 * Matches incoming elements with existing elements by `settings._f2e_node_id`.
 * When found, updates that element in-place (preserving its Elementor element `id`
 * and any other unmapped sections on the page) instead of wiping the page!
 */
final class DocumentWriter
{
    /**
     * @param list<array<string,mixed>> $incomingElements
     * @param array<string,mixed> $options
     * @return array{postId:int,actionLabel:string,editUrl:string,viewUrl:string}
     */
    public function saveOrSync(array $incomingElements, array $options = []): array
    {
        $targetPostId = (int) ($options['targetPostId'] ?? 0);
        $targetType = (string) ($options['targetType'] ?? 'page');
        $templateType = (string) ($options['templateType'] ?? 'page');
        $title = sanitize_text_field((string) ($options['title'] ?? 'Figma Import'));
        $status = in_array($options['postStatus'] ?? 'draft', ['draft', 'publish', 'private'], true)
            ? (string) $options['postStatus']
            : 'draft';
        $mode = (string) ($options['importMode'] ?? 'resync'); // 'resync' | 'append' | 'replace'

        $actionLabel = 'Created';
        if ($targetPostId > 0 && function_exists('get_post') && get_post($targetPostId) !== null) {
            $postId = $targetPostId;
            $existingRaw = function_exists('get_post_meta') ? get_post_meta($postId, '_elementor_data', true) : '';
            $existingTree = is_string($existingRaw) && $existingRaw !== '' ? json_decode($existingRaw, true) : [];
            $existingTree = is_array($existingTree) ? $existingTree : [];

            if ($mode === 'replace' || $existingTree === []) {
                $finalTree = $incomingElements;
                $actionLabel = 'Replaced';
            } elseif ($mode === 'append') {
                $finalTree = array_merge($existingTree, $incomingElements);
                $actionLabel = 'Appended';
            } else {
                // Incremental Re-sync by `_f2e_node_id`
                [$finalTree, $updatedCount, $appendedCount] = $this->incrementalMerge($existingTree, $incomingElements);
                $actionLabel = sprintf('Re-synced (%d updated, %d added)', $updatedCount, $appendedCount);
            }
        } else {
            $postType = $targetType === 'elementor_library' ? 'elementor_library' : 'page';
            $postId = function_exists('wp_insert_post') ? (int) wp_insert_post([
                'post_title' => $title !== '' ? $title : 'Figma Import',
                'post_type' => $postType,
                'post_status' => $status,
            ]) : 1;
            $finalTree = $incomingElements;
        }

        // Write Elementor metadata
        if (function_exists('update_post_meta')) {
            $json = function_exists('wp_json_encode')
                ? wp_json_encode($finalTree, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                : json_encode($finalTree, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            update_post_meta($postId, '_elementor_data', function_exists('wp_slash') ? wp_slash((string) $json) : (string) $json);
            update_post_meta($postId, '_elementor_edit_mode', 'builder');
            update_post_meta($postId, '_elementor_version', defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '3.27.0');

            if ($targetType === 'elementor_library') {
                update_post_meta($postId, '_elementor_template_type', $templateType);
                if (function_exists('wp_set_object_terms')) {
                    wp_set_object_terms($postId, $templateType, 'elementor_library_type');
                }
            }
        }

        $this->clearElementorCache();

        $editUrl = function_exists('admin_url') ? admin_url('post.php?post=' . $postId . '&action=elementor') : '';
        $viewUrl = function_exists('get_permalink') ? (string) get_permalink($postId) : '';

        return [
            'postId' => $postId,
            'actionLabel' => $actionLabel,
            'editUrl' => $editUrl,
            'viewUrl' => $viewUrl,
            'elementCount' => count($finalTree),
        ];
    }

    /**
     * Incrementally merges incoming Figma-mapped elements into an existing Elementor tree
     * using `settings._f2e_node_id` so existing page sections and Elementor IDs are preserved.
     *
     * @param list<array<string,mixed>> $existingTree
     * @param list<array<string,mixed>> $incomingElements
     * @return array{0:list<array<string,mixed>>,1:int,2:int}
     */
    public function incrementalMerge(array $existingTree, array $incomingElements): array
    {
        $incomingByF2eId = [];
        foreach ($incomingElements as $inc) {
            $fid = (string) ($inc['settings']['_f2e_node_id'] ?? '');
            if ($fid !== '') {
                $incomingByF2eId[$fid] = $inc;
            }
        }

        $matchedF2eIds = [];
        $updatedCount = 0;

        $replaceInTree = function (array $tree) use (&$replaceInTree, $incomingByF2eId, &$matchedF2eIds, &$updatedCount): array {
            foreach ($tree as $i => $el) {
                if (!is_array($el)) {
                    continue;
                }
                $fid = (string) ($el['settings']['_f2e_node_id'] ?? '');
                if ($fid !== '' && isset($incomingByF2eId[$fid])) {
                    $replacement = $incomingByF2eId[$fid];
                    // Preserve original Elementor element ID and user custom CSS if any
                    if (!empty($el['id'])) {
                        $replacement['id'] = $el['id'];
                    }
                    if (!empty($el['settings']['custom_css']) && empty($replacement['settings']['custom_css'])) {
                        $replacement['settings']['custom_css'] = $el['settings']['custom_css'];
                    }
                    $tree[$i] = $replacement;
                    $matchedF2eIds[$fid] = true;
                    $updatedCount++;
                    continue;
                }
                if (!empty($el['elements']) && is_array($el['elements'])) {
                    $tree[$i]['elements'] = $replaceInTree($el['elements']);
                }
            }
            return $tree;
        };

        $mergedTree = $replaceInTree($existingTree);
        $appendedCount = 0;
        foreach ($incomingElements as $inc) {
            $fid = (string) ($inc['settings']['_f2e_node_id'] ?? '');
            if ($fid === '' || !isset($matchedF2eIds[$fid])) {
                $mergedTree[] = $inc;
                $appendedCount++;
            }
        }

        return [$mergedTree, $updatedCount, $appendedCount];
    }

    private function clearElementorCache(): void
    {
        if (class_exists('Elementor\\Plugin')) {
            $plugin = \Elementor\Plugin::$instance ?? null;
            if (is_object($plugin) && isset($plugin->files_manager) && method_exists($plugin->files_manager, 'clear_cache')) {
                $plugin->files_manager->clear_cache();
            }
        }
    }
}
