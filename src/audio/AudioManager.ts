export class AudioManager {
  private titleAudio: HTMLAudioElement;
  private gamePlaylist: HTMLAudioElement[] = [];
  
  private currentGameTrackIndex: number = 0;
  
  private titleVolume: number = 0;
  private gameVolume: number = 0;
  
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
      this.titleAudio.volume = this.titleVolume;
      const gameTrack = this.getCurrentGameTrack();
      if (gameTrack) {
        gameTrack.volume = this.gameVolume;
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

