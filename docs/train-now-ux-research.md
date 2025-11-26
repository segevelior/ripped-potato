# Active Workout / Train Now UX Research

> Research compiled from analysis of 8 major fitness apps: Strong, Hevy, JEFIT, Fitbod, Nike Training Club, Apple Fitness+, Peloton, Gymshark Training

---

## Common UI Patterns Across Apps

### 1. Primary Action: Logging Completed Sets

The most universal pattern across all apps is making "complete set" the primary action:
- **Strong, Hevy, JEFIT, Fitbod**: Checkmark button is the dominant control
- **Pattern**: Tap checkmark → Set marked complete → Rest timer starts automatically
- **Benefit**: Users spend 80% of time on this action, so it must be effortless

### 2. Exercise Progress Visibility

All leading apps show exercise progress in one of two ways:
- **Navigation panel/sidebar** (FitNotes, JEFIT): Slide-out drawer shows completed/remaining exercises with set counts
- **Progress bar** (Nike Training Club, Peloton): Visual indicator showing workout completion percentage
- **Current exercise prominent** (Hevy): Full-screen focus on current exercise with context hints for next

### 3. Rest Timer Auto-Trigger

Universal pattern when completing a set:
- Mark set complete → Timer starts immediately with configurable duration (default 2-3 minutes)
- **Adjustment controls**: +15/-15 second buttons to fine-tune without fully resetting
- **Notification system**: Vibration, sound, and/or lock screen notification when rest expires
- **Apps implementing this**: Hevy, Strong, Fitbod, FitNotes, Setgraph

### 4. Reference Previous Performance

Critical UX pattern for progressive overload:
- **Visible by default** (Setgraph, FitNotes): Shows last weight/reps for that exercise immediately
- **Swipe to view history** (FitNotes, Setgraph): Single swipe reveals historical sets without leaving context
- **Pre-populated fields** (Hevy, Strong): Weight/rep fields auto-fill from last session with single-tap adjustment
- **Pattern**: Users need this reference 95% of the time when logging a new set

---

## Best Practices for Set/Rep Logging Interface

### Input Method Preferences

**Single-tap completion** (Setgraph):
- Record reps + weight → Tap checkmark
- Fastest possible flow (1-2 seconds per set)

**Expandable input fields** (Fitbod, Hevy):
- Instead of horizontal scrolling for weight/reps, use vertical expandable buttons
- Tap weight field → Picker appears → Select/enter → Field updates
- Works better than 4x horizontal scrolling rows

**Pre-logged set editing** (JEFIT):
- Edit weight/reps without constraints between sets
- Plan ahead before actually performing the set
- Auto-saves as you navigate

### Key Metric Priority

All apps track in this priority order:
1. **Weight** (most important for strength training)
2. **Reps** (confirms set completion)
3. **Notes** (optional, tucked in menu)
4. **RiR/RPE** (optional, Fitbod uses for auto-adjustment)

### Input Field Patterns

- **Weight field**: Numeric input with unit toggle (lbs/kg) - tap to edit
- **Rep field**: Number counter or text input
- **Duration field**: For cardio exercises (calories, distance, time)
- **None of the apps use sliders** for primary input (too imprecise for strength training)

---

## Timer/Stopwatch Implementations

### Rest Timer Features (Universal Across Apps)

**Default behavior**:
- Set duration per exercise (can vary: bench press 3min, row 2min)
- Starts automatically when set marked complete
- Countdown visible in small persistent UI element (top corner or bottom)
- Vibration/sound/notification when complete

**Adjustment patterns**:
- Tap timer to expand to full-screen view (Strong, Fitbod)
- +15/-15 second quick adjust buttons (Hevy, Fitbod)
- Option to disable timer entirely for exercises (supersets, circuits)
- Lock screen widget access (Hevy Live Activity, Setgraph)

**Smart features**:
- Automatically scroll to next exercise in superset (Hevy)
- Smart superset scrolling - auto-advance when set complete
- Different rest periods for warm-up vs. working sets (Strong)
- Notifications even when app backgrounded or phone locked

### What's NOT Used

- Interval/tabata timers are rare in strength training apps
- Full-screen takeover timers discourage logging (minimized persistent display preferred)

---

## Navigation Patterns

### Exercise-to-Exercise Navigation

**Primary methods** (in order of popularity):
1. **Next button below last set** (JEFIT, Strong): Tap "Next" after final set of exercise
2. **Swipe left/right** (JEFIT): Horizontal swipe between exercises
3. **Auto-advance** (JEFIT with Autoplay): After final set complete, jump to next automatically
4. **Sidebar/panel tap** (FitNotes): Tap exercise name in left panel to jump

**Within superset**:
- Auto-scroll to next exercise in superset when previous marked complete (Hevy)
- Each superset has unique color for visual distinction (Hevy)
- Vertical line grouping indicator (Strong)

### One-Handed Optimization

**Key finding from research**: Bottom sheet actions and centered middle-screen buttons are more reachable than bottom corners.

