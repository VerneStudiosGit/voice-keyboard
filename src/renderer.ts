import './index.css';

declare global {
  interface Window {
    voiceKeyboard: {
      onStartRecording: (callback: () => void) => void;
      onStopRecording: (callback: () => void) => void;
      onCancelRecording: (callback: () => void) => void;
      sendAudio: (audioBuffer: ArrayBuffer) => void;
      sendAudioLevel: (level: number) => void;
      onAudioResult: (callback: (result: { success: boolean; text?: string; error?: string }) => void) => void;
    };
  }
}

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let currentStream: MediaStream | null = null;
let isCurrentlyRecording = false;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let levelInterval: ReturnType<typeof setInterval> | null = null;

function startLevelMonitoring(stream: MediaStream): void {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  levelInterval = setInterval(() => {
    if (!analyser) return;
    analyser.getByteFrequencyData(dataArray);

    // Calculate RMS-like level from frequency data
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    // Normalize to 0-1 range
    const level = Math.min(average / 128, 1.0);
    window.voiceKeyboard.sendAudioLevel(level);
  }, 33); // ~30fps
}

function stopLevelMonitoring(): void {
  if (levelInterval) {
    clearInterval(levelInterval);
    levelInterval = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  analyser = null;
  // Send zero level
  window.voiceKeyboard.sendAudioLevel(0);
}

async function startRecording(): Promise<void> {
  if (isCurrentlyRecording) return;
  isCurrentlyRecording = true;

  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentStream = stream;
    audioChunks = [];

    // Start monitoring audio levels
    startLevelMonitoring(stream);

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stopLevelMonitoring();
      stream.getTracks().forEach((t) => t.stop());
      currentStream = null;

      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      window.voiceKeyboard.sendAudio(arrayBuffer);
    };

    mediaRecorder.start(100);
  } catch (err: any) {
    console.error('Recording error:', err);
    isCurrentlyRecording = false;
  }
}

function stopRecording(): void {
  isCurrentlyRecording = false;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function cancelRecording(): void {
  isCurrentlyRecording = false;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Remove onstop handler so audio is NOT sent
    mediaRecorder.onstop = () => {
      stopLevelMonitoring();
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
        currentStream = null;
      }
    };
    mediaRecorder.stop();
  }
  audioChunks = [];
}

window.voiceKeyboard.onStartRecording(() => {
  startRecording();
});

window.voiceKeyboard.onStopRecording(() => {
  stopRecording();
});

window.voiceKeyboard.onCancelRecording(() => {
  cancelRecording();
});

window.voiceKeyboard.onAudioResult((result) => {
  if (!result.success) {
    console.error('Transcription failed:', result.error);
  }
});
