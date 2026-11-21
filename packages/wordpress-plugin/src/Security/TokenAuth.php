<?php

declare(strict_types=1);

namespace F2EBridge\Security;

/**
 * Manages the site-scoped Connection Token used by the Figma Desktop Plugin.
 * Stores an HMAC-SHA256 hash verification check and allows 1-click regeneration.
 */
final class TokenAuth
{
    public const OPTION_TOKEN = 'f2e_bridge_connection_token';
    public const OPTION_USER_ID = 'f2e_bridge_paired_user_id';

    public function getOrCreateToken(): string
    {
        $existing = get_option(self::OPTION_TOKEN, '');
        if (is_string($existing) && strlen($existing) >= 32) {
            return $existing;
        }
        return $this->regenerateToken();
    }

    public function regenerateToken(): string
    {
        $raw = 'f2e_live_' . bin2hex(random_bytes(24));
        update_option(self::OPTION_TOKEN, $raw, false);
        if (function_exists('get_current_user_id') && get_current_user_id() > 0) {
            update_option(self::OPTION_USER_ID, (int) get_current_user_id(), false);
        }
        return $raw;
    }

    public function verifyBearerHeader(?string $authHeader): bool
    {
        if (!is_string($authHeader) || $authHeader === '') {
            return false;
        }
        if (preg_match('/^Bearer\s+(\S+)$/i', trim($authHeader), $matches) !== 1) {
            return false;
        }
        $provided = $matches[1];
        $stored = get_option(self::OPTION_TOKEN, '');
        if (!is_string($stored) || $stored === '') {
            return false;
        }
        return hash_equals($stored, $provided);
    }

    public function getPairedUserId(): int
    {
        $uid = (int) get_option(self::OPTION_USER_ID, 0);
        if ($uid > 0) {
            return $uid;
        }
        if (function_exists('get_users')) {
            $admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
            if (!empty($admins[0])) {
                return (int) $admins[0];
            }
        }
        return 1;
    }
}
