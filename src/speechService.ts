import * as vscode from 'vscode';
import { logDebug } from './utils';

export interface ISpeechSettings {
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  filterCodeBlocks: boolean;
}

export class SpeechService {
  private synth: SpeechSynthesis | undefined;
  private textQueue: string[] = [];
  private isSpeaking: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voiceLoadAttempts: number = 0;
  private readonly MAX_VOICE_LOAD_ATTEMPTS = 5;
  private selectedVoice: string = '';
  private rate: number = 1.0;
  private pitch: number = 1.0;
  private volume: number = 1.0;
  private filterCodeBlocks: boolean = true;
  private updateStatusCallback: (message: string) => void;
  private updateVoicesCallback: (voices: SpeechSynthesisVoice[]) => void;

  constructor(
    updateStatus: (message: string) => void,
    updateVoices: (voices: SpeechSynthesisVoice[]) => void
  ) {
    this.updateStatusCallback = updateStatus;
    this.updateVoicesCallback = updateVoices;

    try {
      // Access the window object through the webview
      this.synth = window.speechSynthesis;
      this.initVoices();
    } catch (e) {
      const error = e as Error;
      logDebug(`Error initializing speech synthesis: ${error.message}`);
      this.updateStatusCallback(`Error: ${error.message}`);
    }
  }

  private updateStatus(message: string): void {
    this.updateStatusCallback(message);
    logDebug(message);
  }

  private initVoices(): void {
    // Attempt to load voices immediately
    this.loadVoices();

    // Schedule additional attempts to load voices
    const voiceRetryInterval = setInterval(() => {
      if (this.voices.length > 0 || this.voiceLoadAttempts >= this.MAX_VOICE_LOAD_ATTEMPTS) {
        clearInterval(voiceRetryInterval);
        return;
      }
      
      this.loadVoices();
    }, 1000);
  }

  private loadVoices(): void {
    this.voiceLoadAttempts++;
    try {
      // Try to get voices directly
      if (!this.synth) {
        this.updateStatus('Speech synthesis not available');
        return;
      }

      const availableVoices = this.synth.getVoices();
      
      if (availableVoices && availableVoices.length > 0) {
        this.voices = availableVoices;
        this.updateVoicesCallback(this.voices);
        this.updateStatus(`Loaded ${this.voices.length} voices on attempt ${this.voiceLoadAttempts}`);
        return;
      }
      
      // If no voices, set up the onvoiceschanged event
      this.updateStatus(`No voices found on attempt ${this.voiceLoadAttempts}, waiting for voices...`);
      
      // Set up voice changed listener
      this.synth.onvoiceschanged = () => {
        if (this.synth) {
          this.voices = this.synth.getVoices();
          this.updateVoicesCallback(this.voices);
          this.updateStatus(`Loaded ${this.voices.length} voices from onvoiceschanged event`);
        }
      };
    } catch (e) {
      const error = e as Error;
      this.updateStatus(`Error loading voices: ${error.message}`);
    }
  }

  // Update settings from extension configuration
  updateSettings(settings: ISpeechSettings): void {
    this.selectedVoice = settings.voice;
    this.rate = settings.rate;
    this.pitch = settings.pitch;
    this.volume = settings.volume;
    this.filterCodeBlocks = settings.filterCodeBlocks;
    
    this.updateStatus('Speech settings updated');
  }

  // Get current voice list
  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  // Force reload voices
  reloadVoices(): void {
    this.voiceLoadAttempts = 0;
    this.initVoices();
  }

  // Request audio permissions explicitly
  requestAudioPermissions(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Create a short, silent audio context to request permissions
        const audioContext = new AudioContext();
        
        // Create a short, silent oscillator
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 0; // Silent
        oscillator.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.01); // Stop after 10ms
        
