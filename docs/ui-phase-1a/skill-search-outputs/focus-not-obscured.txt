## UI Pro Max Search Results
**Domain:** ux | **Query:** focus not obscured
**Source:** ux-guidelines.csv | **Found:** 3 results

### Result 1
- **Category:** Accessibility
- **Issue:** Focus Not Obscured (Enhanced)
- **Platform:** Web
- **Description:** WCAG 2.2 AAA requires keyboard focus to remain fully visible
- **Do:** Keep the entire focused component unobscured by author-created content
- **Don't:** Present this enhanced AAA criterion as an AA requirement or allow persistent UI to hide any part of focus
- **Code Example Good:** close persistent overlay before focus moves behind it
- **Code Example Bad:** sticky footer covers half the focused button
- **Severity:** Medium

### Result 2
- **Category:** Accessibility
- **Issue:** Focus Not Obscured (Minimum)
- **Platform:** Web
- **Description:** WCAG 2.2 AA requires keyboard focus to remain at least partially visible
- **Do:** Offset sticky UI with scroll-padding and dismiss or move persistent overlays
- **Don't:** Let headers footers banners or chat widgets fully cover focus
- **Code Example Good:** scroll-padding-top: var(--header-height)
- **Code Example Bad:** fixed overlay covers :focus
- **Severity:** High

### Result 3
- **Category:** Accessibility
- **Issue:** Focus Appearance
- **Platform:** Web
- **Description:** WCAG 2.2 AAA defines minimum area and contrast for focus indicators
- **Do:** Use an indicator at least as large as a 2 CSS px perimeter with 3:1 state contrast
- **Don't:** Present this enhanced AAA criterion as an AA requirement or use a thin low-contrast outline
- **Code Example Good:** outline: 2px solid currentColor; outline-offset: 2px
- **Code Example Bad:** box-shadow: 0 0 1px low-contrast
- **Severity:** Medium

