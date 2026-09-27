import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Dictation for a text field: the transcript, and the sound of it arriving.
 *
 * Two APIs, because one is not enough. `SpeechRecognition` returns words and
 * nothing else — it will not tell you how loud the room is, or whether the
 * microphone is picking anything up at all. So this also opens the stream
 * itself through `getUserMedia` and hangs an `AnalyserNode` off it, purely so
 * something on screen can show the user they are being heard. Without it the
 * only feedback during a long sentence is a button that changed colour, and a
 * person who has been talking to a dead microphone finds out at the end.
 *
 * The analyser is deliberately *not* connected to `ctx.destination`. Routing a
 * live microphone to the speakers is a feedback loop, and on a laptop it is a
 * loud one.
 *
 * Both halves are optional in the other direction: if the analyser cannot be
 * built but recognition can, dictation still works and the meter simply has
 * nothing to show. Only a refused permission stops the whole thing, because
 * that refusal applies to recognition too.
 */

const getSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;

/* 1024 samples at 48kHz is ~21ms of audio — long enough for a stable RMS,
   short enough that a consonant does not smear across two frames. The
   smoothing is low because the meter does its own, and doing it twice turns
   speech into a slow swell. */
const FFT_SIZE = 1024;
const SMOOTHING = 0.2;

export default function useVoiceInput({ lang = 'en-IN', onTranscript, onEnd } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  /* `null` | 'blocked' | 'failed'. Deliberately a code rather than a sentence:
     the copy belongs to whichever surface is showing it. */
  const [error, setError] = useState(null);

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  /* Set by `cancel`, read by the recognition handlers: a cancelled session
     must not deliver the words it had already heard. */
  const cancelledRef = useRef(false);

  /* Held in refs so a caller passing inline arrows does not re-arm the
     recogniser's handlers on every render of the field. */
  const onTranscriptRef = useRef(onTranscript);
  const onEndRef = useRef(onEnd);
  onTranscriptRef.current = onTranscript;
  onEndRef.current = onEnd;

  useEffect(() => {
    setSupported(Boolean(getSR()));
  }, []);

  /* Everything the browser shows a recording indicator for. Closing the
     context is not enough on its own — the track is what keeps the light on,
     and a leaked one tells the user we are still listening after we stopped. */
  const releaseAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const SR = getSR();
    if (!SR || recRef.current) return;

    setError(null);
    cancelledRef.current = false;

    /* The meter opens first, so the bars are already live when the recogniser
       starts returning words rather than catching up a beat later. */
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      /* Chrome starts a context suspended unless it can attribute it to a
         gesture. This is called from the button's click, so the resume is
         allowed — but it still has to be asked for. */
      if (ctx.state === 'suspended') await ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING;
      ctx.createMediaStreamSource(stream).connect(analyser);

      ctxRef.current = ctx;
      analyserRef.current = analyser;
    } catch (err) {
      releaseAudio();
      /* A refused microphone refuses recognition too, so there is nothing
         left to try. Anything else — no AudioContext, a device that vanished
         — only costs the meter, and dictation is still worth starting. */
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setError('blocked');
        return;
      }
    }

    const rec = new SR();
    rec.lang = lang;
    /* Interim results are what make the field fill in as you speak instead of
       in one lump at the end. */
    rec.interimResults = true;
    /* Ends itself on a pause. `true` would keep the microphone open until the
       user remembered to close it, which is how a page ends up listening in
       a background tab. */
    rec.continuous = false;

    rec.onresult = (e) => {
      if (cancelledRef.current) return;
      const said = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      onTranscriptRef.current?.(said);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('blocked');
      /* `no-speech` is someone opening the microphone and thinking. `aborted`
         is us. Neither is a failure worth a message. */
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('failed');
    };

    rec.onend = () => {
      recRef.current = null;
      releaseAudio();
      setListening(false);
      onEndRef.current?.({ cancelled: cancelledRef.current });
    };

    recRef.current = rec;
    setListening(true);

    try {
      rec.start();
    } catch {
      /* `start()` throws if the recogniser is already running — which can only
         happen if two toggles landed in the same tick. Unwind rather than
         leaving the UI in a listening state nothing will ever end. */
      recRef.current = null;
      releaseAudio();
      setListening(false);
    }
  }, [lang, releaseAudio]);

  /* Keep what was heard. `stop` lets the recogniser deliver its final result
     first, which `abort` would throw away. */
  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  /* Discard it. The caller is responsible for putting the field back the way
     it was — this only guarantees no further words arrive. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recRef.current?.abort();
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      recRef.current?.abort();
      recRef.current = null;
      releaseAudio();
    },
    [releaseAudio],
  );

  return { supported, listening, error, analyserRef, start, stop, cancel };
}
