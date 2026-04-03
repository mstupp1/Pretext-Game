# Lexicon Crossing — Developer & Agent Guide

This document contains architectural details, key mechanics, and technical constraints for **Lexicon Crossing** to help future developers or AI agents understand and continue working on the codebase.

## 📖 Project Overview
"Lexicon Crossing" is a typographic, Scrabble-meets-Frogger game built primarily to showcase the capabilities of the `@chenglou/pretext` rendering library. The interface treats text as a physical medium.

**Core Tech Stack:**
- **Canvas Rendering:** `@chenglou/pretext` (for character-by-character measurement and wrapping).
- **Tooling:** Vite, TypeScript (Vanilla).
- **Validation:** Free Dictionary API (`api.dictionaryapi.dev`) with a local fallback cache.

## 🏛️ Architecture & Key Files
The source code is located in `src/`.

### 1. The Physics Engine (`src/text/TextStream.ts`)
This class manages the lifecycle and physics of all scrolling characters. It relies on a deterministic pseudo-random seed to generate ambient effects without maintaining excessive state.
- **Ambient Effects:** `getUndulationOffset`, `getShimmerOffset`, `getWordPulseOffset`, and `getEdgeScale` combine to create a floating, rippling sheet of text.
- **Player Proximity Lens:** `applyPlayerEffects` evaluates the characters' distance to the `Player` cursor. It dynamically updates `targetScale` (for magnification) and `targetRotation` (snapping letters perfectly upright). It sets a spring physics `targetScale` (0-2.5x) but relies on frame-by-frame interpolation to visually animate the scale.

### 2. The Render Pipeline (`src/game/Lane.ts`)
`Lane.ts` creates and orchestrates `TextStream` instances for its respective row.
- **Two-Pass Rendering:** `render()` uses a two-pass strategy to fix z-indexing issues. It pushes standard background text to a first pass, and pushes highlighted/collected letters to a second pass so they always draw cleanly on top.
- **Opacity Transitions:** Highlighted letters use a dynamic transition system based on `interactionStrength` (tied to proximity scale) to gradually fade in ivory background masks, gold underlines, and glow tints.
- **Safe Zones:** `SAFE_ZONE_INDICES` (lanes 0 and 8) instantiate `TextStream` using a stream of icons (from FontAwesome via CDN) rather than standard text.

### 3. The State Machine (`src/game/Game.ts`)
Manages transitions (`title` -> `playing` -> `gameover`).
- **Word Collection:** Characters acquired by the `Player` are stored in a word tray.
- **Progression:** The player's current chapter determines the game speed and time limits (handled via `loadLevel()`). Instead of advancing by crossing lanes, chapters advance automatically via total score thresholds (e.g., `chapter * 50`).
- **Submission Lock:** `submitWord()` incorporates an asynchronous API flow using `isSubmitting` bounds to prevent spamming the dictionary request.

## ✨ Aesthetic Rules & Constraints
- **Color Palette:** Strictly maintains an academic/library theme.
  - Paper: `ivory`, `cream`, `parchment`
  - Ink: `espresso`, `sepia`, `muted`
  - Accents: `gold`, `goldLight`
- **Fonts:** UI uses *Cormorant Garamond*, while dynamic lanes utilize canvas-drawn representations of Cormorant variants.
- **Performance:** Avoid using direct DOM styling for moving elements. All interactive visual elements MUST be rendered via the raw canvas context.
- **Icon Lanes:** Found in `constants.ts` (`ICONS`), the top and bottom lanes utilize FontAwesome 6 Unicode characters formatted via randomized "shuffle bags" inside `TextStream`.

## 🚀 Deployment
- The project is deployed via a GitHub Action to GitHub Pages (`.github/workflows/deploy.yml`). 
- Any dependencies needing static linking must be updated inside `index.html` (e.g., FontAwesome, Google Fonts) since Vite resolves the root context on build via `base: '/Pretext-Game/'`.