        setTimeout(() => {
          audioContext.close();
          resolve(true);
        }, 100);
      } catch (e) {
        const error = e as Error;
        this.updateStatus(`Error requesting audio permissions: ${error.message}`);
        resolve(false);
      }
    });
  }

  // Test voice function - speaks a sample text to test the selected voice
  async testVoice(): Promise<void> {
    await this.requestAudioPermissions();
    this.updateStatus('Testing voice...');
    
    const testText = "This is a test of the text-to-speech system.";
    
    // Try direct speech
    try {
      await this.speakDirectly(testText);
    } catch (e) {
      const error = e as Error;
      this.updateStatus(`Error in test voice: ${error.message}`);
    }
  }

  // Direct speech without using the queue (for testing)
  async speakDirectly(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.synth) {
          this.updateStatus('Speech synthesis not available');
          reject(new Error('Speech synthesis not available'));
          return;
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Try to get a voice
        let voice: SpeechSynthesisVoice | undefined;
        
        // First try the selected voice
        if (this.selectedVoice) {
          voice = this.voices.find(v => 
            v.name === this.selectedVoice || 
            v.voiceURI === this.selectedVoice
          );
        }
        
        // If no selected voice, or selection not found, pick any available voice
        if (!voice && this.voices.length > 0) {
          // Try to find a good default voice (usually English)
          voice = this.voices.find(v => 
            v.lang.startsWith('en-') || 
            v.name.includes('English')
          );
          
          // If still no voice, just use the first one
          if (!voice) {
            voice = this.voices[0];
          }
        }
        
        // Set the voice if we found one
        if (voice) {
          utterance.voice = voice;
          this.updateStatus(`Using voice: ${voice.name}`);
        } else {
          this.updateStatus('No voice available, using browser default');
        }
        
        // Set other properties
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.volume = this.volume;
        
        // Set up events
        utterance.onstart = () => {
          this.updateStatus('Speech started');
        };
        
        utterance.onend = () => {
          this.updateStatus('Speech ended');
          resolve();
        };
        
        utterance.onerror = (event) => {
          const errorMsg = `Speech error: ${event.error}`;
          this.updateStatus(errorMsg);
          reject(new Error(errorMsg));
        };
        
        // Speak the utterance
        this.synth.cancel(); // Cancel any ongoing speech
        this.synth.speak(utterance);
        
      } catch (e) {
        const error = e as Error;
        this.updateStatus(`Exception in speakDirectly: ${error.message}`);
        reject(error);
      }
    });
  }

  // Add text to the queue for speaking
  speak(text: string): void {
    if (!text || text.trim() === '') {
      return;
    }
    
    // Process text to filter code blocks if needed
    const processedText = this.processText(text);
    
    if (!processedText || processedText.trim() === '') {
      this.updateStatus('No text to speak after processing');
      return;
    }
    
    // Split text into manageable chunks for better speech performance
    const chunks = this.splitTextIntoChunks(processedText, 200);
    this.textQueue.push(...chunks);
    
    this.updateStatus(`Added ${chunks.length} segments to speech queue`);
    
    // Start speaking if not already speaking
    if (!this.isSpeaking) {
      this.speakNextSegment();
    }
  }

  // Process the text (remove code blocks if configured)
  private processText(text: string): string {
    if (!this.filterCodeBlocks) {
      return text;
    }
    
    // Replace code blocks with a brief note
    return text
      .replace(/\`\`\`[\s\S]*?\`\`\`/g, 'Code block skipped.')
      .replace(/\`[^\`]+\`/g, 'Inline code skipped.');
  }

  // Split text into manageable chunks at sentence boundaries
  private splitTextIntoChunks(text: string, maxChunkLength: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  // Speak the next segment in the queue
  private speakNextSegment(): void {
    if (this.textQueue.length === 0 || this.isSpeaking || !this.synth) {
      return;
    }
    
    const text = this.textQueue.shift() || '';
    
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Try to find the selected voice
      if (this.selectedVoice) {
        const voice = this.voices.find(v => 
          v.name === this.selectedVoice || 
          v.voiceURI === this.selectedVoice
        );
        
        if (voice) {
          utterance.voice = voice;
        } else {
          this.updateStatus(`Selected voice not found: ${this.selectedVoice}`);
        }
      }
      
      // If no voice was set, try to use a default
      if (!utterance.voice && this.voices.length > 0) {
        utterance.voice = this.voices[0];
      }
      
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      utterance.volume = this.volume;
      
      utterance.onstart = () => {
        this.updateStatus('Speech segment started');
      };
      
      utterance.onend = () => {
        this.updateStatus('Speech segment ended');
        
        if (this.textQueue.length > 0) {
          this.speakNextSegment();
        } else {
          this.isSpeaking = false;
          this.updateStatus('Queue empty, finished speaking');
        }
      };
      
      utterance.onerror = (event) => {
        this.updateStatus(`Speech error: ${event.error}`);
        this.isSpeaking = false;
        
        // Try to recover by continuing with the next segment
        if (this.textQueue.length > 0) {
          setTimeout(() => this.speakNextSegment(), 500);
        }
      };
      
      this.currentUtterance = utterance;
      this.isSpeaking = true;
      
      this.synth.speak(utterance);
      
    } catch (e) {
      const error = e as Error;
      this.updateStatus(`Error speaking: ${error.message}`);
      this.isSpeaking = false;
      
      // Try to recover by continuing with the next segment
      if (this.textQueue.length > 0) {
        setTimeout(() => this.speakNextSegment(), 500);
      }
    }
  }

  // Stop all speech
  stop(): void {
    this.textQueue = [];
    
    if (this.synth) {
      this.synth.cancel();
    }
    
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.updateStatus('Speech stopped');
  }

  // Pause speech
  pause(): void {
    if (this.synth && this.synth.speaking) {
      this.synth.pause();
      this.updateStatus('Speech paused');
    }
  }

  // Resume speech
  resume(): void {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
      this.updateStatus('Speech resumed');
    }
  }
} 