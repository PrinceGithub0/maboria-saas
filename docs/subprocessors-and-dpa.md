# Subprocessors and DPA Notes

## Provider categories used by the product
- Payment providers: Paystack, Flutterwave, Stripe
- Messaging providers: WhatsApp / Meta and connected mail providers
- E-invoicing providers: provider selected per supported country rollout
- Infrastructure and hosting providers

## Operational requirements
- Maintain an internal subprocessor list with owner, purpose, region, and contract status.
- Record whether a DPA or equivalent processing terms are in place for each provider.
- Review provider access whenever a new integration is enabled in production.
- Remove or revoke unused provider credentials during offboarding and account erasure.

## Product alignment
- Public privacy and terms pages must describe provider categories accurately.
- Settings and customer pages must reflect the actual self-service controls available.
- Export payloads must avoid exposing encrypted secrets while still disclosing that an integration exists.
- Credential revocation paths must exist for mailbox and e-invoicing integrations.
