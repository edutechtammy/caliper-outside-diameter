/**
 * Digital Calipers - Outside Diameter Interactive
 * Simplified HTML5 Game Implementation
 */

class DigitalCalipers {
    constructor() {
        this.position = 0;
        this.displayValue = 0.000;
        // Base measurement parameters (can be scaled for random stock sizing)
        this.baseTargetValue = 0.858;
        this.targetValue = this.baseTargetValue;
        this.positioned = false;
        this.maxPosition = 25;
        this.baseIncrementValue = 0.039; // base delta per position step
        this.incrementValue = this.baseIncrementValue;
        // Contact detection state (prevents over-closing once stock is in place)
        // To revert (remove contact lock):
        // 1. Delete contactReached/contactPlayed flags.
        // 2. In moveRight(), remove the early return and the contact detection block.
        // 3. (Optional) Restore previous auto-snap logic if desired.
        this.contactReached = false; // becomes true when caliper first reaches contact while positioned
        this.contactPlayed = false;  // ensures audio plays only once
        this.gameState = 'initial'; // initial, measuring, input, success
        // Feature flags (now ON by default). To disable, pass explicit ?flag=0
        const qs = window.location.search;
        const flagEnabled = (name, defaultOn = true) => {
            const on = new RegExp(`[?&]${name}=1`, 'i').test(qs);
            const off = new RegExp(`[?&]${name}=0`, 'i').test(qs);
            return off ? false : (on || defaultOn);
        };
        // Random stock randomization default: enabled
        this.randomizeStockEnabled = flagEnabled('randomStock', true);
        // Quantization default: enabled
        this.quantizeRandomStock = flagEnabled('quantize', true);
        // Legacy continuous mode still opt-in only (never default on)
        this.legacyRandomization = /[?&]legacyRandom=1/i.test(qs);
        // Optional visual calibration factor (?visualCal=1.05) to fine-tune rendered stock size without
        // altering measurement math. Defaults to 1.0 if not provided or invalid.
        const vcMatch = window.location.search.match(/[?&]visualCal=([0-9]*\.?[0-9]+)/i);
        this.visualCalibration = vcMatch ? Math.max(0.2, Math.min(2, parseFloat(vcMatch[1]))) : 1.0;
        // Calibration feature flags
        this.calibrationDiagnostics = /[?&]calibrate=1/i.test(qs); // diagnostics still opt-in
        // Apply calibrated target by default unless explicitly disabled (?calibrateApply=0)
        this.calibrationApply = flagEnabled('calibrateApply', true);
        this.calibrationDiagnosticsHidden = false; // runtime toggle (D key) when diagnostics active
        // Collected empirical (pixelDiameter, idealInches) pairs
        this.calibrationData = [
            { px: 168, in: 1.014 },
            { px: 132, in: 0.752 },
            { px: 126, in: 0.713 },
            { px: 114, in: 0.663 } // new point shows low-end deviation
        ];
        // Compute linear regression (least squares) on the fly for reference diagnostics
        this.calibrationCoefficients = this.computeRegression(this.calibrationData);
        this.stockScale = 1; // current scale factor applied to draggable stock & measurement logic
        this._baseStockDims = null; // captured original width/height for visual scaling reference

        // Documentation (runtime):
        // Default ON features: randomStock, quantize, calibrateApply.
        // To disable any: append ?randomStock=0, ?quantize=0, or ?calibrateApply=0.
        // Diagnostics (overlays with calibrated vs target) remain opt-in via ?calibrate=1
        // Legacy continuous (non-quantized) sizing: ?legacyRandom=1 (overrides quantize)

        this.initializeElements();
        this.bindEvents();
        this.initializeGame();
        this.liveRegion = document.getElementById('liveRegion');
        this.pulseCleared = false;
        this.instructionsLocked = false; // keep instructions visible after measurement phase begins
        this.inputSectionLocked = false; // NEW: persist input section after first reveal
        this._lastIncorrectAnnounce = 0; // throttle incorrect announcements
        this._announcedInputReady = false; // ensure one-time input section availability announcement
        this._announcedKeyboardHelp = false; // announce keyboard movement guidance once
        this.isHelpOpen = false; // help dialog state
    }

    initializeElements() {
        // Get DOM elements
        this.displayValueElement = document.getElementById('displayValue');
        this.instructions = document.getElementById('instructions');
        this.caliperContainer = document.getElementById('caliperContainer');
        this.leftArrow = document.getElementById('leftArrow');
        this.rightArrow = document.getElementById('rightArrow');
        this.inputSection = document.getElementById('inputSection');
        this.measurementInput = document.getElementById('measurementInput');
        this.successMessage = document.getElementById('successMessage');
        this.animationCircle = document.getElementById('animationCircle');
        this.measureCircle = document.getElementById('measureCircle');
        this.textEntryCircle = document.getElementById('textEntryCircle');
        this.draggableStock = document.getElementById('draggableStock');
        this.dropZone = document.getElementById('dropZone');
        this.dragDropArea = document.getElementById('dragDropArea');
        this.gameContainer = document.getElementById('gameContainer'); // Parent for absolute positioning of draggable stock
        this.stockDebug = document.getElementById('stockDebug');
        this.stockDiameterDebug = document.getElementById('stockDiameterDebug');
        this.movingJawLine = document.getElementById('movingJawLine'); // Moving jaw positioning line
        this.isKeyboardDragging = false;
        this.playAgainBtn = document.getElementById('playAgainBtn');
        // Help dialog elements
        this.helpButton = document.getElementById('helpButton');
        this.helpDialog = document.getElementById('helpDialog');
        this.helpOverlay = document.getElementById('helpOverlay');
        this.closeHelpBtn = document.getElementById('closeHelpBtn');

        // Audio elements
        this.audioElements = {
            audio1: document.getElementById('audio1'),
            audio2: document.getElementById('audio2'),
            audio3: document.getElementById('audio3'),
            audio4: document.getElementById('audio4'),
            audio5: document.getElementById('audio5'),
            successAudio: document.getElementById('successAudio')
        };
    }

