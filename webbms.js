class ZipArchive {
  constructor(buffer) {
    this._buffer = buffer;
    this._view = new DataView(this._buffer);

    this._parseFileList();
  }

  getFileList() {
    return Object.keys(this._files);
  }

  getContentString(fileName) {
    const file = this._files[fileName];
    if (!file) {
      return null;
    }

    return this._getString(file.offset, file.length);
  }

  getContentBuffer(fileName) {
    const file = this._files[fileName];
    if (!file) {
      return null;
    }

    return this._buffer.slice(file.offset, file.offset + file.length);
  }

  _parseFileList() {
    this._files = {};

    let headerOffset = this._getCentralHeaderTopOffset();
    while (this._view.getUint32(headerOffset, true) === 0x02014b50) {
      const length = this._view.getUint32(headerOffset + 20, true);
      const name = this._getString(headerOffset + 46,
          this._view.getUint16(headerOffset + 28, true));
      const offset = this._skipLocalHeader(
          this._view.getUint32(headerOffset + 42, true));

      this._files[name] = { length: length, offset: offset };

      headerOffset += 46 +
        this._view.getUint16(headerOffset + 28, true) +
        this._view.getUint16(headerOffset + 30, true) +
        this._view.getUint16(headerOffset + 32, true);
    }
  }

  _skipLocalHeader(offset) {
    return offset + 30 +
      this._view.getUint16(offset + 26, true) +
      this._view.getUint16(offset + 28, true);
  }

  _getCentralHeaderTopOffset() {
    let endHeaderOffset = this._view.byteLength - 5;
    while (endHeaderOffset >= 0) {
      if (this._view.getUint32(endHeaderOffset, true) === 0x06054b50) {
        break;
      }
      endHeaderOffset--;
    }

    return this._view.getUint32(endHeaderOffset + 16, true);
  }

  _getString(offset, n) {
    let result = '';
    for (let i = 0; i < n; i++) {
      result += String.fromCharCode(this._view.getUint8(offset + i));
    }
    return result;
  }
}

class BmsParser {
  constructor(content) {
    this._content = content;

    this.BACKGROUND = '01';
    this.KEYS_1P = ['11', '12', '13', '14', '15', '16', '17', '18', '19'];
  }

