# Passive capture — specification, not implementation

PRD §7 Phase 2 asks for the passive path to be **specified even if not built**,
because the contribution economics depend on it. This is that specification.

## Why it has to exist

Active reporting decays. The people best placed to report — auto drivers doing
thirty trips a day through the same four crosses — have a budget of zero seconds
and both hands occupied. Ravi has four seconds and a helmet. If every observation
costs a deliberate act, the map is empty by week three, which is how most
crowdsourced reporting products die (PRD §9, first risk).

Passive capture changes the unit economics: one mounted phone contributes more
observations in a week than forty active users do, and contributes them from the
streets that matter, at the times that matter.

## What it does

A phone mounted on a windscreen or handlebar, screen off, app in the background:

1. **Wakes on geofence.** Only inside the pilot polygon. No background processing
   anywhere else, ever.
2. **Samples on a movement trigger.** A sustained drop below 6 km/h on a segment
   whose free-flow profile is higher, or a stop longer than 20 s that is not at a
   known junction. Time-based sampling is the wrong trigger — it burns battery to
   photograph empty road.
3. **Classifies on device, discards the frame.** The frame goes to the same
   MobileNetV3 model the active path uses. What is retained is
   `{segment_id, type, conf, timestamp}` — a few dozen bytes. **The image is
   never written to storage and never uploaded.** This is the whole privacy
   argument: a passive camera that keeps pictures is surveillance, and a passive
   camera that keeps only a label is a sensor.
4. **Requires corroboration.** A passive observation enters at half the weight of
   an active one and can raise a `possible` event but never a `confirmed` one on
   its own (Phase 3 state engine).

## What it must not do

- No frames retained, uploaded, or cached — not even briefly, not even redacted.
- No operation outside the pilot polygon.
- No recording while the vehicle is above 30 km/h: at that speed the phone is
  looking at an arterial, not at a layout cross.
- No always-on microphone. The voice path is push-to-talk, and stays that way.

## The consent it needs

Passive capture is a different bargain from active reporting and must be asked
for separately, in the same plain language as the photo statement:

> This phone will look at the road while you drive through your layout, work out
> whether something is blocking it, and send only the answer. No pictures are
> kept or sent. It only runs inside your layout, and you can turn it off any time.

Opt-in, off by default, revocable from the first screen, with a persistent
indicator whenever it is running.

## Why it is not built in Phase 2

Three blockers, in order:

1. **No classifier.** Passive capture without a working model records nothing
   useful — it is the active path's model, applied without a human check, so it
   needs to be *better* than the active one, not merely present.
2. **No background camera on the mobile web.** The Web platform cannot hold a
   camera with the screen off. This path needs a native or Capacitor shell, which
   is a Phase 5 decision, not a Phase 2 one.
3. **No battery budget yet.** The trigger design above is a hypothesis. It needs a
   day of real driving with instrumentation before anyone is asked to install it.

## What would validate it

Mount one phone in one auto for one week, logging only the *triggers* — no
classification, no camera. Compare trigger count and location against the Phase 0
manual observation log. If the triggers do not line up with the obstructions a
human recorded, the trigger design is wrong and no amount of model accuracy fixes
it.
