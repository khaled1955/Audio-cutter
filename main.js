const fileInput = document.getElementById('file');
const screenUpload = document.getElementById('screenUpload');
const screenWorkspace = document.getElementById('screenWorkspace');
const statusUpload = document.getElementById('statusUpload');
const backBtn = document.getElementById('backBtn');
const workspace = document.getElementById('workspace');
const filenameEl = document.getElementById('filename');
const canvas = document.getElementById('wave');
const canvasWrap = document.getElementById('canvasWrap');
const ctx = canvas.getContext('2d');
const rulerEl = document.getElementById('ruler');
const playBtn = document.getElementById('playBtn');
const curTimeEl = document.getElementById('curTime');
const totalTimeEl = document.getElementById('totalTime');
const startInput = document.getElementById('startInput');
const endInput = document.getElementById('endInput');
const outLenEl = document.getElementById('outLen');
const exportBtn = document.getElementById('exportBtn');
const statusEl = document.getElementById('status');
const player = document.getElementById('player');

let audioBuffer = null;
let duration = 0;
let peaks = [];
let cssWidth = 0, cssHeight = 0;
let selStart = 0, selEnd = 0;
let dragTarget = null;
let isPlaying = false;
let rafId = null;

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(2).padStart(5, '0');
  return m + ':' + s;
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  statusUpload.textContent = 'جاري التحميل...';
  statusUpload.className = 'status';
  player.src = URL.createObjectURL(file);
  filenameEl.textContent = file.name;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await ac.decodeAudioData(arrayBuffer);
    duration = audioBuffer.duration;
    selStart = 0;
    selEnd = duration;

    // ===== الانتقال للشاشة التانية =====
    screenUpload.classList.remove('active');
    screenWorkspace.classList.add('active');
    statusUpload.textContent = '';

    setupCanvas();
    computePeaks();
    drawWaveform();
    drawRuler();
    updateInputsFromSelection();
    totalTimeEl.textContent = fmt(duration);
    updateOutLen();
  } catch (err) {
    statusUpload.textContent = 'تعذر قراءة الملف ده كصوت.';
    statusUpload.className = 'status error';
  }
});

backBtn.addEventListener('click', () => {
  if (isPlaying) { player.pause(); stopPlayback(); }
  screenWorkspace.classList.remove('active');
  screenUpload.classList.add('active');
  fileInput.value = '';
});

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  cssWidth = canvasWrap.clientWidth;
  cssHeight = canvasWrap.clientHeight;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function computePeaks() {
  const data = audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(data.length / cssWidth));
  peaks = [];
  for (let x = 0; x < cssWidth; x++) {
    let min = 1, max = -1;
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, data.length);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push({ min, max });
  }
}

function timeToX(t) { return (t / duration) * cssWidth; }
function xToTime(x) { return Math.max(0, Math.min(duration, (x / cssWidth) * duration)); }

function drawWaveform() {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const mid = cssHeight / 2;
  for (let x = 0; x < cssWidth; x++) {
    const t = (x / cssWidth) * duration;
    const inSel = t >= selStart && t <= selEnd;
    ctx.fillStyle = inSel ? '#4f9eff' : '#393e45';
    const p = peaks[x] || { min: 0, max: 0 };
    const y1 = mid - p.max * mid * 0.9;
    const y2 = mid - p.min * mid * 0.9;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(timeToX(selStart) - 1, 0, 2, cssHeight);
  ctx.fillRect(timeToX(selEnd) - 1, 0, 2, cssHeight);
  if (isPlaying) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(timeToX(player.currentTime), 0, 1, cssHeight);
  }
}

function drawRuler() {
  rulerEl.innerHTML = '';
  const steps = 6;
  for (let i = steps; i >= 0; i--) {
    const span = document.createElement('span');
    span.textContent = fmt((duration / steps) * i).split('.')[0];
    rulerEl.appendChild(span);
  }
}

canvasWrap.addEventListener('pointerdown', (e) => {
  const x = e.offsetX;
  const startX = timeToX(selStart);
  const endX = timeToX(selEnd);
  if (Math.abs(x - startX) < 10) dragTarget = 'start';
  else if (Math.abs(x - endX) < 10) dragTarget = 'end';
  else return;
  canvasWrap.setPointerCapture(e.pointerId);
});

canvasWrap.addEventListener('pointermove', (e) => {
  if (!dragTarget) return;
  const t = xToTime(e.offsetX);
  if (dragTarget === 'start') selStart = Math.min(t, selEnd - 0.05);
  else selEnd = Math.max(t, selStart + 0.05);
  drawWaveform();
  updateInputsFromSelection();
  updateOutLen();
});

canvasWrap.addEventListener('pointerup', () => { dragTarget = null; });
canvasWrap.addEventListener('pointercancel', () => { dragTarget = null; });

function updateInputsFromSelection() {
  startInput.value = selStart.toFixed(2);
  endInput.value = selEnd.toFixed(2);
  startInput.max = duration;
  endInput.max = duration;
}

startInput.addEventListener('change', () => {
  let v = parseFloat(startInput.value);
  if (isNaN(v)) v = 0;
  selStart = Math.max(0, Math.min(v, selEnd - 0.05));
  updateInputsFromSelection();
  drawWaveform();
  updateOutLen();
});

endInput.addEventListener('change', () => {
  let v = parseFloat(endInput.value);
  if (isNaN(v)) v = duration;
  selEnd = Math.min(duration, Math.max(v, selStart + 0.05));
  updateInputsFromSelection();
  drawWaveform();
  updateOutLen();
});

function updateOutLen() { outLenEl.textContent = fmt(selEnd - selStart); }

playBtn.addEventListener('click', () => {
  if (isPlaying) {
    player.pause();
    stopPlayback();
    return;
  }
  player.currentTime = selStart;
  player.play();
  isPlaying = true;
  playBtn.textContent = '⏸';
  loop();
});

function loop() {
  if (!isPlaying) return;
  curTimeEl.textContent = fmt(player.currentTime);
  drawWaveform();
  if (player.currentTime >= selEnd) {
    player.pause();
    player.currentTime = selStart;
    stopPlayback();
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function stopPlayback() {
  isPlaying = false;
  playBtn.textContent = '▶';
  if (rafId) cancelAnimationFrame(rafId);
  drawWaveform();
}

function sliceAudioBuffer(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.floor(endSec * sampleRate);
  const frameCount = endSample - startSample;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const newBuffer = ac.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) newData[i] = oldData[startSample + i];
  }
  return newBuffer;
}

function bufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const blockAlign = numChannels * 2;
  const dataLength = buffer.length * blockAlign;
  const arrBuf = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrBuf);
  function ws(offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, dataLength, true);
  let offset = 44;
  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let s = Math.max(-1, Math.min(1, channelData[ch][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }
  return new Blob([arrBuf], { type: 'audio/wav' });
}

exportBtn.addEventListener('click', () => {
  if (!audioBuffer) return;
  if (selEnd <= selStart) {
    statusEl.textContent = 'تأكد إن البداية أصغر من النهاية.';
    statusEl.className = 'status error';
    return;
  }
  statusEl.textContent = 'جاري التصدير...';
  statusEl.className = 'status';
  setTimeout(() => {
    const cut = sliceAudioBuffer(audioBuffer, selStart, selEnd);
    const blob = bufferToWav(cut);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cut-audio.wav';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusEl.textContent = 'تم التحميل بنجاح.';
    statusEl.className = 'status ok';
  }, 30);
});