    bindEvents() {
        // Arrow button events
        this.leftArrow.addEventListener('click', () => this.moveLeft());
        this.rightArrow.addEventListener('click', () => this.moveRight());

        // Input events
        this.measurementInput.addEventListener('input', (e) => this.handleInput(e));
        this.measurementInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkAnswer();
            }
        });

        // Drag and drop events
        this.draggableStock.addEventListener('dragstart', (e) => this.handleDragStart(e));
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));

        // Pointer-based dragging (mouse + touch) for reliability across browsers
        this.draggableStock.addEventListener('mousedown', (e) => this.startPointerDrag(e));
        this.draggableStock.addEventListener('touchstart', (e) => this.startPointerDrag(e));

        // Hover effects for buttons
        this.leftArrow.addEventListener('mouseenter', () => this.addHoverEffect(this.leftArrow));
        this.leftArrow.addEventListener('mouseleave', () => this.removeHoverEffect(this.leftArrow));
        this.rightArrow.addEventListener('mouseenter', () => this.addHoverEffect(this.rightArrow));
        this.rightArrow.addEventListener('mouseleave', () => this.removeHoverEffect(this.rightArrow));

        // Keyboard controls
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Keyboard drag toggle on stock element
        this.draggableStock.addEventListener('keydown', (e) => this.handleStockKeyDown(e));
        this.draggableStock.addEventListener('keyup', (e) => this.handleStockKeyUp(e));

        if (this.playAgainBtn) {
            this.playAgainBtn.addEventListener('click', () => this.handleTryAgain());
        }

        // Help dialog events
        if (this.helpButton) {
            this.helpButton.addEventListener('click', () => this.openHelp());
            this.helpButton.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openHelp();
                }
            });
        }
        if (this.closeHelpBtn) {
            this.closeHelpBtn.addEventListener('click', () => this.closeHelp());
        }
        document.addEventListener('keydown', (e) => {
            if (this.isHelpOpen && e.key === 'Escape') {
                e.preventDefault();
                this.closeHelp();
            } else if (this.isHelpOpen && e.key === 'Tab') {
                this.trapFocusInHelp(e);
            }
        });
    }

    initializeGame() {
        // Apply randomization BEFORE initial display if enabled
        if (this.randomizeStockEnabled && !this._randomizedOnce) {
            this.randomizeStock();
            this._randomizedOnce = true; // only once per full load
        }
        this.updateDisplay();
        this.updateCaliperPosition();
        this.updateMovingJawLineState(); // Initialize jaw line state
        this.showAnimationCircle();
        this.playAudio('audio1');

        // Record initial draggable stock position (after layout) for accurate resets
        if (this.draggableStock && !this._initialStockPos) {
            const left = parseInt(window.getComputedStyle(this.draggableStock).left, 10) || 0;
            const top = parseInt(window.getComputedStyle(this.draggableStock).top, 10) || 0;
            this._initialStockPos = { left, top };
        }
    }

    moveLeft() {
        if (this.position < this.maxPosition) {
            this.position += 1;
            this.displayValue = Math.round((this.displayValue + this.incrementValue) * 1000) / 1000;

            this.updateDisplay();
            this.updateCaliperPosition();
            this.hideAnimationCircle();

            if (this.position >= this.maxPosition) {
                this.position = this.maxPosition;
                this.displayValue = 0.986;
                this.showMeasureCircle();
                this.playAudio('audio2');
                this.hideAnimationCircle();
            }

            // If we have opened past the contact (displayValue > target), allow a new contact event later
            if (this.positioned && this.contactReached && this.displayValue > this.targetValue) {
                this.contactReached = false; // lock released
                // Do NOT reset contactPlayed so audio only plays first time per placement unless reopened beyond contact
                // If you want audio to replay every time they close again, uncomment next line:
                // this.contactPlayed = false;
            }
        }
    }

    moveRight() {
        // Block only if stock is positioned AND currently at exact contact (display equals target)
        if (this.positioned && this.contactReached && this.displayValue === this.targetValue) {
            return; // remain at contact; user may still move left
        }

        if (this.position > 0) {
            this.position -= 1;
            this.displayValue = Math.round((this.displayValue - this.incrementValue) * 1000) / 1000;

            // Contact detection: when positioned and value would dip below target, clamp & trigger effects
            if (this.positioned && !this.contactReached && this.displayValue <= this.targetValue) {
                this.displayValue = this.targetValue; // clamp to target
                this.contactReached = true;
                if (!this.contactPlayed) {
                    this.triggerContactEffects();
                }
            }

            this.updateDisplay();
            this.updateCaliperPosition();

            if (this.position <= 0) {
                this.position = 0;
                this.displayValue = 0.000;
                this.playAudio('audio2');
            }
        }
    }

    // Centralize contact feedback (audio + SR announcement + visual flash)
    triggerContactEffects() {
        // audio3 element holds 21147.mp3 per index.html mapping
        this.playAudio('audio3');
        this.announce('Contact reached');
        this.contactPlayed = true;
        if (this.caliperContainer) {
            this.caliperContainer.classList.remove('contact-highlight');
            // Force reflow to restart animation if applied consecutively
            // eslint-disable-next-line no-unused-expressions
            this.caliperContainer.offsetWidth;
            this.caliperContainer.classList.add('contact-highlight');
            // Remove highlight after animation completes (fallback 700ms)
            setTimeout(() => {
                if (this.caliperContainer) this.caliperContainer.classList.remove('contact-highlight');
            }, 700);
        }
    }

    updateDisplay() {
        if (this.displayValueElement) {
            this.displayValueElement.textContent = this.displayValue.toFixed(3);
        }
    }

    updateCaliperPosition() {
        if (this.caliperContainer) {
            // Remove all position classes
            for (let i = 0; i <= this.maxPosition; i++) {
                this.caliperContainer.classList.remove(`position-${i}`);
            }
            // Add current position class
            this.caliperContainer.classList.add(`position-${this.position}`);

            // Update moving jaw line visual state
            this.updateMovingJawLineState();
        }
    }

    updateMovingJawLineState() {
        if (!this.caliperContainer || !this.movingJawLine) return;

        // Calculate caliper position mathematically based on this.position
        // FIXED: Match actual CSS positions - position-0: 174px, position-1: 150px (24px jump), then 6px per step
        const baseCaliperLeft = 174; // position-0 (starting position)
        let calculatedCaliperLeft;

        if (this.position === 0) {
            calculatedCaliperLeft = 174; // position-0
        } else {
            calculatedCaliperLeft = 150 - ((this.position - 1) * 6); // position-1 starts at 150px, then -6px per step
        }

        // Position the line at the moving jaw (right side of caliper)
        // Using your manually adjusted values but based on calculated position
        const jawLineLeft = calculatedCaliperLeft + 570; // Your manually tuned offset
        const jawLineTop = 550; // Your manually tuned vertical position

        this.movingJawLine.style.position = 'absolute';
        this.movingJawLine.style.left = jawLineLeft + 'px';
        this.movingJawLine.style.top = jawLineTop + 'px';
        this.movingJawLine.style.display = 'block';
        this.movingJawLine.style.zIndex = '15000';

        // Show line only in calibration diagnostics mode
        if (this.calibrationDiagnostics && !this.calibrationDiagnosticsHidden) {
            this.movingJawLine.style.visibility = 'visible';
            this.movingJawLine.style.opacity = '1';
        } else {
            this.movingJawLine.style.visibility = 'hidden';
            this.movingJawLine.style.opacity = '0';
        }

        // Add visual state classes based on game state
        if (this.positioned) {
            this.caliperContainer.classList.add('stock-positioned');
        } else {
            this.caliperContainer.classList.remove('stock-positioned');
        }

        if (this.gameState === 'success') {
            this.caliperContainer.classList.add('measurement-complete');
        } else {
            this.caliperContainer.classList.remove('measurement-complete');
        }
    }

    showInputSection() {
        if (this.inputSection) {
            this.inputSection.style.display = 'block';
            this.inputSection.classList.add('visible');
            this.inputSection.setAttribute('aria-hidden', 'false');
            this.showTextEntryCircle();
            this.hideMeasureCircle();
            this.inputSectionLocked = true; // lock once shown
            // Small timeout to ensure CSS transition triggers after display block.
            requestAnimationFrame(() => {
                if (this.measurementInput) {
                    this.measurementInput.focus();
                }
            });
            if (!this._announcedInputReady) {
                this.announce('Measurement input ready. Enter the outside diameter to three decimals.');
                this._announcedInputReady = true;
            }
        }
        this.gameState = 'input';
    }

    hideInputSection() {
        if (this.inputSection && !this.inputSectionLocked) {
            this.inputSection.classList.remove('visible');
            this.inputSection.style.display = 'none';
            this.hideTextEntryCircle();
            this.inputSection.setAttribute('aria-hidden', 'true');
        }
    }

    showTextEntryCircle() {
        if (this.textEntryCircle) this.textEntryCircle.style.display = 'block';
        if (this.inputSection) {
            this.inputSection.style.display = 'block';
            this.inputSection.classList.add('visible');
            this.inputSectionLocked = true; // ensure locked if triggered this path
            this.inputSection.setAttribute('aria-hidden', 'false');
        }
    }

    handleInput(event) {
        let value = event.target.value.trim();
        value = value.replace(/[^0-9.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts.shift() + '.' + parts.join('');
        }
        const m = value.match(/^(\d+)(\.(\d{0,3})?)?/);
        if (m) {
            value = m[0];
        }
        event.target.value = value;
        if (value.length === 5) {
            this.checkAnswer();
        } else if (value.length > 0) {
            // Throttle polite incorrect feedback every 2 seconds max
            const now = Date.now();
            if (now - this._lastIncorrectAnnounce > 2000) {
                this._lastIncorrectAnnounce = now;
                this.announce('Not correct yet. Keep trying.');
            }
        }
    }

    checkAnswer() {
        const userInput = parseFloat(this.measurementInput.value);
        if (Math.abs(userInput - this.targetValue) < 0.001) {
            this.showSuccess();
        } else {
            this.showError();
        }
    }

    showSuccess() {
        if (this.successMessage) {
            this.successMessage.textContent = 'Success! You Got It!';
            this.successMessage.style.display = 'block';
            this.successMessage.setAttribute('tabindex', '-1');
        }
        // Keep input visible; do not reset automatically
        this.playAudio('successAudio');
        this.gameState = 'success';
        this.updateMovingJawLineState(); // Update visual state for success
        this.announce('Success! You got it. Measurement is zero point eight five eight inches.');
        if (this.playAgainBtn) {
            this.playAgainBtn.style.display = 'inline-block';
            // Move focus to success message after short delay then to Try Again button for next action discoverability
            setTimeout(() => {
                if (this.successMessage) {
                    this.successMessage.focus();
                }
                setTimeout(() => {
                    if (this.playAgainBtn) this.playAgainBtn.focus();
                }, 800);
            }, 100);
        }
    }

    handleTryAgain() {
        // Reset state but keep panel visible and clear success message/button
        this.position = 0;
        this.displayValue = 0.000;
        this.positioned = false;
        this.gameState = 'initial';
        // Reset contact detection so initial contact feedback (audio + highlight) can occur again
        this.contactReached = false;
        this.contactPlayed = false;
        if (this.caliperContainer) {
            this.caliperContainer.classList.remove('contact-highlight');
        }
        // Re-randomize on Try Again if feature enabled (user request)
        if (this.randomizeStockEnabled) {
            this.randomizeStock();
        }
        if (this.successMessage) {
            this.successMessage.style.display = 'none';
        }
        if (this.playAgainBtn) {
            this.playAgainBtn.style.display = 'none';
        }
        if (this.measurementInput) {
            this.measurementInput.value = '';
            // Return focus to draggable stock to restart the flow logically
            if (this.draggableStock) {
                this.draggableStock.focus();
            }
        }
        // Return caliper and draggable stock to initial states
        this.updateDisplay();
        this.updateCaliperPosition();
        // Move draggable stock back to original coordinates stored at initialization
        if (this.draggableStock && this._initialStockPos) {
            this.draggableStock.style.left = this._initialStockPos.left + 'px';
            this.draggableStock.style.top = this._initialStockPos.top + 'px';
            this.draggableStock.style.outline = '';
            // Do NOT reapply pulse-hint; requirement: once user has interacted, pulsing glow stays off.
            this.pulseCleared = true;
            this.draggableStock.classList.remove('pulse-hint');
            this.draggableStock.style.boxShadow = 'none';
        }
        this.instructionsLocked = false; // allow initial flow again
        this.inputSectionLocked = false; // allow logic to re-lock on next flow
        this.announce('Reset. Try again.');
        this._announcedInputReady = false; // allow re-announcement on next reveal
    }

    showError() {
        // Visual feedback for incorrect answer
        this.measurementInput.style.borderColor = '#ff0000';
        this.measurementInput.style.backgroundColor = '#ffe6e6';

        // Auditory feedback for incorrect answer (audio5: 14035.mp3)
        this.playAudio('audio5');

        setTimeout(() => {
            this.measurementInput.style.borderColor = '#ccc';
            this.measurementInput.style.backgroundColor = '#ffffff';
        }, 1000);
    }

    resetGame() {
        this.position = 0;
        this.displayValue = 0.000;
        this.positioned = false;
        this.gameState = 'initial';
        // On full reset (manual call), optionally re-randomize if feature enabled
        if (this.randomizeStockEnabled) {
            this.randomizeStock();
        }

        this.updateDisplay();
        this.updateCaliperPosition();
        this.updateMovingJawLineState(); // Reset visual states
        this.inputSectionLocked = false;
        this.hideInputSection();
        if (this.successMessage) this.successMessage.style.display = 'none';
        if (this.measurementInput) this.measurementInput.value = '';
        this.showAnimationCircle();
        this.instructionsLocked = false;
    }

    // Animation circle management
    showAnimationCircle() {
        if (this.animationCircle) {
            this.animationCircle.style.display = 'block';
        }
        if (this.instructions) {
            this.instructions.style.display = 'block';
        }
        // Fallback safety after short delay
        setTimeout(() => this.ensureInstructionsVisible(), 100);
    }

    hideAnimationCircle() {
        if (this.animationCircle) {
            this.animationCircle.style.display = 'none';
        }
        // Only hide early instructions if not yet locked on
        if (this.instructions && !this.instructionsLocked) {
            this.instructions.style.display = 'none';
        }
    }

    ensureInstructionsVisible() {
        if (this.animationCircle && this.animationCircle.style.display !== 'none' && this.instructions) {
            if (this.instructions.style.display === 'none') {
                this.instructions.style.display = 'block';
            }
        }
    }

    showMeasureCircle() {
        if (this.measureCircle) {
            this.measureCircle.style.display = 'block';
        }
        // Lock instructions visible from now on
        if (this.instructions) {
            this.instructions.style.display = 'block';
            this.instructionsLocked = true;
        }
    }

    hideMeasureCircle() {
        if (this.measureCircle) {
            this.measureCircle.style.display = 'none';
        }
    }

    showTextEntryCircle() {
        if (this.textEntryCircle) this.textEntryCircle.style.display = 'block';
        if (this.inputSection) {
            this.inputSection.style.display = 'block';
            this.inputSection.classList.add('visible');
            this.inputSectionLocked = true; // ensure locked if triggered this path
        }
    }

    hideTextEntryCircle() {
        if (this.textEntryCircle) {
            this.textEntryCircle.style.display = 'none';
        }
    }

    // Drag and drop functionality
    handleDragStart(event) {
        event.dataTransfer.setData('text/plain', 'stock');
        this.clearPulse();
        // Ensure any residual glow is removed once picked up
        if (this.draggableStock) {
            this.draggableStock.classList.remove('pulse-hint');
            this.draggableStock.style.boxShadow = 'none';
        }
        if (this.draggableStock) this.draggableStock.setAttribute('aria-grabbed', 'true');
        this.announce('Stock picked up. Use arrow keys or drag to move.');
    }

    handleDragOver(event) {
        event.preventDefault();
    }

    handleDrop(event) {
        event.preventDefault();
        const data = event.dataTransfer.getData('text/plain');

        if (data === 'stock') {
            this.positioned = true;
            this.updateMovingJawLineState(); // Update visual state
            this.playAudio('audio4');
            // Snap right edge of stock to right edge of drop zone (while keeping future reposition possible)
            this.snapRightEdgeToDropZone();
            this.updateStockDebug('placed');
            this.announce('Stock placed');
            if (this.gameState !== 'success') {
                this.showInputSection();
            }
        }
    }

    // Pointer-based dragging implementation
    startPointerDrag(event) {
        // Prevent native drag image and text selection
        if (event.type === 'touchstart') {
            if (event.touches && event.touches.length > 0) {
                event = event.touches[0];
            }
        } else {
            event.preventDefault();
        }
        // Removed audio5 trigger (not related to drag logic per latest requirement)
        // Remove pulsing glow when user begins pointer-based drag
        this.clearPulse();
        if (this.draggableStock) {
            this.draggableStock.classList.remove('pulse-hint');
            this.draggableStock.style.boxShadow = 'none';
        }

        const areaRect = this.gameContainer.getBoundingClientRect();
        const stockRect = this.draggableStock.getBoundingClientRect();

        // Starting positions
        this._dragStart = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            left: stockRect.left - areaRect.left,
            top: stockRect.top - areaRect.top
        };

        // Bind move and end handlers
        this._onPointerMove = (ev) => this.onPointerMove(ev);
        this._onPointerEnd = (ev) => this.onPointerEnd(ev);

        document.addEventListener('mousemove', this._onPointerMove);
        document.addEventListener('mouseup', this._onPointerEnd, { once: true });
        document.addEventListener('touchmove', this._onPointerMove, { passive: false });
        document.addEventListener('touchend', this._onPointerEnd, { once: true });
    }

    onPointerMove(event) {
        if (event.type === 'touchmove') {
            if (event.touches && event.touches.length > 0) {
                event.preventDefault();
                event = event.touches[0];
            }
        }

        const areaRect = this.gameContainer.getBoundingClientRect();
        const stockRect = this.draggableStock.getBoundingClientRect();

        const dx = event.clientX - this._dragStart.pointerX;
        const dy = event.clientY - this._dragStart.pointerY;

        // New desired position within the drag area
        let newLeft = this._dragStart.left + dx;
        let newTop = this._dragStart.top + dy;

        // Constrain within gameContainer with 20px margin
        const margin = 20;
        const maxLeft = areaRect.width - stockRect.width - margin;
        const maxTop = areaRect.height - stockRect.height - margin;
        newLeft = Math.max(margin, Math.min(newLeft, maxLeft));
        newTop = Math.max(margin, Math.min(newTop, maxTop));

        // Apply new position
        this.draggableStock.style.left = `${Math.round(newLeft)}px`;
        this.draggableStock.style.top = `${Math.round(newTop)}px`;
    }

    onPointerEnd(event) {
        // Cleanup listeners
        document.removeEventListener('mousemove', this._onPointerMove);
        document.removeEventListener('touchmove', this._onPointerMove);

        // Check intersection with drop zone
        const stockRect = this.draggableStock.getBoundingClientRect();
        const dropRect = this.dropZone.getBoundingClientRect();

        const intersects = !(
            stockRect.right < dropRect.left ||
            stockRect.left > dropRect.right ||
            stockRect.bottom < dropRect.top ||
            stockRect.top > dropRect.bottom
        );

        if (intersects) {
            // Mirror handleDrop's success behavior (without snapping)
            this.positioned = true;
            this.updateMovingJawLineState(); // Update visual state
            this.playAudio('audio4');
            this.snapRightEdgeToDropZone();
            this.updateStockDebug('placed');
            this.announce('Stock placed. Enter the measurement.');
            if (this.gameState !== 'success') {
                this.showInputSection();
            }
        }

        // Reset temp state
        this._dragStart = null;
        this._onPointerMove = null;
        this._onPointerEnd = null;
        if (this.draggableStock) this.draggableStock.setAttribute('aria-grabbed', 'false');
    }

    // --- Keyboard drag support ---
    handleStockKeyDown(event) {
        // Toggle pick up with Enter/Space
        if ((event.key === 'Enter' || event.key === ' ') && !this.isKeyboardDragging) {
            event.preventDefault();
            this.isKeyboardDragging = true;
            this.clearPulse();
            if (this.draggableStock) {
                this.draggableStock.classList.remove('pulse-hint');
                this.draggableStock.style.boxShadow = 'none';
            }
            if (this.draggableStock) this.draggableStock.setAttribute('aria-grabbed', 'true');
            this.announce('Stock picked up. Use arrow keys to move. Press Enter to drop.');
            // Ensure element is visible and focus ring shows
            this.draggableStock.style.outline = '2px solid #1b3fff';
            return;
        }

        if (this.isKeyboardDragging) {
            const step = 10; // pixels per keypress
            const areaRect = this.gameContainer.getBoundingClientRect();
            const stockRect = this.draggableStock.getBoundingClientRect();

            let left = parseInt(this.draggableStock.style.left || '262', 10);
            let top = parseInt(this.draggableStock.style.top || '54', 10);

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    left -= step;
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    left += step;
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    top -= step;
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    top += step;
                    break;
                case 'Enter':
                    event.preventDefault();
                    // Drop if intersecting
                    this.tryCompleteKeyboardDrop();
                    return;
                case 'Escape':
                    event.preventDefault();
                    // Cancel dragging
                    this.isKeyboardDragging = false;
                    this.draggableStock.style.outline = '';
                    if (this.draggableStock) this.draggableStock.setAttribute('aria-grabbed', 'false');
                    return;
            }

            // Constrain within gameContainer with 20px margin
            const margin = 20;
            const maxLeft = areaRect.width - stockRect.width - margin;
            const maxTop = areaRect.height - stockRect.height - margin;
            left = Math.max(margin, Math.min(left, maxLeft));
            top = Math.max(margin, Math.min(top, maxTop));

            this.draggableStock.style.left = `${left}px`;
            this.draggableStock.style.top = `${top}px`;
        }
    }

    handleStockKeyUp(event) {
        // Spacebar keyup ends dragging and attempts drop
        if (event.key === ' ' && this.isKeyboardDragging) {
            event.preventDefault();
            this.tryCompleteKeyboardDrop();
        }
    }

    tryCompleteKeyboardDrop() {
        const stockRect = this.draggableStock.getBoundingClientRect();
        const dropRect = this.dropZone.getBoundingClientRect();
        const intersects = !(
            stockRect.right < dropRect.left ||
            stockRect.left > dropRect.right ||
            stockRect.bottom < dropRect.top ||
            stockRect.top > dropRect.bottom
        );
        if (intersects) {
            this.positioned = true;
            this.updateMovingJawLineState(); // Update visual state
            this.playAudio('audio4');
            this.snapRightEdgeToDropZone();
            this.updateStockDebug('placed');
            this.isKeyboardDragging = false;
            this.draggableStock.style.outline = '';
            if (this.draggableStock) this.draggableStock.setAttribute('aria-grabbed', 'false');
            this.announce('Stock placed. Enter the measurement.');
            if (this.gameState !== 'success') {
                this.showInputSection();
            }
        }
    }

    // Accessibility helpers
    announce(message) {
        if (!this.liveRegion) return;
        this.liveRegion.textContent = '';
        // Short delay ensures screen readers detect change
        setTimeout(() => { this.liveRegion.textContent = message; }, 10);
    }

    clearPulse() {
        if (this.pulseCleared) return;
        if (this.draggableStock && this.draggableStock.classList.contains('pulse-hint')) {
            this.draggableStock.classList.remove('pulse-hint');
        }
        this.pulseCleared = true;
    }

    snapStockIntoZone() {
        // DEPRECATED: Formerly auto-centered stock in drop zone.
        // Left as a harmless no-op for potential rollback; call sites removed for free placement.
        if (this.debugLog) {
            this.debugLog.push({ t: performance.now(), event: 'snapStockIntoZone_called_noop' });
        } else {
            // Fallback minimal trace
            console.log('snapStockIntoZone() noop (disabled)');
        }
    }

    // Align the right edge of the draggable stock with the right edge of the drop zone while keeping top unchanged.
    snapRightEdgeToDropZone() {
        if (!this.draggableStock || !this.dropZone || !this.gameContainer) return;
        const containerRect = this.gameContainer.getBoundingClientRect();
        const dropRect = this.dropZone.getBoundingClientRect();
        const stockRect = this.draggableStock.getBoundingClientRect();
        // Current top in container coordinates
        const currentTop = stockRect.top - containerRect.top;
        // Desired new left: dropZone.right - stockWidth relative to container
        const newLeft = (dropRect.right - containerRect.left) - stockRect.width;
        // Apply positioning (rounded for crisp pixels)
        this.draggableStock.style.left = Math.round(newLeft) + 'px';
        this.draggableStock.style.top = Math.round(currentTop) + 'px';
    }

    // Audio management
    playAudio(audioId) {
        if (this.audioElements[audioId]) {
            this.audioElements[audioId].currentTime = 0;
            this.audioElements[audioId].play().catch(e => {
                console.log('Audio play failed:', e);
            });
        }
    }

    /**
     * Randomize stock size and adjust measurement parameters accordingly.
     * Scale factor range: 0.5x to 1.125x of original size (upper bound reduced ~10% per request).
     * Target value and increment scale linearly with diameter.
     * Reversible: disable by removing ?randomStock=1 from URL; no core constants overwritten.
     */
    randomizeStock() {
        if (!this.draggableStock) return;
        // Capture base dimensions once (strip any inline scaling first)
        if (!this._baseStockDims) {
            // Ensure no transform affecting bounding box
            this.draggableStock.style.transform = 'none';
            const rect = this.draggableStock.getBoundingClientRect();
            // Use computed style width/height if explicit style set; fallback to rect
            const cs = window.getComputedStyle(this.draggableStock);
            const baseW = parseFloat(cs.width) || rect.width;
            const baseH = parseFloat(cs.height) || rect.height;
            this._baseStockDims = { w: baseW, h: baseH };
        }
        // If legacy continuous randomization explicitly requested OR quantization disabled (and not applying quantized calibration), keep old path
        // Note: calibrateApply now prefers quantized path when quantizeRandomStock is true.
        if (this.legacyRandomization || (!this.quantizeRandomStock && !this.calibrationApply)) {
            const minScale = 0.5;
            // Reduced max scale to remove largest former diameter option
            const maxScale = 1.05; // previously 1.125
            const scale = +(minScale + Math.random() * (maxScale - minScale)).toFixed(3);
            this.stockScale = scale;
            const visualFactor = scale * this.visualCalibration;
            const newW = (this._baseStockDims.w * visualFactor).toFixed(2);
            const newH = (this._baseStockDims.h * visualFactor).toFixed(2);
            this.draggableStock.style.width = newW + 'px';
            this.draggableStock.style.height = newH + 'px';
            this.draggableStock.style.borderRadius = (Math.min(newW, newH) / 2) + 'px';
            this.draggableStock.style.transform = 'none';
            this.targetValue = +(this.baseTargetValue * scale).toFixed(3);
            // If applying calibration, override targetValue using piecewise mapping from actual pixel diameter
            if (this.calibrationApply) {
                const px = parseFloat(newW); // width after scaling is effective diameter
                const calibrated = this.computePiecewiseCalibratedInches(px);
                this.targetValue = calibrated; // use calibrated inches directly
                // Recompute increment so that maximum open (position maxPosition) roughly spans plausible range
                // Maintain same number of steps to reach target: derive steps from base ratio
                const baseStepsApprox = Math.round(this.baseTargetValue / this.baseIncrementValue) || 22;
                this.incrementValue = +(this.targetValue / baseStepsApprox).toFixed(3);
            } else {
                this.incrementValue = +(this.baseIncrementValue * scale).toFixed(3);
            }
            this.displayValue = +(this.incrementValue * this.position).toFixed(3);
            if (this.displayValueElement) this.displayValueElement.textContent = this.displayValue.toFixed(3);
            if (this.debug) this.debug(`randomizeStock legacy scale=${scale} target=${this.targetValue} inc=${this.incrementValue}`);
            this.updateStockDebug('randomized');
            return;
        }

        // Quantized mode: choose an integer number of increments (steps) for target contact.
        // We want: targetValue = steps * incrementValue (after scaling) and an integral step index alignment.
        // Strategy: pick steps in a band relative to original base target step count.
        const baseStepsApprox = Math.round(this.baseTargetValue / this.baseIncrementValue); // ~22
        // Allow a range around this (e.g., 18–24) to provide variety but stay within maxPosition.
        // PRODUCTION FIX: Raised minSteps from 14 to 18 to avoid problematic calibrated values
        // (0.608, 0.640, 0.663) which correspond to steps 15-17 and cause jaw alignment issues
        const minSteps = 18;
        // Reduce maximum steps so largest diameter (near upper bound) is excluded
        const maxSteps = Math.min(this.maxPosition - 1, 24); // was 26
        const steps = Math.floor(minSteps + Math.random() * (maxSteps - minSteps + 1));

        // Derive a scale that will make target ≈ baseIncrementValue * steps * scaleFactor
        // We keep incrementValue scaled linearly by scale so that targetValue = baseTargetValue * scale matches steps * (baseIncrementValue * scale)
        // Solve for scale: baseTargetValue * scale ≈ steps * baseIncrementValue * scale => baseTargetValue ≈ steps * baseIncrementValue
        // Since baseTargetValue (0.858) is fixed and baseIncrementValue * steps may differ slightly, we accept a minor deviation and instead set logical values explicitly.
        // We'll set incrementValue = baseIncrementValue (unscaled) and targetValue = steps * baseIncrementValue, then derive scale = targetValue / baseTargetValue for visual.
        this.incrementValue = +this.baseIncrementValue.toFixed(3);
        this.targetValue = +(steps * this.incrementValue).toFixed(3);
        let scale = +(this.targetValue / this.baseTargetValue).toFixed(4);
        // Constrain scale to original bounds to avoid extreme visuals
        scale = Math.max(0.5, Math.min(1.05, scale));
        this.stockScale = scale;

        // Visual sizing: base width/height * scale * visualCalibration
        const visualFactor = scale * this.visualCalibration;
        let rawW = this._baseStockDims.w * visualFactor;
        let rawH = this._baseStockDims.h * visualFactor;
        // Snap to nearest 6px grid (alignment with 6px jaw movement perception)
        const snap = (val) => Math.max(12, Math.round(val / 6) * 6); // enforce minimum sensible diameter
        const newW = snap(rawW);
        const newH = snap(rawH);
        this.draggableStock.style.width = newW + 'px';
        this.draggableStock.style.height = newH + 'px';
        this.draggableStock.style.borderRadius = (Math.min(newW, newH) / 2) + 'px';
        this.draggableStock.style.transform = 'none';

        // Recompute scale used logically if snapping altered aspect (keep logic independent of snap)
        // We intentionally do NOT alter targetValue/incrementValue after snap to preserve exact step math; snap is purely cosmetic.

        // If applying calibration, compute calibrated inches from pixel width then snap to nearest step (maintain integer step reachability)
        if (this.calibrationApply) {
            const rawPx = newW; // snapped width already grid-aligned
            const rawCal = this.computePiecewiseCalibratedInches(rawPx);
            this._rawCalibratedValue = rawCal;
            // Maintain chosen integer steps from earlier randomization if it provides a close ratio; otherwise adjust steps.
            let useSteps = steps;
            const candidateTarget = steps * this.incrementValue;
            const diff = Math.abs(candidateTarget - rawCal);
            // If mismatch larger than half an increment, choose closest step count to rawCal
            if (diff > (this.incrementValue / 2)) {
                useSteps = Math.max(1, Math.min(this.maxPosition - 1, Math.round(rawCal / this.incrementValue)));
            }
            // Recompute increment so that useSteps * incrementValue == rawCal (exact fit)
            this.incrementValue = +(rawCal / useSteps).toFixed(3);
            this.targetValue = +(useSteps * this.incrementValue).toFixed(3);
            this._snappedCalibratedSteps = useSteps;
            this._snappedCalibratedValue = this.targetValue;
        } else {
            this._rawCalibratedValue = undefined;
            this._snappedCalibratedValue = undefined;
            this._snappedCalibratedSteps = undefined;
        }

        // Update current display value relative to position (position counts increments from 0 outward when opening)
        this.displayValue = +(this.incrementValue * this.position).toFixed(3);
        if (this.displayValueElement) this.displayValueElement.textContent = this.displayValue.toFixed(3);

        if (this.debug) {
            let extra = '';
            if (this.calibrationApply && this._rawCalibratedValue !== undefined) {
                extra = ` rawCal=${this._rawCalibratedValue.toFixed(3)} target=${this._snappedCalibratedValue.toFixed(3)} steps=${this._snappedCalibratedSteps} inc=${this.incrementValue.toFixed(3)}`;
            }
            this.debug(`randomizeStock quantized steps=${steps} target=${this.targetValue} inc=${this.incrementValue} scale≈${scale} visualCal=${this.visualCalibration} w=${newW} h=${newH}${extra}`);
        }
        this.updateStockDebug('randomized');
    }

    updateStockDebug(reason) {
        if ((!this.stockDebug && !this.stockDiameterDebug) || !this.draggableStock) return;
        // Hide entirely unless diagnostics flag is active
        if (!this.calibrationDiagnostics) {
            if (this.stockDebug) {
                this.stockDebug.style.display = 'none';
                this.stockDebug.setAttribute('aria-hidden', 'true');
            }
            if (this.stockDiameterDebug) {
                this.stockDiameterDebug.style.display = 'none';
                this.stockDiameterDebug.setAttribute('aria-hidden', 'true');
            }
            return;
        }
        if (this.calibrationDiagnosticsHidden) {
            if (this.stockDebug) { this.stockDebug.style.display = 'none'; this.stockDebug.setAttribute('aria-hidden', 'true'); }
            if (this.stockDiameterDebug) { this.stockDiameterDebug.style.display = 'none'; this.stockDiameterDebug.setAttribute('aria-hidden', 'true'); }
            return;
        }
        const w = parseFloat(this.draggableStock.style.width) || this.draggableStock.getBoundingClientRect().width;
        // Use the exact logical targetValue (the measurement students must enter) for both displays.
        const commonInches = this.targetValue.toFixed(3);
        if (this.calibrationDiagnostics) {
            if (this.stockDebug) {
                this.stockDebug.style.display = 'block';
                this.stockDebug.setAttribute('aria-hidden', 'false');
            }
            if (this.stockDiameterDebug) {
                this.stockDiameterDebug.style.display = 'block';
                this.stockDiameterDebug.setAttribute('aria-hidden', 'false');
            }
            const reg = this.computeCalibratedInches(w); // regression value
            const piece = this.computePiecewiseCalibratedInches(w); // piecewise interpolation value
            const deltaReg = (reg - this.targetValue);
            const deltaPiece = (piece - this.targetValue);
            const deltaStrReg = (deltaReg >= 0 ? '+' : '') + deltaReg.toFixed(3);
            const deltaStrPiece = (deltaPiece >= 0 ? '+' : '') + deltaPiece.toFixed(3);
            if (this.stockDebug) {
                this.stockDebug.textContent = `Size: ${w.toFixed(0)}px | Target: ${commonInches} in | Reg: ${reg.toFixed(3)} (${deltaStrReg})`;
            }
            if (this.stockDiameterDebug) {
                this.stockDiameterDebug.textContent = `Piece: ${piece.toFixed(3)} in (${deltaStrPiece})`;
            }
        } else {
            if (this.stockDebug) {
                this.stockDebug.textContent = `Stock Size: ${w.toFixed(0)}px (${commonInches} in)`;
            }
            if (this.stockDiameterDebug) {
                this.stockDiameterDebug.textContent = `Diameter: ${w.toFixed(0)}px (${commonInches} in)`;
            }
        }
    }

    // Button hover effects
    addHoverEffect(button) {
        button.style.backgroundColor = '#445cff';
        button.style.transform = 'scale(1.05)';
    }

    removeHoverEffect(button) {
        button.style.backgroundColor = '#bf0000';
        button.style.transform = 'scale(1)';
    }

    // Keyboard controls
    handleKeyDown(event) {
        // Prevent caliper movement while keyboard-dragging the stock
        if (this.isKeyboardDragging || this.isHelpOpen) {
            return;
        }
        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.moveLeft();
                break;
            case 'ArrowRight':
                event.preventDefault();
                this.moveRight();
                break;
            case 'd':
            case 'D':
                if (this.calibrationDiagnostics) {
                    event.preventDefault();
                    this.toggleDiagnosticsVisibility();
                }
                return;
            case 'Enter':
                if (this.gameState === 'input') {
                    event.preventDefault();
                    this.checkAnswer();
                }
                break;
            case 'Escape':
                event.preventDefault();
                this.resetGame();
                break;
        }
        if (!this._announcedKeyboardHelp) {
            this._announcedKeyboardHelp = true;
            this.announce('Use left and right arrows to adjust caliper.');
        }
    }

    // --- Help Dialog Methods ---
    openHelp() {
        if (!this.helpDialog || this.isHelpOpen) return;
        this.isHelpOpen = true;
        this._preHelpFocus = document.activeElement;
        this.helpDialog.hidden = false;
        if (this.helpOverlay) this.helpOverlay.hidden = false;
        if (this.helpButton) this.helpButton.setAttribute('aria-expanded', 'true');
        this._helpFocusable = Array.from(this.helpDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.disabled && el.offsetParent !== null);
        setTimeout(() => {
            if (this.helpDialog) {
                const title = this.helpDialog.querySelector('h2');
                if (title) {
                    title.setAttribute('tabindex', '-1');
                    title.focus();
                } else if (this._helpFocusable[0]) {
                    this._helpFocusable[0].focus();
                }
            }
        }, 30);
    }

    closeHelp() {
        if (!this.isHelpOpen) return;
        this.isHelpOpen = false;
        if (this.helpDialog) this.helpDialog.hidden = true;
        if (this.helpOverlay) this.helpOverlay.hidden = true;
        if (this.helpButton) this.helpButton.setAttribute('aria-expanded', 'false');
        if (this._preHelpFocus && typeof this._preHelpFocus.focus === 'function') {
            setTimeout(() => this._preHelpFocus.focus(), 30);
        } else if (this.helpButton) {
            this.helpButton.focus();
        }
    }

    trapFocusInHelp(e) {
        if (!this._helpFocusable || this._helpFocusable.length === 0) return;
        const first = this._helpFocusable[0];
        const last = this._helpFocusable[this._helpFocusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // Utility methods
    formatNumber(num, decimals = 3) {
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // Compute calibrated inches from pixel diameter using regression coefficients.
    computeCalibratedInches(px) {
        if (!this.calibrationCoefficients) return this.targetValue;
        const { a, b } = this.calibrationCoefficients;
        const inches = a * px + b;
        // Round to 3 decimals for display purpose only.
        return Math.round(inches * 1000) / 1000;
    }

    // Piecewise linear interpolation using nearest empirical calibrationData points.
    computePiecewiseCalibratedInches(px) {
        if (!this.calibrationData || this.calibrationData.length === 0) return this.computeCalibratedInches(px);
        // Sort by px (ensure order)
        const pts = this.calibrationData.slice().sort((a, b) => a.px - b.px);
        // Extrapolate below smallest and above largest by extending first/last segment slope
        if (px <= pts[0].px) {
            const p0 = pts[0];
            const p1 = pts[1] || pts[0];
            const slope = (p1.in - p0.in) / ((p1.px - p0.px) || 1);
            const val = p0.in + (px - p0.px) * slope;
            return Math.round(val * 1000) / 1000;
        }
        if (px >= pts[pts.length - 1].px) {
            const pLast = pts[pts.length - 1];
            const pPrev = pts[pts.length - 2] || pts[pts.length - 1];
            const slope = (pLast.in - pPrev.in) / ((pLast.px - pPrev.px) || 1);
            const val = pLast.in + (px - pLast.px) * slope;
            return Math.round(val * 1000) / 1000;
        }
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i];
            const p1 = pts[i + 1];
            if (px >= p0.px && px <= p1.px) {
                const t = (px - p0.px) / (p1.px - p0.px);
                const val = p0.in + t * (p1.in - p0.in);
                return Math.round(val * 1000) / 1000;
            }
        }
        return this.computeCalibratedInches(px);
    }

    // Regression calculator (least squares) for dynamic data updates
    computeRegression(data) {
        if (!data || data.length < 2) return { a: 0, b: 0 };
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        data.forEach(d => { sumX += d.px; sumY += d.in; sumXY += d.px * d.in; sumX2 += d.px * d.px; });
        const denom = (n * sumX2 - sumX * sumX) || 1;
        const a = (n * sumXY - sumX * sumY) / denom; // slope
        const b = (sumY - a * sumX) / n; // intercept
        return { a, b };
    }
    toggleDiagnosticsVisibility() {
        this.calibrationDiagnosticsHidden = !this.calibrationDiagnosticsHidden;
        this.updateStockDebug('toggle');
        this.announce(this.calibrationDiagnosticsHidden ? 'Diagnostics hidden' : 'Diagnostics shown');
    }
}

