# Architecture Decisions

---

## Decision 001

Date

04-Aug-2026

Title

Single Google Authentication

Decision

Every user will authenticate using Google OAuth only.

Reason

One identity across the entire Campus Connect ecosystem.

Status

Accepted

---

## Decision 002

Title

Dynamic Role System

Decision

Roles will never be hardcoded.

Permissions will always come from the database.

Status

Accepted

---

## Decision 003

Title

Workflow Engine

Decision

Every approval process will use one common workflow engine.

Modules

- Profile
- Promotion
- Event
- Budget
- Venue
- Night Permission
- Certificate

Status

Accepted

---

## Decision 004

Title

Notification First

Decision

Every workflow action creates

- Notification
- Timeline
- Audit

Status

Accepted