  parse() {
    this.wavs = {};
    this.bmps = {};
    this.bars = [];
    this.bpmChanges = [];

    this._content.split(/\r?\n/).map(line => {
      if (this._parseAttribute(line)) {
        return;
      }

      if (this._parseResource(line)) {
        return;
      }

      let m;

      m = line.match(/^#([0-9]{3})02:(.+)$/);
      if (m) {
        const bar = parseInt(m[1], 10);
        const scale = parseFloat(m[2]);
        this.bpmChanges.push({ time: bar, scale: scale });
        this.bpmChanges.push({ time: bar + 1, scale: 1 });
        return;
      }

      m = line.match(/^#([0-9]{3})([0-9]{2}):([0-9A-Z]+)$/);
      if (m) {
        const bar = parseInt(m[1], 10);
        const ch = m[2];
        const rawNotes = m[3].split(/(.{2})/).filter(Boolean);

        const notes = rawNotes.map((note, i) => {
          if (note === '00' || note === '03') {
            return null;
          }

          return { time: (i / rawNotes.length) + bar, key: note };
        }).filter(Boolean);

        if (notes.length > 0) {
          this.bars[bar] = this.bars[bar] || {};
          this.bars[bar][ch] = (this.bars[bar][ch] || []).concat(notes);
        }

        const bpmChanges = rawNotes.map((note, i) => {
          if (ch === '03') {
            return { time: (i / rawNotes.length) + bar, bpm: parseInt(note, 16) };
          }
        }).filter(Boolean);
        this.bpmChanges = this.bpmChanges.concat(bpmChanges);
      }
    });

    for (let i = 0; i < this.bars.length; i++) {
      this.bars[i] = this.bars[i] || {};
    }

    this.bars.map(bar => {
      Object.keys(bar).map(ch => {
        bar[ch].sort((a, b) => a.time - b.time);
      });
    });

    this.bpmChanges.sort((a, b) => a.time - b.time);
    this.bpmChanges = this.bpmChanges.reduce((acc, change) => {
      const last = acc[acc.length - 1] || {};
      if (last.time !== change.time) {
        return acc.concat(change);
      }

      last.bpm = last.bpm || change.bpm;
      last.scale = last.scale || change.scale;
      if (last.scale && change.scale && change.scale !== 1) {
        last.scale = change.scale;
      }
      return acc;
    }, []);
  }

  getNotesBetween(fromBar, toBar, ch) {
    let notes = [];

    function timeBetweenFromAndTo(note) {
      return fromBar < note.time && note.time <= toBar;
    }

    for (let i = Math.floor(fromBar); i <= Math.floor(toBar); i++) {
      if (i < 0 || i >= this.bars.length) {
        continue;
      }

      if (!this.bars[i][ch]) {
        continue;
      }

      notes = notes.concat(this.bars[i][ch].filter(timeBetweenFromAndTo));
    }

    return notes;
  }

  getBpmChangesBetween(fromBar, toBar) {
    return this.bpmChanges.filter(note =>
        fromBar < note.time && note.time <= toBar);
  }

  _parseAttribute(line) {
    let m;

    m = line.match(/^#PLAYER ([0-9]+)$/);
    if (m) {
      this.player = parseInt(m[1], 10);
      return true;
    }
    m = line.match(/^#GENRE (.+)$/);
    if (m) {
      this.genre = m[1];
      return true;
    }
    m = line.match(/^#TITLE (.+)$/);
    if (m) {
      this.title = m[1];
      return true;
    }
    m = line.match(/^#ARTIST (.+)$/);
    if (m) {
      this.artist = m[1];
      return true;
    }
    m = line.match(/^#BPM ([0-9]+)$/);
    if (m) {
      this.bpm = parseInt(m[1], 10);
      return true;
    }
    m = line.match(/^#PLAYLEVEL ([0-9]+)$/);
    if (m) {
      this.playlevel = parseInt(m[1], 10);
      return true;
    }
    m = line.match(/^#RANK ([0-9]+)$/);
    if (m) {
      this.rank = parseInt(m[1], 10);
      return true;
    }
    m = line.match(/^#TOTAL ([0-9]+)$/);
    if (m) {
      this.total = parseInt(m[1], 10);
      return true;
    }
    m = line.match(/^#VOLWAV ([0-9]+)$/);
    if (m) {
      this.volwav = parseInt(m[1], 10);
      return true;
    }
    m = line.match(/^#STAGEFILE (.+)$/);
    if (m) {
      this.stagefile = m[1];
      return true;
    }

    return false;
  }

  _parseResource(line) {
    let m;

    m = line.match(/^#WAV([0-9A-Z]{2}) (.+)$/);
    if (m) {
      this.wavs[m[1]] = m[2];
      return true;
    }
    m = line.match(/^#BMP([0-9A-Z]{2}) (.+)$/);
    if (m) {
      this.bmps[m[1]] = m[2];
      return true;
    }

    return false;
  }
}

class PlayerModel {
  constructor(archiveName, bmsName) {
    this._archiveName = archiveName;
    this._bmsName = bmsName;

    this._barWindow = 1;
    this._barCnt = -1;
  }

  load() {
    return this._loadXhr().then(buffer => {
      this._archive = new ZipArchive(buffer);
      this._bms = new BmsParser(
          this._archive.getContentString(this._bmsName));

      this._bms.parse();
      this._currentBpm = this._bms.bpm;
      this._currentBarScale = 1;
    });
  }

  _loadXhr() {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('GET', this._archiveName, true);
      request.responseType = 'arraybuffer';
      request.onload = () => {
        if (request.status === 200) {
          resolve(request.response);
        } else {
          reject(request.status);
        }
      };
      request.send();
    });
  }

  getAudioFileList() {
    const fileList = {};
    this._archive.getFileList().map(fileName => {
      fileList[fileName.toLowerCase()] = fileName;
    });

    const audios = {};
    Object.keys(this._bms.wavs).map(key => {
      let wavFileName = this._bms.wavs[key].toLowerCase();
      if (fileList[wavFileName]) {
        audios[key] = fileList[wavFileName];
        return;
      }
      const m = wavFileName.match(/^(.+)\.wav$/);
      if (m) {
        wavFileName = m[1];
      }
      if (fileList[wavFileName + '.ogg']) {
        audios[key] = fileList[wavFileName + '.ogg'];
        return;
      }
    });
    return audios;
  }

  getFileBuffer(fileName) {
    return this._archive.getContentBuffer(fileName);
  }

  update(diffMsec) {
    let passedMsec = 0;
    let nextBarCnt = this._barCnt;
    for (let i = 0; i < 32; i++) {
      const effectiveBpm = this._currentBpm / this._currentBarScale;
      const tmpBarCnt = nextBarCnt +
        effectiveBpm * (diffMsec - passedMsec) / (4 * 1000 * 60);

      const notes = this._bms.getBpmChangesBetween(nextBarCnt, tmpBarCnt);
      if (notes.length === 0) {
        nextBarCnt = tmpBarCnt;
        break;
      }

      const change = notes[0];
      if (change.bpm) {
        this._currentBpm = change.bpm;
      }
      if (change.scale) {
        this._currentBarScale = change.scale;
      }

      passedMsec += (change.time - nextBarCnt) * 4 * 1000 * 60 / effectiveBpm;
      nextBarCnt = change.time;
    }

    const prevBarCnt = this._barCnt;
    this._barCnt = nextBarCnt;

    const channels = [this._bms.BACKGROUND].concat(this._bms.KEYS_1P);
    const playedNotes = Array.prototype.concat.apply([],
      channels.map(ch =>
        this._bms.getNotesBetween(prevBarCnt, nextBarCnt, ch)));

    return { playedNotes: playedNotes };
  }
}

class PlayerTextSurface {
  resume() {
  }

  update(/* state */) {
  }

  pause() {
  }
}

class PlayerController {
  resume() {
    this._modelLoaded = false;

    // this._model = new PlayerModel('Aeventyr.zip', 'Aventyr[N].bme');
    // this._model = new PlayerModel('Heiseng.zip', 'heiseng7.bme');
    // this._model = new PlayerModel('Poppin.zip', 'ps_normal.bme');
    this._model = new PlayerModel('Maid.zip', '_DoS_Maid_01_normal7.bme');
    this._model.load().then(() => {
      return this._loadAudios();
    }).then(() => {
      this._modelLoaded = true;
      this._lastTime = new Date().getTime();
    }).catch(e => {
      console.log(e);
    });

    this._surface = new PlayerTextSurface();
    this._surface.resume();
  }

  update() {
    if (!this._modelLoaded) {
      return;
    }

    const currentTime = new Date().getTime();
    const state = this._model.update(currentTime - this._lastTime);

    this._surface.update(state);
    this._updateAudios(state.playedNotes);

    this._lastTime = currentTime;
  }

  pause() {
    this._model = null;

    this._surface.pause();
    this._surface = null;

    this._audioBuffers = null;
    this._audioContext = null;
  }

  _loadAudios() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    this._audioBuffers = {};
    this._audioContext = new AudioContext();

    const fileList = this._model.getAudioFileList();

    return Promise.all(Object.keys(fileList).map(
          key => this._loadAudio(key, fileList[key])));
  }

  _loadAudio(key, fileName) {
    return new Promise((resolve, reject) => {
      this._audioContext.decodeAudioData(
          this._model.getFileBuffer(fileName),
          audioBuffer => {
            this._audioBuffers[key] = audioBuffer;
            resolve();
          }, () => {
            reject('failed to decode audio data');
          });
    });
  }

  _updateAudios(notes) {
    document.write(notes.map(note => note.key).join(' ') + ' ');

    notes.map(note => {
      if (this._audioBuffers[note.key]) {
        const source = this._audioContext.createBufferSource();
        source.buffer = this._audioBuffers[note.key];
        source.connect(this._audioContext.destination, 0, 0);
        source.start(0);
      } else {
        console.log('warning: key ' + note.key + ' does not exist');
      }
    });
  }
}

export class WebBms {
  start() {
    this.controller = new PlayerController();
    this.controller.resume();

    this.intervalId = setInterval(() => {
      try {
        this.controller.update();
      } catch (e) {
        console.log(e);
        this.stop();
      }
    }, 15);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.controller) {
      this.controller.pause();
      this.controller = null;
    }
  }
}
