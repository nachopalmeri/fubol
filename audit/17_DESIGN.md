# Presentation design receipt

## Compact brief

- **Product / audience:** Fubol is a private family web space. A family member should quickly identify something currently playable, browse it, or search; football fixtures are schedule information, not proof of a playable broadcast.
- **Real content / action:** use only artwork and metadata returned by the catalogue; make the primary action open a playable movie or series route. If availability is empty, say that no playback source is verified and offer useful next steps without claiming nothing is connected.
- **Brand truth / feeling:** practical, shared, familiar entertainment. Editorial and cinematic, not an AI/SaaS dashboard. Charcoal and white carry the interface; restrained red marks action.
- **Constraints:** Next 16 App Router, server-rendered home data, no added dependencies, do not invent art or availability, no third-party trademarks/assets. Responsive at 390 / 768 / 1440 widths, keyboard-visible focus, semantic sections, reduced motion.

## References: borrow / reject

- [Netflix browse](https://www.netflix.com/browse) — borrow the clear browse/search hierarchy and broad, image-led content rails; reject Netflix wordmark, artwork, exact layout, and proprietary visual identifiers.
- [The Criterion Channel](https://www.criterionchannel.com/) — borrow the editorial restraint and title-first curation; reject its brand typography, film artwork, and exact collection presentation.
- [Apple TV](https://tv.apple.com/) — borrow the cinematic use of wide feature artwork with readable foreground copy; reject its polished campaign styling, original imagery, and branded controls.

References are directional only. No reference assets or trademarks are used. Images are sourced only from existing catalogue metadata; missing artwork gets a neutral typographic fallback, never a fabricated poster.

## Structure decision

Compared two home layouts:

1. **Feature first:** validated playable title as wide feature, followed by horizontal movie/series rails, then a distinct football agenda.
2. **Schedule first:** prominent match dashboard with fixture cards and VOD catalog below.

Selected **1**: it puts the real viewing task first and prevents fixtures from implying a live stream. On an empty VOD response, the feature becomes a compact family setup/search state rather than a fictional billboard. The agenda is explicitly labeled as schedule information.

## System and signature

- **Signature:** one wide editorial artwork field that resolves into a strong left-to-right text field; when no verified title exists, the same space becomes a calm library-status panel. This ties cinematic browsing to honest availability.
- **Tokens:** `#111112` page, `#1d1d1f` panel, `#f5f4f2` primary text, `#aaa7a4` supporting text, `#e50914` action accent; restrained 6–8px corners; 32px desktop / 16px mobile page gutters.
- **Type:** existing system sans for fast, familiar reading; large tight feature title, compact rail labels, no decorative display font.
- **Density / media:** full-width feature, consistent landscape art rails, horizontal overflow at narrow widths, no decorative dashboard cards. Use only catalogue artwork.
- **Motion / access:** no new motion requirement; reduced-motion override, visible focus inherited from global styles, semantic headings/labels and alt-empty decorative artwork.

## Verification note

Code-level responsive and accessibility decisions are recorded above. Screenshot capture and visual rubric scoring at 390×844 and 1440×900 (plus tablet if needed) are reserved for the primary integration pass; this scope did not claim visual screenshot QA.

## Primary integration visual QA

Rendered final Docker build and inspected screenshots:

- `.playwright-mcp/release-home-390.png` — 390×844.
- `.playwright-mcp/release-home-768.png` — 768×1024.
- `.playwright-mcp/release-home-1440.png` — 1440×900.

Initial desktop capture caught a streaming loading state; recaptured after the actual home heading appeared. Found unrelated sports channels linked to every agenda fixture: removed the generic sports-group matching bonus and added a failing-then-passing regression. Removed leftover colored badge gradients from the home agenda, improved small red eyebrow contrast, and removed the duplicate home footer. Final captures have no horizontal document overflow and no spurious agenda watch links in the observed state.

Self-assessed rubric, 0–2: subject specificity 1; hierarchy 2; composition 2; typography 2; color rationale 2; responsive integrity 2; accessibility 1; purposeful motion 1; generic-pattern avoidance 1. **14/18**, every dimension ≥1. This is an agent assessment, not user approval or a full accessibility audit. Populated artwork rails/feature were not visually accepted against real available titles because the configured VOD resolver returned none; the empty state is intentionally not filled with fake content.
