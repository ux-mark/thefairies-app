---
name: The Fairies v3 - Greenfield Home Automation App
description: New greenfield build of The Fairies home automation system - React/Vite/TypeScript frontend, Express/TypeScript/SQLite backend
type: project
---

**The Fairies v3** is a greenfield rebuild of the home automation system.

- **Repo**: https://github.com/ux-mark/thefairies-app (separate from old repo ux-mark/thefairies)
- **Monorepo**: client/ (React) + server/ (Express)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix) + react-colorful + TanStack Query + PWA
- **Backend**: Express 5 + TypeScript + SQLite (better-sqlite3) + Socket.io + Zod
- **Key feature**: Per-light colour/brightness control in scene editor, light-to-room assignment, touch-friendly colour pickers
- **Design**: Mobile-first dark theme (slate-950 + emerald/fairy-500 accent), Apple Watch view at /watch
- **Pages**: Home dashboard, Rooms, Room detail (light assignment), Scenes, Scene editor, Lights overview, Watch view

**Why:** Replaces the old LitElement + Express + MongoDB system with modern stack for better UX and maintainability.

**How to apply:** This is the active project. Old repo (thefairies) is reference only.
