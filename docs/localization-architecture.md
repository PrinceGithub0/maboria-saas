# Localization Architecture

This repo is moving from inline multilingual strings toward catalog-based localization.

## Long-term rules

1. All user-facing copy belongs in UTF-8 locale catalogs under `messages/`.
2. New UI code should use stable message IDs, not inline `t("en", "fr", ...)` literals.
3. English is the default catalog and fallback source of truth.
4. Interpolated copy should use ICU-compatible message values through `react-intl`.
5. Catalogs must stay key-aligned across `en`, `fr`, `de`, `es`, and `pt`.
6. Suspicious encoding (`Ã`, `ï¿½`, `?` replacing letters) fails validation.
7. Legacy `t(...)` remains only for gradual migration of existing screens.

## Migration path

1. Add a message key in `messages/en.json`.
2. Add the same key to every supported locale file.
3. Use `useLanguage().m("message.id")` or `react-intl` formatting in the component.
4. Remove the old inline multilingual literal from that component.
5. Keep catalog validation in CI.

## Current state

- `components/providers/language-provider.tsx` now exposes catalog-backed messages through `m(...)`.
- Existing `t(...)` calls still work for untouched areas.
- The invoice screen is the first migrated slice.
