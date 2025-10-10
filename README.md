# Digital Calipers - Outside Diameter Interactive

## Overview
This is a simplified HTML5 interactive game that teaches users how to measure the outside diameter of objects using digital calipers. The interactive has been restructured from a complex Adobe Captivate project into a clean, modern HTML5 structure.

## File Structure
```
├── index.html          # Main HTML file (original complex version)
├── index-simple.html   # Simplified HTML5 version
├── style.css           # Consolidated CSS styles
├── calliper.js         # Main JavaScript functionality
├── assets/             # Media assets
│   ├── audio/          # Audio files
│   └── images/         # Image files
├── dr/                 # Original data files
└── assets/             # Original asset folders (legacy)

Note: The former legacy `ar/` (original audio) directory has been removed after consolidation into `assets/audio/`.
```

## Game Features

### Core Functionality
- **Interactive Caliper Movement**: Use on‑screen buttons or keyboard arrows to open/close the jaws.
- **Digital Display**: Real‑time, three‑decimal precision with dynamic target scaling.
- **Drag & Drop (Free Placement)**: Stock can be placed freely; legacy auto-centering snap removed for authenticity.
- **Contact Detection**: When the caliper first reaches the stock, it locks further closing, plays a contact sound (`21147.mp3`), flashes a highlight, and clamps to the target.
- **Audio Feedback**: Distinct sounds for start, movement, placement, contact, and success (`22365.mp3`).
- **Input Validation**: Auto‑submit when the exact three‑decimal value is entered (tolerance ±0.001).
- **Success Feedback**: Visual message + success audio + focus management for accessibility.
- **Replay Loop**: "Play Again" button resets state (optionally re‑randomizing) and re‑arms contact feedback.
- **Help Dialog**: In‑app accessible instructions with focus trap and ESC to close.
- **Keyboard Drag Support**: Pick up stock with Enter/Space, move with arrows, drop with Enter.

### Controls
- **Caliper Movement**: Left arrow button / Left keyboard arrow = Open jaws (increase reading); Right = Close jaws (decrease reading).
- **Stock Drag**: Mouse drag OR keyboard drag mode (Enter/Space to pick up, arrows to move, Enter to drop, Escape to cancel).
- **Measurement Entry**: Type directly; auto‑checks after 5 characters (e.g. `0.858`).
- **Help Dialog**: Button opens modal; ESC or Close button exits.
- **Replay**: "Play Again" button appears after success.

### Game Flow (Current Implementation)
1. **Load**: Optional randomization may adjust target and increments.
2. **Place Stock**: Drag or keyboard‑drag into drop zone (free placement; no forced snap).
3. **Close Caliper**: Move right until contact (locks & plays contact cue) or adjust left/right to explore.
4. **Enter Value**: Input section appears (once stock placed). Type the three‑decimal measurement.
5. **Success**: On correct value, message + audio + focus shift; "Play Again" becomes available.
6. **Replay**: Press "Play Again" to reset (re-randomizes if enabled) and repeat.

## Technical Details

### HTML Structure
- Semantic HTML5 elements
- Accessible ARIA labels
- Responsive viewport settings
- Audio elements for sound effects

### CSS Features
- Responsive design with viewport scaling
- CSS animations and transitions
- Modern gradient and shadow effects
- Position-based caliper movement classes
- Digital display styling with retro green text effect

### JavaScript Architecture
- Object-oriented ES6 class structure
- Event-driven interaction handling
- State management for game progression
- Audio control and management
- Drag and drop API implementation
- Keyboard accessibility support

### Browser Compatibility
- Modern browsers supporting ES6
- HTML5 audio support required
- CSS3 transitions and animations
- Drag and drop API support

## Audio Files
Current mappings (IDs in `index.html` → file):
- `audio1` → `9915.mp3` (Initial / intro)
- `audio2` → `9893.mp3` (Movement boundary / limit or feedback)
- `audio3` → `21147.mp3` (Contact reached)
- `audio4` → `32682.mp3` (Stock placed)
- `audio5` → `14035.mp3` (Incorrect answer feedback)
- `successAudio` → `22365.mp3` (Success)

