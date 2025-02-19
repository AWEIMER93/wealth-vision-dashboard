
import { supabase } from "@/integrations/supabase/client";

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.audioContext = new AudioContext({
        sampleRate: 24000,
      });
      
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export class RealtimeChat {
  private dc: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement;
  private recorder: AudioRecorder | null = null;
  public voiceId: string = "EXAVITQu4vr4xnSDxMaL"; // Default to Sarah voice
  public elevenLabsKey: string | null = null;
  private portfolioChannel: any = null;
  private lastUpdateTime: number = 0;
  private updateThreshold: number = 5000; // 5 seconds threshold between updates

  constructor(private onMessage: (message: any) => void) {
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
  }

  async init() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Subscribe to portfolio updates
        this.portfolioChannel = supabase
          .channel('portfolio-updates')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'portfolios',
              filter: `user_id=eq.${session.user.id}`
            },
            (payload) => {
              const now = Date.now();
              if (now - this.lastUpdateTime >= this.updateThreshold) {
                console.log('Portfolio updated:', payload);
                this.sendMessage("My portfolio has been updated. Please get the latest data.");
                this.lastUpdateTime = now;
              } else {
                console.log('Update throttled - too soon after last update');
              }
            }
          )
          .subscribe();
      }

      // Initialize audio recording
      this.recorder = new AudioRecorder((audioData) => {
        // Handle audio data if needed
        console.log('Audio data received:', audioData.length);
      });
      await this.recorder.start();

      // Send initial greeting
      const userName = session?.user?.email?.split('@')[0] || 'there';
      const greetingMessage = `Hi ${userName}, I'm ready to help with your portfolio. I can assist you with viewing your portfolio, executing trades, and providing market analysis. What would you like to do?`;
      await this.synthesizeSpeech(greetingMessage);

    } catch (error) {
      console.error("Error initializing chat:", error);
      throw error;
    }
  }

  private async synthesizeSpeech(text: string) {
    if (!this.elevenLabsKey) {
      console.error('ElevenLabs API key not set');
      return;
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (this.audioEl) {
        this.audioEl.src = url;
        await this.audioEl.play();
      }
    } catch (error) {
      console.error('Error synthesizing speech:', error);
    }
  }

  async sendMessage(text: string) {
    await this.synthesizeSpeech(text);
  }

  disconnect() {
    this.recorder?.stop();
    if (this.portfolioChannel) {
      supabase.removeChannel(this.portfolioChannel);
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }
  }
}
