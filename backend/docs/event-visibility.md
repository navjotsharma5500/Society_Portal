# Domain event visibility

Future student-visible timeline events include society-claim submission, approval and rejection; society-role start and end; promotions; self-evaluations; event participation; and certification.

Authentication events such as login, logout, failed login, token refresh, session revocation and access disablement are backend audit/security events. They must not be shown in the student-visible timeline.

The current in-process domain-event publisher is transport-neutral. Future email, notification, push, timeline and audit consumers must explicitly classify events before displaying or delivering them.
