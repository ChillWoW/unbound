# Project Structure Guide for Future LLM Agents

This app is a good example of a clean, easy-to-reuse full-stack structure.

It is organized in a way that helps both humans and future LLM agents understand where things belong without much guessing. The main reason it works well is that each layer has a clear job, and each feature has a clear home.

## High-Level Shape

```text
frontend/
backend/
```

The app is split into two clear parts:

- `frontend/` contains the UI and client-side state
- `backend/` contains the API, business logic, and data access

That makes it easy to understand where a change should start.

## Frontend Structure

The frontend is mostly organized by feature, which is one of the best parts of the app.

```text
frontend/src/
  routes/
  features/
    auth/
    chat/
    settings/
  components/
  lib/
```

### What each part does

- `routes/` handles page-level routing and layouts
- `features/` contains real product logic grouped by domain
- `components/` holds reusable UI pieces
- `lib/` holds shared utilities like the API client

### Why this is good

A future LLM agent does not have to guess where to add code.

If it needs to work on login, it can go to `features/auth`.
If it needs to work on conversations, it can go to `features/chat`.
If it needs a page shell or redirect logic, it can go to `routes`.

That makes the codebase feel predictable.

## Example Frontend Pattern

A route file stays thin and delegates real work:

- `frontend/src/routes/__root.tsx` sets up app-wide providers
- `frontend/src/routes/_chat.tsx` handles auth gating and layout
- feature folders hold the actual behavior

So the mental model is:

```text
route -> provider/context -> feature components -> API client
```

That is a strong pattern for future projects because it separates:

- navigation
- global state
- domain logic
- reusable UI

## Backend Structure

The backend is organized by module/domain.

```text
backend/src/
  app.ts
  modules/
    auth/
    ai/
    conversations/
    settings/
    memory/
    todos/
```

### What this means

- `app.ts` wires the modules together
- each module owns its own routes and business logic
- domain code stays grouped together instead of scattered around the backend

A common module shape looks like this:

```text
module/
  something.routes.ts
  something.service.ts
  something.repository.ts
  something.types.ts
```

### Why this is good

This is especially useful for future LLM agents because it creates a very clear chain:

```text
HTTP route -> service -> repository -> database
```

That means an agent can usually answer:

- where requests enter
- where business rules live
- where persistence happens

without reading the whole backend.

## Good Separation of Responsibilities

This app also does a good job of keeping responsibilities clean.

### Frontend

- routes decide page flow
- contexts manage app/session state
- feature APIs call the backend
- reusable UI stays in shared components

### Backend

- routes validate and shape requests
- services hold business rules
- repositories talk to the database
- app setup stays separate from domain logic

That separation is exactly what makes a project easier to extend later.

## Why This Structure Works Well for Future Projects

If I were explaining this project to another LLM agent, I would say:

> This repo uses a feature-first frontend and a module-based backend.
> On the frontend, routes are thin and feature folders own domain logic.
> On the backend, `app.ts` composes modules, and each module owns its routes, services, and data access.
> When adding new work, follow the existing domain folder first instead of creating new top-level patterns.

That wording helps future agents avoid messy changes.

## Simple Reusable Rule of Thumb

A good default for future projects based on this app:

```text
If the change is page navigation or layout -> routes
If the change is domain behavior -> features or backend modules
If the change is shared UI -> components
If the change is shared helper logic -> lib
If the change is backend business logic -> service
If the change is backend data access -> repository
```

## Final Take

The reason this app feels solid is not that it is overly complex. It is actually the opposite.

It is easy to follow because:

- the frontend is feature-based
- the backend is module-based
- routes stay thin
- services hold logic
- shared utilities are centralized
- the overall flow is easy to trace
