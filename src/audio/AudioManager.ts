export class AudioManager {
  private titleAudio: HTMLAudioElement;
  private titleAmbienceAudio: HTMLAudioElement;
  private gamePlaylist: HTMLAudioElement[] = [];
  
  private currentGameTrackIndex: number = 0;
  
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
  private pendingFadeTimeout: number | null = null;
  
  private MAX_VOLUME = 0.5;
  private TITLE_AMBIENCE_MIX = 0.15;
  private MUSIC_CROSSFADE_MS = 1200;
  private MUSIC_ENTRY_DELAY_MS = 1500;
  
  constructor() {
    this.titleAudio = new Audio(`${import.meta.env.BASE_URL}music/Title_1.mp3`);
    this.titleAudio.loop = true;
    this.titleAudio.volume = 0;

    this.titleAmbienceAudio = new Audio(`${import.meta.env.BASE_URL}sfx/Ambiance_1.wav`);
    this.titleAmbienceAudio.loop = true;
    this.titleAmbienceAudio.volume = 0;

    for (const trackName of ['Game_1.mp3', 'Game_2.mp3', 'Game_3.mp3']) {
      const track = new Audio(`${import.meta.env.BASE_URL}music/${trackName}`);
      track.volume = 0;
      this.gamePlaylist.push(track);
    }

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
    this.transitionMusic('title');
  }
  
  public playGameMusic() {
    this.transitionMusic('game');
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
      this.titleAudio.volume = this.titleVolume;
      this.titleAmbienceAudio.volume = this.titleVolume * this.TITLE_AMBIENCE_MIX;
      const gameTrack = this.getCurrentGameTrack();
      if (gameTrack) gameTrack.volume = this.gameVolume;
    }
    return this.isMusicMuted;
  }

  public toggleSfx(): boolean {
    this.isSfxMuted = !this.isSfxMuted;
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

  private transitionMusic(target: 'title' | 'game') {
    this.clearPendingFadeTimeout();

    const shouldDelayIncoming =
      target === 'title'
        ? this.gameVolume > 0.01 || this.targetGameVolume > 0.01
        : this.titleVolume > 0.01 || this.targetTitleVolume > 0.01;

    if (target === 'title') {
      this.targetGameVolume = 0;
      this.startFader();

      if (shouldDelayIncoming) {
        this.pendingFadeTimeout = window.setTimeout(() => {
          this.pendingFadeTimeout = null;
          this.targetTitleVolume = this.MAX_VOLUME;
          this.startFader();
        }, this.MUSIC_ENTRY_DELAY_MS);
      } else {
        this.targetTitleVolume = this.MAX_VOLUME;
        this.startFader();
      }
      return;
    }

    this.targetTitleVolume = 0;
    this.startFader();

    if (shouldDelayIncoming) {
      this.pendingFadeTimeout = window.setTimeout(() => {
        this.pendingFadeTimeout = null;
        this.startGameMusicImmediate();
      }, this.MUSIC_ENTRY_DELAY_MS);
    } else {
      this.startGameMusicImmediate();
    }
  }

  private clearPendingFadeTimeout() {
    if (this.pendingFadeTimeout !== null) {
      window.clearTimeout(this.pendingFadeTimeout);
      this.pendingFadeTimeout = null;
    }
  }

  private startGameMusicImmediate() {
    this.targetGameVolume = this.MAX_VOLUME;
    this.fadeFromGameVolume = this.MAX_VOLUME;
    this.gameVolume = this.MAX_VOLUME;

    const gameTrack = this.getCurrentGameTrack();
    if (this.initialized && gameTrack && gameTrack.paused) {
      gameTrack.play().catch(e => console.warn('Game audio play prevented:', e));
    }

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