Playback helper resets `currentTime` before play to ensure rapid re‑trigger reliability.

## Customization

### Changing Target & Increment (Base Values)
Base (unscaled) values live in `calliper.js` as:
```javascript
this.baseTargetValue = 0.858;
this.baseIncrementValue = 0.039;
```
When randomization is enabled these are scaled: `targetValue = baseTargetValue * scale` and `incrementValue = baseIncrementValue * scale`.

### Feature Flags & URL Parameters (Updated)
Most functionality is now ON by default for the plain `index.html` (no params). You can selectively disable or enable features using query parameters. Parameters accept `1` (enable) or `0` (disable). If omitted, the default listed below applies.

| Flag | Default | Purpose | Enable Example | Disable Example |
|------|---------|---------|----------------|-----------------|
| `randomStock` | ON | Randomizes stock diameter on load (single re‑roll per reset) | `?randomStock=1` | `?randomStock=0` |
| `quantize` | ON | Uses integer step (jaw position) based target sizing | `?quantize=1` | `?quantize=0` |
| `calibrateApply` | ON | Applies piecewise + extrapolated calibration to target & increments | `?calibrateApply=1` | `?calibrateApply=0` |
| `calibrate` | OFF | Shows calibration diagnostics overlay (raw vs target, deltas) | `?calibrate=1` | (omit or `?calibrate=0`) |
| `legacyRandom` | OFF | Forces legacy continuous (non‑quantized) scaling path | `?legacyRandom=1` | (omit) |
| `visualCal` | 1.0 | Multiplier adjusting only rendered stock (purely cosmetic) | `?visualCal=1.05` | `?visualCal=1.0` |
| `debug` | OFF | Console + on‑screen debug overlay (if enabled in code) | `?debug=1` | (omit) |

Behavior precedence notes:
1. If `legacyRandom=1` is present, it overrides quantized sizing (calibration still applies if `calibrateApply` remains ON).
2. `calibrateApply=1` adjusts increment so the calibrated value is exactly reachable at an integer step count.
3. Diagnostics (`calibrate=1`) never alter gameplay—only display extra info.

#### Quick Reference Examples
| Scenario | URL Example / Shortcut |
|----------|-----------------------|
| Default production (no overlays) | `index.html` |
| Instructor diagnostics | `index.html?calibrate=1` (then press `D` to hide/show) |
| Disable calibration apply (use raw quantized target) | `index.html?calibrateApply=0` |
| Fixed (no randomization) baseline | `index.html?randomStock=0` |
| Legacy continuous random (no quantization) | `index.html?legacyRandom=1` |
| Diagnostics + debug overlay | `index.html?calibrate=1&debug=1` |
| Cosmetic visual widening only | `index.html?visualCal=1.08` |
| Minimal controlled test (static + calibration overlays) | `index.html?randomStock=0&calibrate=1` |

#### Disabling Multiple Features
Combine with `&`: e.g. `index.html?randomStock=0&quantize=0&calibrateApply=0` reverts to the original fixed uncalibrated base behavior.

#### Reverting to Pre‑Calibration Behavior
#### Keyboard Toggle (Diagnostics)
When `?calibrate=1` is active, press the `D` key (uppercase or lowercase) to toggle the visibility of the diagnostics debug boxes without reloading. A screen reader announcement ("Diagnostics shown" / "Diagnostics hidden") confirms the change.

#### Debug Styles Organization
For developer convenience, all debug-related CSS styles have been consolidated at the bottom of `style.css` under a dedicated "DEBUG MODE STYLES (?calibrate=1)" section. This includes:
- Moving jaw positioning line styles (`.moving-jaw-line`)
- Stock size debug overlays (`.stock-size-debug`, `.stock-diameter-debug`)  
- Debug state modifiers and animations

