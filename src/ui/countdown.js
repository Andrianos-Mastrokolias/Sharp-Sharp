// ============================================================
// RACE COUNTDOWN
// ============================================================

// Turns levelManager.getState().race into what the HUD's centre
// overlay shows: "3", "2", "1", then "GO!" for GO_TIME seconds
// once the phase leaves 'countdown', then nothing. main.js owns
// one, updates it while playing and reset()s it on every level
// load. No allocation per frame.

export const GO_TIME = 1; // seconds "GO!" stays up

export class CountdownTracker {

  constructor() {
    this.reset();
  }


  reset() {
    this.text = '';      // '' = overlay hidden
    this.cue = null;     // 'countdown' | 'go' | null, see update()
    this.phase = 'none';
    this.goTimer = 0;
  }


  // race: { phase, countdown }. Sets text, and cue on the frame
  // the text changes to a new number or to GO! (null otherwise).
  update(race, dt) {

    const previous = this.text;

    if (race.phase === 'countdown') {
      this.goTimer = 0;
      this.text = String(Math.max(1, Math.ceil(race.countdown)));
    } else if (this.phase === 'countdown' && race.phase !== 'none') {
      this.goTimer = GO_TIME;
      this.text = 'GO!';
    } else {
      this.goTimer = race.phase === 'none' ? 0 : Math.max(0, this.goTimer - dt);

      if (this.goTimer === 0) {
        this.text = '';
      }
    }

    this.phase = race.phase;

    this.cue =
      this.text === previous || this.text === ''
        ? null
        : this.text === 'GO!' ? 'go' : 'countdown';
  }
}
