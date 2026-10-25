# Security Policy

## Supported Versions

We actively maintain and provide security patches for the following versions of **Pulse Chat**:

| Version | Supported          | Security Status                                      |
| ------- | ------------------ | ---------------------------------------------------- |
| 2.2.x   | :white_check_mark: | Active support; latest stable release.               |
| 2.1.x   | :white_check_mark: | Supported; receives regular security updates.        |
| 2.0.x   | :white_check_mark: | Supported; receives regular security updates.        |
| 1.x.x   | :x:                | End of life; please upgrade to the latest 2.x release. |

---

## Reporting a Vulnerability

The Pulse Chat team takes security vulnerabilities seriously. We appreciate the efforts of security researchers and community members in helping make Pulse Chat safe and resilient for all users.

### How to Report

If you discover a security vulnerability or potential exploit, please **do not open a public GitHub issue**. Instead, report it through one of the following confidential channels:

1. **GitHub Private Security Advisory (Preferred):**
   - Navigate to the [Pulse Chat Security Advisories](https://github.com/2harshpandey/pulse-chat/security/advisories) page.
   - Click **"Report a vulnerability"** to privately submit details to the maintainer.

2. **Direct Contact:**
   - Contact the project maintainer, **Harsh Pandey**, via GitHub at [@2harshpandey](https://github.com/2harshpandey).

### What to Include in Your Report

To help us triage and patch the issue as quickly as possible, please include:

- **Vulnerability Description:** A concise summary of the issue (e.g., SSRF, XSS, injection, rate limit bypass).
- **Affected Component:** Backend endpoint, WebSocket handler, database model, or frontend component.
- **Steps to Reproduce:** Clear, step-by-step instructions or proof-of-concept (PoC) code.
- **Potential Impact:** What an attacker could achieve (e.g., data leak, denial of service, privilege escalation).
- **Suggested Remediation:** Any proposed fix or mitigation, if known.

---

## Response Process & Timelines

When a security report is received:

1. **Acknowledgment:** We will acknowledge receipt of your report within **48 hours**.
2. **Assessment:** We will investigate and confirm the validity, severity, and scope of the vulnerability within **5 business days**.
3. **Remediation:** We will develop, test, and deploy a security fix across the repository and live environments.
4. **Coordinated Disclosure:** Once the fix is published and verified on production ([pulsechat.tech](https://pulsechat.tech)), a public advisory will be published crediting the reporter (unless anonymity is requested).

---

## Security Safeguards in Pulse Chat

Pulse Chat implements defense-in-depth measures across all tiers:

- **Injection Immunization:** All MongoDB queries use explicit `$eq` operators and type validation to prevent NoSQL query injection.
- **Strict URL & SSRF Validation (CWE-20):** Link preview extraction and download proxies parse URLs through standard WHATWG `URL` objects, validating hostname suffixes and blocking internal/private IP ranges.
- **ReDoS Prevention:** User search queries and regex patterns are escaped using strict regex sanitization routines.
- **Multi-Tier Rate Limiting:** Layered protections on HTTP authentication, room joining, media uploads, and administrative endpoints.
- **Device & IP Fingerprinting:** Real-time abuse mitigation leveraging device hashes and IP tracking with instant moderation enforcement.