// DEBUG INSERT START
// (Wrap existing class modifications below if duplicate declarations appear, adjust manually.)
DigitalCalipers.prototype.debugEnabled = /[?&]debug=1/i.test(window.location.search) || window.CALIPER_DEBUG === true;
DigitalCalipers.prototype.createDebugOverlay = function () {
    if (this.debugDiv) return;
    this.debugDiv = document.createElement('div');
    Object.assign(this.debugDiv.style, {
        position: 'absolute', top: '0', left: '0', background: 'rgba(0,0,0,0.6)', color: '#0f0',
        font: '11px/1.25 monospace', padding: '4px 6px', maxWidth: '260px', zIndex: 9999, pointerEvents: 'none'
    });
    this.debugDiv.id = 'debugOverlay';
    document.body.appendChild(this.debugDiv);
};
DigitalCalipers.prototype.debug = function (msg) {
    if (!this.debugEnabled) return;
    if (!this.debugDiv) this.createDebugOverlay();
    const ts = performance.now().toFixed(0);
    console.log('[CaliperDebug]', msg);
    const line = document.createElement('div');
    line.textContent = ts + ' ' + msg;
    this.debugDiv.appendChild(line);
    while (this.debugDiv.children.length > 18) this.debugDiv.removeChild(this.debugDiv.firstChild);
};