**Implemented patterns**:
- Next/Skip buttons centered or left-placed (not bottom-right)
- Primary actions at thumb-reach height (middle to lower-middle)
- Bottom sheet menus for secondary actions (swipe options, settings)
- Minimal required taps per set (Strong's principle: "stay out of your way")

---

## Handling Supersets and Circuits

### Superset Display

- **Hevy**: Shows exercises grouped with unique color, auto-scrolls between paired exercises
- **Fitbod**: Drag-and-drop to reorder exercises within circuit, visual grouping
- **Strong**: Vertical line indicator connects paired exercises, "Next" button logic respects grouping
- **Pattern**: When you mark first exercise of superset complete, timer doesn't start; instead app scrolls to second exercise

### Circuit Handling

- 3+ exercises in sequence with minimal rest between
- Different UI from supersets: loops back to first exercise
- Apps provide visual distinction (color, grouping, label)

---

## Recommended Features for MVP Active Workout Screen

### Must-Have (Core Functionality)

1. **Current Exercise Display**
   - Large exercise name/title
   - Rep/weight targets clearly visible
   - Exercise video/image reference (optional but valuable)

2. **Set Logging Interface**
   - Tap to enter weight (numeric)
   - Tap to enter reps (numeric)
   - Large checkmark button to mark complete
   - Pre-fill with last weight/reps from history

3. **Rest Timer**
   - Auto-start when set marked complete (3-min default)
   - Small persistent timer display (top corner or expanded modal)
   - Vibration notification when done
   - +15/-15 second adjust buttons

4. **Progress Navigation**
   - Next button to advance to next exercise
   - Visual indicator of sets completed for current exercise
   - Show total sets/current set number (e.g., "3/4")

5. **Minimal Exercise Context**
   - Next exercise preview (optional)
   - Muscle group indicator
   - Total workout progress (optional)

### Should-Have (Enhanced UX)

1. **Quick Actions**
   - Swipe left to skip exercise (return later)
   - Swipe right to edit last set details
   - Notes button for form comments

2. **Reference Information**
   - Swipe left to view last 3 times did this exercise
   - Weight/rep history mini-display

3. **Feedback**
   - Haptic vibration on set complete (satisfying)
   - Checkmark animation (provides visual confirmation)
   - Celebration message on personal record (Fitbod/Peloton style)

### Nice-to-Have (Future Versions)

1. Superset/circuit grouping and auto-advance
2. RiR/RPE input for smart weight recommendations
3. Lock screen widgets (iOS) or dynamic island
4. Apple Watch companion app
5. 1RM calculation and display
6. Estimated calories and volume tracking

---

## Key UX Statistics from Research

| Metric | Value | Source |
|--------|-------|--------|
| Users who think rest timing matters | 77.8% | Survey data |
| Users who find fitness apps clear/easy | 55.6% | UX research |
| Abandonment increase when logging >3 steps | 40% | Fitbod study |
| Completion rate increase with AI-adjusted difficulty | 30% | Fitbod |
| Engagement boost from haptic feedback | 30% | UX Movement |
| Session completion increase from motivational messaging | 25% | Nike TC study |

---

## Summary: Primary UX Principle

All successful apps follow the same core principle: **minimize cognitive load during the workout**. Users should:
- Know what to do next without thinking
- Complete a set in 1-3 taps maximum
- See rest timer without opening app
- Know how many sets remain without scrolling
- Reference previous weights/reps instantly

The best apps (Hevy, Strong, JEFIT, Setgraph) all prioritize this ruthlessly, cutting out everything non-essential from the active workout screen.

---

## Sources

- [How to Design a Fitness App: UX/UI Best Practices](https://www.zfort.com/blog/How-to-Design-a-Fitness-App-UX-UI-Best-Practices-for-Engagement-and-Retention)
- [Fitness App UI Design: Key Principles](https://stormotion.io/blog/fitness-app-ux/)
- [Hevy Automatic Rest Timer Documentation](https://www.hevyapp.com/features/workout-rest-timer/)
- [Hevy Supersets Documentation](https://www.hevyapp.com/features/what-are-supersets/)
- [JEFIT Enhancements: Revamped Workout Tab](https://www.jefit.com/wp/jefit-news-product-updates/upcoming-enhancements-revamped-workout-tab-and-improved-exercise-screens/)
- [Fitbod Workout Interface Review](https://www.autonomous.ai/ourblog/fitbod-app-review)
- [Nike Training Club UX Case Study](https://medium.com/@eunice.choi/ux-case-study-nike-training-club-371c2b79e6dc)
- [Apple Fitness+ Metrics and Logging](https://support.apple.com/en-us/108761)
- [Peloton Strength+ Weight Tracking](https://www.onepeloton.com/strength-plus-app)
- [Gymshark Training App Review](https://dr-muscle.com/gymshark-workout-app-review/)
- [Bottom Sheets: UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [Optimal CTA Button Placement](https://uxmovement.com/mobile/optimal-placement-for-mobile-call-to-action-buttons/)
- [How to Build an MVP for Fitness Apps](https://onix-systems.com/blog/how-to-build-an-mvp-for-a-fitness-application)
- [Setgraph: Simple Workout App Guide](https://setgraph.app/ai-blog/simple-workout-app-guide)
- [FitNotes Workout Tracking Features](http://www.fitnotesapp.com/workout_tracking/)
- [Haptic Feedback in Mobile UX](https://develux.com/blog/haptic-feedback)
- [2025 Guide to Haptics](https://saropa-contacts.medium.com/2025-guide-to-haptics-enhancing-mobile-ux-with-tactile-feedback-676dd5937774)
- [Strong Workout Tracker App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
