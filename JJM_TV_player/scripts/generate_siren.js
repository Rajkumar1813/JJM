const fs = require('fs');
const path = require('path');

function writeWav(filename, sampleRate, numChannels, bitsPerSample, samples) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const chunkSize = 36 + dataSize;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  for (let i = 0; i < samples.length; i++) {
    // 16-bit PCM
    const val = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
    buffer.writeInt16LE(val, 44 + i * 2);
  }
  
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, buffer);
}

// Generate a 2-second siren (oscillating between 600Hz and 800Hz)
const sampleRate = 44100;
const duration = 2; // seconds
const numSamples = sampleRate * duration;
const samples = new Float32Array(numSamples);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  // Frequency sweeps back and forth between 600 and 800 every 0.5s
  const cycle = t % 1.0;
  const f = cycle < 0.5 ? 600 : 800;
  samples[i] = 0.5 * Math.sin(2 * Math.PI * f * t); // amplitude 0.5
}

const outPath = path.join(__dirname, '../assets/audio/siren.wav');
writeWav(outPath, sampleRate, 1, 16, samples);
console.log('Siren generated at', outPath);