This organization makes it easy to locate, modify, and maintain debug-specific styling without hunting through the entire CSS file.

Use: `index.html?calibrateApply=0&calibrate=0` (optionally also `randomStock=0` to remove size variance).

### Reverting Randomization
Now that randomization is default, disable it with `?randomStock=0`.

### Styling Customization
The CSS uses CSS custom properties and can be easily customized:
- Colors: Modify color variables in the CSS
- Dimensions: Adjust container sizes and positions
- Animations: Customize transition timings and effects

## Development Notes

### Original Structure
The original project was built with Adobe Captivate and included:
- Complex timeline-based animations
- Multiple state management systems
- Embedded JSON data structures
- Base64 encoded images
- Legacy browser compatibility code

### Simplified Structure
The new version provides:
- Clean, maintainable code
- Modern web standards
- Improved accessibility
- Better performance
- Easier customization
- Cross-platform compatibility

### Accessibility Features (Expanded)
- Screen reader announcements via polite live region (status) & success confirmations.
- "Contact reached" announcement synced with audio/visual cue.
- Keyboard operable drag & placement (Enter/Space to pick up, arrows to move, Enter to drop, Escape to cancel).
- Help dialog: focus trap, ESC to close, ARIA `role="dialog"` with labels.
- Persistent instructions and input section to reduce context loss.
- Reduced motion support (disables pulsing animations if `prefers-reduced-motion`).
- High contrast focus outlines and semantic button roles.
- Input formatting guidance (visually hidden helper text, throttled incorrect feedback).

## Usage Instructions

### For Students
1. Load `index.html` (optionally with `?randomStock=1`).
2. Drag or keyboard-move the stock into the drop zone.
3. Close the caliper until contact (audio + highlight) then adjust if needed.
4. Enter the displayed measurement (three decimals) in the input field.
5. Receive immediate validation; success plays confirmation audio.
6. Press "Play Again" to practice with a new (possibly randomized) size.

### For Instructors
### Validation & Feedback Flow
- When five characters are entered, the answer auto‑checks.
- If incorrect: input briefly highlights red and an incorrect answer sound (`14035.mp3`) plays.
- If correct: success audio plays, message shows, and focus moves for accessible confirmation.

- Embed in LMS as a self-contained module (no server dependency).
- Use URL params to produce varied practice sets (`randomStock=1`).
- Adjust base target/increment for alternative exercises.
- Demonstrate accessibility by showing keyboard drag & help dialog.
- Disable randomization for assessments to ensure uniformity.

## Future Enhancements
- Multiple measurement exercise sets / progression
- Progress tracking & scoring
- Additional tools (inside diameter, depth, step)
- Multi-language / localization support
- Enhanced analytics (time to measure, attempts)
- Optional guidance overlays
- Mobile/touch drag optimization (fine control handles)

## Troubleshooting

### Audio Issues
- Ensure browser allows autoplay of audio
- Check audio file paths and formats
- Verify audio files are accessible

### Display Issues
- Check CSS file is properly linked
- Verify browser supports CSS3 features
- Test responsive scaling on different screen sizes

### Interaction Issues
- Ensure JavaScript is enabled.
- Confirm URL params aren't conflicting (e.g., extreme `visualCal`).
- Check console for debug logs when `?debug=1` is used.
- Verify contact lock isn’t misunderstood: caliper will not close past target once contact is made—open slightly (Left/Open) to re‑approach.

## Maintenance & Reversion Notes
- To restore legacy snap-to-target behavior: uncomment the old auto‑snap block in `moveRight()` (currently commented with LEGACY note).
- To disable contact lock: remove early return + contact clamp logic in `moveRight()` and associated flags.
- To remove randomization: delete `randomizeStock()` calls and query param parsing.
- To revert button labeling: change `playAgainBtn` ID/class and text back to `tryAgainBtn` and update JS constructor accordingly.

## License
Educational use permitted. Original content created for TSTC educational purposes.