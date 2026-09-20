---
name: Yaadon
colors:
  surface: '#fbf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#584141'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0f0'
  outline: '#8c7071'
  outline-variant: '#e0bfbf'
  surface-tint: '#af2b3e'
  primary: '#570013'
  on-primary: '#ffffff'
  primary-container: '#800020'
  on-primary-container: '#ff828a'
  inverse-primary: '#ffb3b5'
  secondary: '#775a19'
  on-secondary: '#ffffff'
  secondary-container: '#fed488'
  on-secondary-container: '#785a1a'
  tertiary: '#272823'
  on-tertiary: '#ffffff'
  tertiary-container: '#3d3e39'
  on-tertiary-container: '#a9a9a2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b5'
  on-primary-fixed: '#40000b'
  on-primary-fixed-variant: '#8e0f28'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#e4e3db'
  tertiary-fixed-dim: '#c8c7bf'
  on-tertiary-fixed: '#1b1c17'
  on-tertiary-fixed-variant: '#474742'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e1'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-sm:
    fontFamily: EB Garamond
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding-mobile: 20px
  container-padding-desktop: 40px
  stack-gap: 24px
  section-margin: 64px
---

## Brand & Style
The design system is built on a "Heritage-Modern" aesthetic, specifically tailored for the Indian family dynamic. It bridges the gap between traditional sentimentality and cutting-edge AI technology. The visual identity avoids the cluttered, high-saturation tropes of festive marketing, opting instead for a "Digital Heirloom" feel—quiet, premium, and deeply emotional.

The style is a blend of **Minimalism** and **Tactile** design. It utilizes heavy whitespace to create a sense of calm for busy parents, while employing subtle physical metaphors—like paper-like surfaces and textile-inspired dividers—to evoke the feeling of a physical photo album. The emotional response is one of nostalgia, trust, and warmth.

## Colors
The palette is rooted in the "Shagun" (auspicious) colors of India but desaturated and refined for a premium digital experience.

- **Primary (#800020):** A deep maroon/terracotta used for calls to action and critical brand moments. It conveys depth, tradition, and strength.
- **Secondary (#C5A059):** A muted gold used sparingly for accents, iconography, and decorative flourishes. It adds a premium "jewelry-like" finish without being gaudy.
- **Background (#FFFDF5):** A warm ivory/cream base that reduces eye strain and feels more organic than pure white.
- **Surface (#FFFFFF):** Elevated cards and containers use pure white to pop against the ivory background.
- **Text (#333333):** Dark charcoal ensures high legibility and a grounded feel.

## Typography
The typography follows a high-contrast pairing strategy.

**EB Garamond** is used for all headlines to provide a literary, authoritative, and timeless quality. It should be typeset with slightly tighter tracking in large displays to maintain a sophisticated silhouette.

**Plus Jakarta Sans** provides a friendly, modern counterbalance for body text and functional UI elements. It was chosen for its excellent legibility on mobile screens and its soft, approachable geometric curves which complement the rounded UI components.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a focus on generous vertical breathing room.

- **Mobile:** A 4-column grid with 16px gutters and 20px side margins. Large touch targets are prioritized, with primary actions anchored to the bottom of the viewport for ease of use.
- **Desktop:** A 12-column centered grid with a max-width of 1200px. 24px gutters.
- **Rhythm:** Spacing follows an 8px base unit. Use larger gaps (48px+) between sections to ensure the experience feels unhurried and premium.

Content should be grouped in clear "Story Blocks" rather than dense data tables, emphasizing the emotional nature of family portraits.

## Elevation & Depth
Depth is communicated through **Ambient Shadows** and **Tonal Layers**.

Avoid harsh, high-contrast drop shadows. Instead, use soft, multi-layered "natural" shadows (Blur: 20px-40px, Opacity: 4-6%) with a subtle tint of the primary maroon color (#800020) in the shadow cast to maintain warmth.

- **Level 0 (Background):** Ivory (#FFFDF5).
- **Level 1 (Cards):** White (#FFFFFF) with a soft shadow, used for portrait previews and input groups.
- **Level 2 (Overlays):** Modal dialogs or image enlargements with a backdrop blur (12px) to focus the user’s attention on the specific memory being created.

## Shapes
The shape language is defined by organic softness. Sharp corners are avoided to maintain an approachable and safe feeling.

- **Standard Elements:** 0.5rem (8px) radius for input fields and small cards.
- **Primary Buttons:** 1rem (16px) or fully pill-shaped to invite interaction.
- **Containers:** Large image containers and section cards use `rounded-xl` (1.5rem / 24px).
- **Subtle Details:** Decorative elements may use "Jali" or "Arch" inspired curves—specifically a "Squircle" or soft arch top for portrait frames—to nod to Indian architectural heritage without appearing overly literal.

## Components
- **Primary Buttons:** Minimum height 44px (preferably 56px for main CTA). Solid Maroon (#800020) with white text. Use a subtle gold (#C5A059) 2px border or underline for secondary actions.
- **Portrait Cards:** White background, 24px rounded corners, with a soft shadow. The image should be the hero, using a 4:5 aspect ratio (standard for portraits).
- **Input Fields:** Soft cream background with a 1px stroke in a lightened version of the accent gold. Labels use Plus Jakarta Sans Bold in Charcoal.
- **Step Indicators:** Use a "Thread" metaphor—thin gold horizontal lines connecting soft dots to represent the journey of creating a portrait.
- **Iconography:** Thin-stroke (1.5pt) linear icons. Avoid filled, heavy icons. Use Secondary Gold for icon accents.
- **Success States:** Use a soft sage green rather than a harsh bright green, keeping the palette sophisticated and muted.
