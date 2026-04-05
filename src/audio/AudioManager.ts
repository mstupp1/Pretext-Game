export class AudioManager {
  private titleAudio: HTMLAudioElement;
  private titleAmbienceAudio: HTMLAudioElement;
  private gamePlaylist: HTMLAudioElement[] = [];
  
  private currentGameTrackIndex: number = 0;
  
  private gameAmbienceAudioA: HTMLAudioElement;
  private gameAmbienceAudioB: HTMLAudioElement;
  private currentAmbienceInstance: 'A' | 'B' = 'A';
  private ambienceFadeFactor: number = 0;
  private isAmbienceCrossfading: boolean = false;
  private ambienceFadeInVolume: number = 0;
  private ambienceLoopInterval: number | null = null;
  
  private titleVolume: number = 0;
  private gameVolume: number = 0;

  private applauseSfx: HTMLAudioElement[] = [];
  private scoreSfx: HTMLAudioElement[] = [];
  private pages1Sfx: HTMLAudioElement;
  private pages2Sfx: HTMLAudioElement;
  private chapterSfx: HTMLAudioElement;
  private movementSfx: HTMLAudioElement;
  private nosubmitSfx: HTMLAudioElement;
  private timewarning1Sfx: HTMLAudioElement;
  private timewarning2Sfx: HTMLAudioElement;

  private menus1Sfx: HTMLAudioElement;
  private camera1Sfx: HTMLAudioElement;
  private restart1Sfx: HTMLAudioElement;
  private countdown3Sfx: HTMLAudioElement;
  private countdown2Sfx: HTMLAudioElement;
  private countdown1Sfx: HTMLAudioElement;
  private countdownGoSfx: HTMLAudioElement;
  private selectLetterSfx: HTMLAudioElement;
  private backspaceSfx: HTMLAudioElement;

  private isMusicMuted: boolean = false;
  private isSfxMuted: boolean = false;

  private targetTitleVolume: number = 0;
  private targetGameVolume: number = 0;
  
  private initialized: boolean = false;
  private fadeInterval: number | null = null;
  private isFading: boolean = false;
  private fadeStartTime: number = 0;
  private fadeFromTitleVolume: number = 0;
  private fadeFromGameVolume: number = 0;
  
  private MAX_VOLUME = 0.5;
  private TITLE_AMBIENCE_MIX = 0.15;
  private GAME_AMBIENCE_MIX = 0.15; // Very soft ambiance
  private MUSIC_CROSSFADE_MS = 1200;
  
  private AMBIENCE_TRIM_START = 5.0;
  private AMBIENCE_TRIM_END_OFFSET = 0.5;
  private AMBIENCE_CROSSFADE_DURATION = 2.0;
  
  constructor() {
    this.titleAudio = new Audio(`${import.meta.env.BASE_URL}music/Title_1.mp3`);
    this.titleAudio.loop = true;
    this.titleAudio.volume = 0;

    this.titleAmbienceAudio = new Audio(`${import.meta.env.BASE_URL}sfx/Ambiance_1.wav`);
    this.titleAmbienceAudio.loop = true;
    this.titleAmbienceAudio.volume = 0;

    for (const trackName of ['Game_1.mp3', 'Game_2.mp3', 'Game_3.mp3', 'Game_4.mp3', 'Game_5.mp3', 'Game_6.mp3']) {
      const track = new Audio(`${import.meta.env.BASE_URL}music/${trackName}`);
      track.volume = 0;
      this.gamePlaylist.push(track);
    }

    this.gameAmbienceAudioA = new Audio(`${import.meta.env.BASE_URL}sfx/Ambiance_2.mp3`);
    this.gameAmbienceAudioB = new Audio(`${import.meta.env.BASE_URL}sfx/Ambiance_2.mp3`);

    this.currentGameTrackIndex = Math.floor(Math.random() * this.gamePlaylist.length);
    
    // Setup playlist looping
    this.gamePlaylist.forEach((track) => {
      track.addEventListener('ended', () => {
        this.playNextGameTrack();
      });
    });
    
    this.setupInteractionListeners();

    // Load SFX
    for (let i = 1; i <= 5; i++) {
      const audio = new Audio(`${import.meta.env.BASE_URL}sfx/applause_${i}.wav`);
      audio.volume = 0.6;
      this.applauseSfx.push(audio);
    }

    for (let i = 1; i <= 3; i++) {
      const audio = new Audio(`${import.meta.env.BASE_URL}sfx/score_${i}.wav`);
      audio.volume = 0.3;
      this.scoreSfx.push(audio);
    }

    this.pages1Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/pages_1.wav`);
    this.pages1Sfx.volume = 0.6;

    this.pages2Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/pages_2.wav`);
    this.pages2Sfx.volume = 0.6;

    this.chapterSfx = new Audio(`${import.meta.env.BASE_URL}sfx/chapter_1.wav`);
    this.chapterSfx.volume = 0.3;

    this.movementSfx = new Audio(`${import.meta.env.BASE_URL}sfx/movement_1.wav`);
    this.movementSfx.volume = 0.15;

    this.nosubmitSfx = new Audio(`${import.meta.env.BASE_URL}sfx/nosubmit_1.wav`);
    this.nosubmitSfx.volume = 0.3;

    this.timewarning1Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/timewarning_1.wav`);
    this.timewarning1Sfx.volume = 0.3;

    this.timewarning2Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/timewarning_2.wav`);
    this.timewarning2Sfx.volume = 0.3;

    this.menus1Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/menus_1.wav`);
    this.menus1Sfx.volume = 0.15; // Soft UI sound effect volume

    this.camera1Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/camera_1.wav`);
    this.camera1Sfx.volume = 0.4;

    this.restart1Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/restart_1.wav`);
    this.restart1Sfx.volume = 0.4;

    this.countdown3Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/countdown_3.wav`);
    this.countdown3Sfx.volume = 0.3;

    this.countdown2Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/countdown_2.wav`);
    this.countdown2Sfx.volume = 0.3;

    this.countdown1Sfx = new Audio(`${import.meta.env.BASE_URL}sfx/countdown_1.wav`);
    this.countdown1Sfx.volume = 0.3;

    this.countdownGoSfx = new Audio(`${import.meta.env.BASE_URL}sfx/countdown_go.wav`);
    this.countdownGoSfx.volume = 0.32;

    this.selectLetterSfx = new Audio(`${import.meta.env.BASE_URL}sfx/selectletter_1.wav`);
    this.selectLetterSfx.volume = 1.0; // Full volume

    this.backspaceSfx = new Audio(`${import.meta.env.BASE_URL}sfx/backspace_1.wav`);
    this.backspaceSfx.volume = 0.2; // Soft UI sound effect volume
  }
  
  private setupInteractionListeners() {
    const handleFirstInteraction = () => {
      if (this.initialized) return;
      this.initialized = true;

      // If a track was requested to play before interaction, start it now
      if (this.targetTitleVolume > 0 && this.titleAudio.paused) {
        this.titleVolume = 0;
        this.titleAudio.volume = 0;
        this.titleAudio.play().catch(e => console.warn('Title audio autoplay prevented:', e));
        this.titleAmbienceAudio.volume = 0;
        this.titleAmbienceAudio.play().catch(e => console.warn('Title ambience autoplay prevented:', e));
        this.startFader();
      }

      if (this.targetGameVolume > 0) {
        const gameTrack = this.getCurrentGameTrack();
        if (gameTrack && gameTrack.paused) {
          this.gameVolume = 0;
          gameTrack.volume = 0;
          gameTrack.play().catch(e => console.warn('Game audio autoplay prevented:', e));
          this.startGameAmbience();
          this.startFader();
        }
      }

      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
    
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
  }
  
  private getCurrentGameTrack(): HTMLAudioElement | null {
    if (this.gamePlaylist.length === 0) return null;
    return this.gamePlaylist[this.currentGameTrackIndex];
  }
  
  private playNextGameTrack() {
    if (this.gamePlaylist.length === 0) return;
    
    const currentTrack = this.getCurrentGameTrack();
    if (currentTrack) {
      currentTrack.pause();
      currentTrack.currentTime = 0;
    }
    
    this.currentGameTrackIndex = (this.currentGameTrackIndex + 1) % this.gamePlaylist.length;
    
    const nextTrack = this.getCurrentGameTrack();
    if (nextTrack) {
      nextTrack.volume = this.gameVolume;
      if (this.initialized && this.targetGameVolume > 0) {
        nextTrack.play().catch(e => console.warn('Next track playback prevented:', e));
      }
    }
  }
  
  public playTitleMusic() {
    this.targetTitleVolume = this.MAX_VOLUME;
    this.targetGameVolume = 0;
    this.startFader();
  }

  public restartTitleMusic() {
    this.titleAudio.currentTime = 0;
    this.titleAmbienceAudio.currentTime = 0;
    this.playTitleMusic();
  }

  public fadeOutTitleMusic() {
    this.targetTitleVolume = 0;
    this.startFader();
  }
  
  public playGameMusic() {
    this.targetTitleVolume = 0;
    this.startGameMusicImmediate();
    this.startFader();
  }
  
  public stopAllMusic() {
    this.targetTitleVolume = 0;
    this.targetGameVolume = 0;
    this.startFader();
  }

  private playSfx(audio: HTMLAudioElement) {
    if (!this.initialized || this.isSfxMuted) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.warn('SFX play prevented:', e));
  }

  public toggleMusic(): boolean {
    this.isMusicMuted = !this.isMusicMuted;
    if (this.isMusicMuted) {
      this.titleAudio.volume = 0;
      this.titleAmbienceAudio.volume = 0;
      this.gamePlaylist.forEach(track => track.volume = 0);
    } else {
      this.applyMusicVolumes();
    }
    return this.isMusicMuted;
  }

  public toggleSfx(): boolean {
    this.isSfxMuted = !this.isSfxMuted;
    this.applyMusicVolumes();
    return this.isSfxMuted;
  }

  public getMusicMuted(): boolean {
    return this.isMusicMuted;
  }

  public getSfxMuted(): boolean {
    return this.isSfxMuted;
  }

  public playMenuNav() {
    this.playSfx(this.menus1Sfx);
  }

  public playPause() {
    this.playSfx(this.camera1Sfx);
  }

  public playRestart() {
    this.playSfx(this.restart1Sfx);
  }

  public playCountdown(value: 3 | 2 | 1 | 0) {
    if (value === 3) {
      this.playSfx(this.countdown3Sfx);
      return;
    }

    if (value === 2) {
      this.playSfx(this.countdown2Sfx);
      return;
    }

    if (value === 1) {
      this.playSfx(this.countdown1Sfx);
      return;
    }

    this.playSfx(this.countdownGoSfx);
  }

  public playSelectLetter() {
    this.playSfx(this.selectLetterSfx);
  }

  public playBackspace() {
    this.playSfx(this.backspaceSfx);
  }

  public playApplause(chapter: number) {
    const index = Math.min(Math.max(chapter - 1, 0), 4);
    this.playSfx(this.applauseSfx[index]);
  }

  public playPagesFromTitle() {
    this.playSfx(this.pages1Sfx);
  }

  public playPagesFromGameOver() {
    this.playSfx(this.pages2Sfx);
  }

  public playChapterUnlock() {
    this.playSfx(this.chapterSfx);
  }

  public playMovement() {
    this.playSfx(this.movementSfx);
  }

  public playNoSubmit() {
    this.playSfx(this.nosubmitSfx);
  }

  public playScore(scoreValue: number) {
    let index = 0;
    if (scoreValue >= 30) index = 2;
    else if (scoreValue >= 15) index = 1;
    this.playSfx(this.scoreSfx[index]);
  }

  public playTimeWarning1() {
    this.playSfx(this.timewarning1Sfx);
  }

  public playTimeWarning2() {
    this.playSfx(this.timewarning2Sfx);
  }

  private chooseRandomGameTrack() {
    if (this.gamePlaylist.length === 0) return;

    const previousIndex = this.currentGameTrackIndex;
    if (this.gamePlaylist.length === 1) {
      this.currentGameTrackIndex = 0;
      return;
    }

    let nextIndex = previousIndex;
    while (nextIndex === previousIndex) {
      nextIndex = Math.floor(Math.random() * this.gamePlaylist.length);
    }

    this.currentGameTrackIndex = nextIndex;
  }

  private startGameMusicImmediate() {
    this.targetGameVolume = this.MAX_VOLUME;
    this.fadeFromGameVolume = this.MAX_VOLUME;
    this.gameVolume = this.MAX_VOLUME;

    this.gamePlaylist.forEach(track => {
      track.pause();
      track.currentTime = 0;
    });

    this.chooseRandomGameTrack();

    const gameTrack = this.getCurrentGameTrack();
    if (this.initialized && gameTrack) {
      gameTrack.play().catch(e => console.warn('Game audio play prevented:', e));
    }

    this.startGameAmbience();
    this.applyMusicVolumes();
  }

  private startGameAmbience() {
    if (!this.initialized) return;
    
    this.currentAmbienceInstance = 'A';
    this.isAmbienceCrossfading = false;
    this.ambienceFadeFactor = 0;
    this.ambienceFadeInVolume = 0; // Reset for intro fade
    
    this.gameAmbienceAudioA.currentTime = this.AMBIENCE_TRIM_START;
    this.gameAmbienceAudioA.play().catch(e => console.warn('Game ambiance A play prevented:', e));
    this.gameAmbienceAudioB.pause();
    
    if (this.ambienceLoopInterval) clearInterval(this.ambienceLoopInterval);
    this.ambienceLoopInterval = window.setInterval(() => this.updateAmbienceLoop(), 100);
  }

  private updateAmbienceLoop() {
    // Handle initial fade-in independent of music
    if (this.ambienceFadeInVolume < 1) {
      this.ambienceFadeInVolume = Math.min(1, this.ambienceFadeInVolume + 0.08); // Approx 1.2s fade-in
    }

    const main = this.currentAmbienceInstance === 'A' ? this.gameAmbienceAudioA : this.gameAmbienceAudioB;
    const secondary = this.currentAmbienceInstance === 'A' ? this.gameAmbienceAudioB : this.gameAmbienceAudioA;
    
    if (main.duration > 0) {
      const loopEndPoint = main.duration - this.AMBIENCE_TRIM_END_OFFSET;
      const crossfadeStartPoint = loopEndPoint - this.AMBIENCE_CROSSFADE_DURATION;
      
      // Start secondary track when approaching end
      if (main.currentTime >= crossfadeStartPoint && !this.isAmbienceCrossfading) {
        this.isAmbienceCrossfading = true;
        secondary.currentTime = this.AMBIENCE_TRIM_START;
        secondary.play().catch(e => console.warn('Ambience loop secondary play prevented:', e));
      }
      
      // Handle crossfade progress
      if (this.isAmbienceCrossfading) {
        const fadeProgress = (main.currentTime - crossfadeStartPoint) / this.AMBIENCE_CROSSFADE_DURATION;
        this.ambienceFadeFactor = Math.max(0, Math.min(1, fadeProgress));
        
        if (main.currentTime >= loopEndPoint) {
          main.pause();
          this.currentAmbienceInstance = this.currentAmbienceInstance === 'A' ? 'B' : 'A';
          this.isAmbienceCrossfading = false;
          this.ambienceFadeFactor = 0;
        }
      }
    }
    
    // Always sync volumes while active
    this.applyMusicVolumes();
  }

  private startFader() {
    if (this.initialized) {
      if (this.targetTitleVolume > 0) {
        if (this.titleAudio.paused) {
          this.titleAudio.play().catch(e => console.warn('Title audio play prevented:', e));
        }
        if (this.titleAmbienceAudio.paused) {
          this.titleAmbienceAudio.play().catch(e => console.warn('Title ambience play prevented:', e));
        }
      }

      const gameTrack = this.getCurrentGameTrack();
      if (this.targetGameVolume > 0 && gameTrack && gameTrack.paused) {
        gameTrack.play().catch(e => console.warn('Game audio play prevented:', e));
        this.startGameAmbience();
      }
    }

    this.fadeFromTitleVolume = this.titleVolume;
    this.fadeFromGameVolume = this.gameVolume;
    this.fadeStartTime = performance.now();

    if (this.fadeInterval !== null) {
      window.cancelAnimationFrame(this.fadeInterval);
    }

    this.isFading = true;

    const step = (now: number) => {
      const elapsed = now - this.fadeStartTime;
      const progress = Math.min(1, elapsed / this.MUSIC_CROSSFADE_MS);
      const eased = this.easeInOutSine(progress);

      this.titleVolume = this.lerp(this.fadeFromTitleVolume, this.targetTitleVolume, eased);
      this.gameVolume = this.lerp(this.fadeFromGameVolume, this.targetGameVolume, eased);

      this.applyMusicVolumes();

      if (progress >= 1) {
        this.titleVolume = this.targetTitleVolume;
        this.gameVolume = this.targetGameVolume;
        this.applyMusicVolumes();
        this.pauseSilentTracks();
        this.fadeInterval = null;
        this.isFading = false;
        return;
      }

      this.fadeInterval = window.requestAnimationFrame(step);
    };

    this.fadeInterval = window.requestAnimationFrame(step);
  }

  private applyMusicVolumes() {
    this.titleVolume = Math.max(0, Math.min(1, this.titleVolume));
    this.gameVolume = Math.max(0, Math.min(1, this.gameVolume));

    this.titleAudio.volume = this.isMusicMuted ? 0 : this.titleVolume;
    this.titleAmbienceAudio.volume = this.isMusicMuted ? 0 : this.titleVolume * this.TITLE_AMBIENCE_MIX;

    const gameTrack = this.getCurrentGameTrack();
    if (gameTrack) {
      gameTrack.volume = this.isMusicMuted ? 0 : this.gameVolume;
    }

    // Apply ambiance volumes (tied to SFX mute, follows music track fade, includes own intro fade)
    const masterAmbVolume = (this.isSfxMuted ? 0 : this.gameVolume) * this.GAME_AMBIENCE_MIX * this.ambienceFadeInVolume;
    if (this.isAmbienceCrossfading) {
      if (this.currentAmbienceInstance === 'A') {
        this.gameAmbienceAudioA.volume = masterAmbVolume * (1 - this.ambienceFadeFactor);
        this.gameAmbienceAudioB.volume = masterAmbVolume * this.ambienceFadeFactor;
      } else {
        this.gameAmbienceAudioB.volume = masterAmbVolume * (1 - this.ambienceFadeFactor);
        this.gameAmbienceAudioA.volume = masterAmbVolume * this.ambienceFadeFactor;
      }
    } else {
      this.gameAmbienceAudioA.volume = this.currentAmbienceInstance === 'A' ? masterAmbVolume : 0;
      this.gameAmbienceAudioB.volume = this.currentAmbienceInstance === 'B' ? masterAmbVolume : 0;
    }
  }

  private pauseSilentTracks() {
    if (this.titleVolume === 0 && !this.titleAudio.paused) {
      this.titleAudio.pause();
    }
    if (this.titleVolume === 0 && !this.titleAmbienceAudio.paused) {
      this.titleAmbienceAudio.pause();
    }

    const gameTrack = this.getCurrentGameTrack();
    if (this.gameVolume === 0 && gameTrack && !gameTrack.paused) {
      gameTrack.pause();
    }

    if (this.gameVolume === 0) {
      this.gameAmbienceAudioA.pause();
      this.gameAmbienceAudioB.pause();
      if (this.ambienceLoopInterval) {
        clearInterval(this.ambienceLoopInterval);
        this.ambienceLoopInterval = null;
      }
    }
  }

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  private easeInOutSine(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return -(Math.cos(Math.PI * clamped) - 1) / 2;
  }
}

export const audioManager = new AudioManager();
