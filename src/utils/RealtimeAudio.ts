
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
  private recorder: AudioRecorder | null = null;
  public voiceId: string = "EXAVITQu4vr4xnSDxMaL"; // Default to Sarah voice
  public elevenLabsKey: string | null = null;
  private portfolioChannel: any = null;
  private lastUpdateTime: number = 0;
  private updateThreshold: number = 5000; // 5 seconds threshold between updates

  constructor(private onMessage: (message: any) => void) {}

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

    } catch (error) {
      console.error("Error initializing chat:", error);
      throw error;
    }
  }

  async sendMessage(text: string) {
    // Just emit the message to the handler
    this.onMessage({ type: 'response.text', text });
  }

  disconnect() {
    this.recorder?.stop();
    if (this.portfolioChannel) {
      supabase.removeChannel(this.portfolioChannel);
    }
  }
}
