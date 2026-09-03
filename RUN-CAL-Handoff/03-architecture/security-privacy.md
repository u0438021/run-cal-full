# Security and Privacy Manual

- Hash PINs with a memory-hard password KDF and unique salt; keep any pepper in secret management. Generic login/reset messages prevent username enumeration.
- TLS, secure HTTP-only same-site sessions, CSRF defense, rate limits, temporary lock, session rotation, audit logging and privileged-role hardening are production requirements.
- Enforce workspace/athlete authorization server-side for every row and object request; use database row-level controls where practical.
- Encrypt database/object storage and backups; segregate secrets; scan uploads; redact sensitive fields from logs.
- Treat birth date, health/recovery, emergency contact, location/routes, messages and FIT as sensitive. Route privacy and map sharing default to private.
- Platform operators see operational metadata by default. Content access requires time-bounded, reasoned, audited support authorization.
- Provide consent/notice for AI use and connected services. Do not use athlete content for unrelated model training without explicit policy/consent.
- Define retention, export, correction, deletion, legal basis, breach handling and jurisdiction requirements before public launch.
- AI output is coaching support, not medical diagnosis. Surface limitations and emergency guidance appropriately without inferring illness/injury.

