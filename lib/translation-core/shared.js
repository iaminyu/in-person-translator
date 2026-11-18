// Small helpers and the audio format every turn uses: 24 kHz, mono, 16-bit PCM.
// No dependencies.

const INPUT_AUDIO_SAMPLE_RATE = 24000;
const INPUT_AUDIO_CHANNELS = 1;
const INPUT_AUDIO_BYTES_PER_SAMPLE = 2;
const INPUT_AUDIO_BYTES_PER_SECOND =
  INPUT_AUDIO_SAMPLE_RATE *
  INPUT_AUDIO_CHANNELS *
  INPUT_AUDIO_BYTES_PER_SAMPLE;

function toTrimmedText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function getAudioDurationSecondsFromPcmBytes(byteLength) {
  if (!byteLength) {
    return 0;
  }
  return byteLength / INPUT_AUDIO_BYTES_PER_SECOND;
}

function pcm16ToWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const wavHeader = Buffer.alloc(44);

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null);
    if (body?.error?.message) {
      return body.error.message;
    }
    if (typeof body?.message === "string" && body.message) {
      return body.message;
    }
    if (Array.isArray(body?.message) && body.message.length) {
      return body.message
        .map((item) => toTrimmedText(item))
        .filter(Boolean)
        .join("; ");
    }
    if (typeof body?.error === "string" && body.error) {
      return body.error;
    }
    return `HTTP ${response.status}`;
  }
  const text = await response.text().catch(() => "");
  return text || `HTTP ${response.status}`;
}

module.exports = {
  INPUT_AUDIO_BYTES_PER_SAMPLE,
  INPUT_AUDIO_BYTES_PER_SECOND,
  INPUT_AUDIO_CHANNELS,
  INPUT_AUDIO_SAMPLE_RATE,
  getAudioDurationSecondsFromPcmBytes,
  pcm16ToWavBuffer,
  readErrorMessage,
  toTrimmedText
};
