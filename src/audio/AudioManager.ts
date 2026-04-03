export class AudioManager {
  private titleAudio: HTMLAudioElement;
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

  private isMusicMuted: boolean = false;
  private isSfxMuted: boolean = false;

  private targetTitleVolume: number = 0;
  private targetGameVolume: number = 0;
  
  private initialized: boolean = false;
  private fadeInterval: number | null = null;
  private isFading: boolean = false;
  
  private MAX_VOLUME = 0.5;
  private FADE_STEP = 0.05; // 5% volume change per interval tick
  private FADE_INTERVAL_MS = 50;
  
  constructor() {
    this.titleAudio = new Audio(`${import.meta.env.BASE_URL}music/Title_1.mp3`);
    this.titleAudio.loop = true;
    this.titleAudio.volume = 0;
    
    const gameTrack1 = new Audio(`${import.meta.env.BASE_URL}music/Game_1.mp3`);
    gameTrack1.volume = 0;
    this.gamePlaylist.push(gameTrack1);
    
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
    this.movementSfx.volume = 0.2;

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
    this.targetTitleVolume = this.MAX_VOLUME;
    this.targetGameVolume = 0;
    
    if (this.initialized && this.titleAudio.paused) {
      this.titleAudio.play().catch(e => console.warn('Title audio play prevented:', e));
    }
    
    this.startFader();
  }
  
  public playGameMusic() {
    this.targetTitleVolume = 0;
    this.targetGameVolume = this.MAX_VOLUME;
    
    const gameTrack = this.getCurrentGameTrack();
    if (this.initialized && gameTrack && gameTrack.paused) {
      gameTrack.play().catch(e => console.warn('Game audio play prevented:', e));
    }
    
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
      this.gamePlaylist.forEach(track => track.volume = 0);
    } else {
      this.titleAudio.volume = this.titleVolume;
      const gameTrack = this.getCurrentGameTrack();
      if (gameTrack) gameTrack.volume = this.gameVolume;
    }
    return this.isMusicMuted;
  }

  public toggleSfx(): boolean {
    this.isSfxMuted = !this.isSfxMuted;
    return this.isSfxMuted;
  }

  public playMenuNav() {
    this.playSfx(this.menus1Sfx);
  }

  public playSelectLetter() {
    this.playSfx(this.selectLetterSfx);
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

  private startFader() {
    if (this.isFading) return;
    this.isFading = true;
    
    this.fadeInterval = window.setInterval(() => {
      let isTitleDone = false;
      let isGameDone = false;
      
      // Update Title Volume
      if (Math.abs(this.titleVolume - this.targetTitleVolume) <= this.FADE_STEP) {
        this.titleVolume = this.targetTitleVolume;
        isTitleDone = true;
      } else {
        this.titleVolume += this.titleVolume < this.targetTitleVolume ? this.FADE_STEP : -this.FADE_STEP;
      }
      
      // Update Game Volume
      if (Math.abs(this.gameVolume - this.targetGameVolume) <= this.FADE_STEP) {
        this.gameVolume = this.targetGameVolume;
        isGameDone = true;
      } else {
        this.gameVolume += this.gameVolume < this.targetGameVolume ? this.FADE_STEP : -this.FADE_STEP;
      }
      
      // Clamp volumes to prevent floating point errors
      this.titleVolume = Math.max(0, Math.min(1, this.titleVolume));
      this.gameVolume = Math.max(0, Math.min(1, this.gameVolume));
      
      // Apply volumes
      this.titleAudio.volume = this.isMusicMuted ? 0 : this.titleVolume;
      const gameTrack = this.getCurrentGameTrack();
      if (gameTrack) {
        gameTrack.volume = this.isMusicMuted ? 0 : this.gameVolume;
      }
      
      // Pause completely faded out tracks
      if (this.titleVolume === 0 && !this.titleAudio.paused) {
        this.titleAudio.pause();
      }
      if (this.gameVolume === 0 && gameTrack && !gameTrack.paused) {
        gameTrack.pause();
      }
      
      // End fading loop if done
      if (isTitleDone && isGameDone) {
        if (this.fadeInterval !== null) {
          window.clearInterval(this.fadeInterval);
          this.fadeInterval = null;
        }
        this.isFading = false;
      }
    }, this.FADE_INTERVAL_MS);
  }
}

export const audioManager = new AudioManager();