// Wrap original showInputSection to add reason param and logging if not already instrumented
if (!DigitalCalipers.prototype._originalShowInputSection) {
    DigitalCalipers.prototype._originalShowInputSection = DigitalCalipers.prototype.showInputSection;
    DigitalCalipers.prototype.showInputSection = function (reason) {
        this.debug('showInputSection ' + (reason || '(no-reason)'));
        return this._originalShowInputSection.call(this);
    };
}

// Instrument other key methods (non-destructive wrappers)
['showAnimationCircle', 'hideAnimationCircle', 'showMeasureCircle', 'hideMeasureCircle', 'showTextEntryCircle', 'hideTextEntryCircle', 'handleTryAgain', 'resetGame']
    .forEach(method => {
        const name = method;
        if (typeof DigitalCalipers.prototype[name] === 'function' && !DigitalCalipers.prototype['__wrapped_' + name]) {
            const original = DigitalCalipers.prototype[name];
            DigitalCalipers.prototype[name] = function () {
                this.debug(name);
                return original.apply(this, arguments);
            };
            DigitalCalipers.prototype['__wrapped_' + name] = true;
        }
    });

// Patch drop triggers to pass reasons if not already instrumented
if (!DigitalCalipers.prototype.__patched_dropReasons) {
    const dropWrap = DigitalCalipers.prototype.handleDrop;
    DigitalCalipers.prototype.handleDrop = function () {
        const prevState = this.gameState;
        dropWrap.apply(this, arguments);
        if (prevState !== 'success' && this.gameState === 'input') this.debug('drop->inputSection');
    };
    const pointerEndWrap = DigitalCalipers.prototype.onPointerEnd;
    DigitalCalipers.prototype.onPointerEnd = function () {
        pointerEndWrap.apply(this, arguments);
        if (this.gameState === 'input') this.debug('pointerEnd->inputSection');
    };
    const kbDropWrap = DigitalCalipers.prototype.tryCompleteKeyboardDrop;
    DigitalCalipers.prototype.tryCompleteKeyboardDrop = function () {
        kbDropWrap.apply(this, arguments);
        if (this.gameState === 'input') this.debug('keyboardDrop->inputSection');
    };
    DigitalCalipers.prototype.__patched_dropReasons = true;
}
// DEBUG INSERT END

// Game initialization
let game;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function () {
    game = new DigitalCalipers();

    // Add global functions for debugging
    window.resetGame = () => game.resetGame();
    window.showAnswer = () => {
        console.log('Target answer:', game.targetValue);
        if (game.measurementInput) {
            game.measurementInput.value = game.targetValue.toString();
        }
    };
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // Pause audio when page is hidden
        Object.values(game?.audioElements || {}).forEach(audio => {
            if (!audio.paused) {
                audio.pause();
            }
        });
    }
});

// Handle window resize for responsive design
window.addEventListener('resize', function () {
    // Add any responsive adjustments here if needed
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DigitalCalipers;
}