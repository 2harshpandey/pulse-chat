import React from 'react';
import type { VoicePreviewSnapshot, useVoiceRecorder } from '../../hooks';
import { formatAudioDuration } from '../message';
import { preserveKeyboardFocus } from '../../utils';
import { VoiceNotePreviewBar } from '../VoiceNotePreviewBar';
import {
  RecordingBarWrapper,
  RecordingActionGroup,
  RecordingCancelBtn,
  RecordingStatusIndicator,
  RecordingBlinkDot,
  RecordingTimerSpan,
  RecordingWaveformBarBox,
  RecordingWaveformBar,
  RecordingPauseResumeBtn,
  RecordingPreviewBtn,
} from '../../Chat.styles';

export interface VoiceRecordingBarProps {
  recorder: ReturnType<typeof useVoiceRecorder>;
  previewSnapshot: VoicePreviewSnapshot | null;
  previewInitiallyPlaying: boolean;
  isFinalizingRecording: boolean;
  previewAudioRef: React.RefObject<HTMLAudioElement | null>;
  onDiscardVoice: () => void;
  onOpenVoicePreview: () => void;
  onResumeFromPreview: () => void;
  onErrorToast?: (msg: string) => void;
}

/**
 * Active voice-note recording bar and inline peek-preview controller inside ChatFooter.
 */
export const VoiceRecordingBar: React.FC<VoiceRecordingBarProps> = ({
  recorder,
  previewSnapshot,
  previewInitiallyPlaying,
  isFinalizingRecording,
  previewAudioRef,
  onDiscardVoice,
  onOpenVoicePreview,
  onResumeFromPreview,
  onErrorToast,
}) => {
  if (previewSnapshot) {
    return (
      <VoiceNotePreviewBar
        previewUrl={previewSnapshot.previewUrl}
        duration={previewSnapshot.duration}
        waveform={previewSnapshot.waveform}
        autoPlay={!previewInitiallyPlaying}
        initiallyPlaying={previewInitiallyPlaying}
        externalAudioRef={previewAudioRef}
        onDiscard={onDiscardVoice}
        onResumeRecording={onResumeFromPreview}
        onError={onErrorToast}
      />
    );
  }

  return (
    <RecordingBarWrapper role="region" aria-label="Voice recording in progress">
      <RecordingActionGroup>
        <RecordingCancelBtn
          type="button"
          onPointerDown={preserveKeyboardFocus}
          onMouseDown={preserveKeyboardFocus}
          onClick={onDiscardVoice}
          title="Cancel recording"
          aria-label="Cancel recording"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </RecordingCancelBtn>

        {recorder.isPaused ? (
          <>
            <RecordingPreviewBtn
              type="button"
              onPointerDown={preserveKeyboardFocus}
              onMouseDown={preserveKeyboardFocus}
              disabled={isFinalizingRecording}
              onClick={onOpenVoicePreview}
              title="Listen & peek before sending"
              aria-label="Preview recorded voice note"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </RecordingPreviewBtn>

            <RecordingWaveformBarBox aria-hidden="true">
              {recorder.liveLevels.map((lvl, idx) => (
                <RecordingWaveformBar
                  key={idx}
                  $level={lvl}
                  $isPaused={recorder.isPaused}
                />
              ))}
            </RecordingWaveformBarBox>

            <RecordingStatusIndicator>
              <RecordingBlinkDot $isPaused={recorder.isPaused} />
              <RecordingTimerSpan>{formatAudioDuration(recorder.duration)}</RecordingTimerSpan>
            </RecordingStatusIndicator>
          </>
        ) : (
          <>
            <RecordingStatusIndicator>
              <RecordingBlinkDot $isPaused={recorder.isPaused} />
              <RecordingTimerSpan>{formatAudioDuration(recorder.duration)}</RecordingTimerSpan>
            </RecordingStatusIndicator>

            <RecordingWaveformBarBox aria-hidden="true">
              {recorder.liveLevels.map((lvl, idx) => (
                <RecordingWaveformBar
                  key={idx}
                  $level={lvl}
                  $isPaused={recorder.isPaused}
                />
              ))}
            </RecordingWaveformBarBox>
          </>
        )}

        <RecordingPauseResumeBtn
          type="button"
          onPointerDown={preserveKeyboardFocus}
          onMouseDown={preserveKeyboardFocus}
          $isPaused={recorder.isPaused}
          disabled={isFinalizingRecording}
          onClick={recorder.isPaused ? recorder.resumeRecording : recorder.pauseRecording}
          title={recorder.isPaused ? 'Resume recording' : 'Pause recording'}
          aria-label={recorder.isPaused ? 'Resume recording' : 'Pause recording'}
        >
          {recorder.isPaused ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          )}
        </RecordingPauseResumeBtn>
      </RecordingActionGroup>
    </RecordingBarWrapper>
  );
};
