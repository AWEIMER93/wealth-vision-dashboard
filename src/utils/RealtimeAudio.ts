
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
  private recorder: AudioRecorder | null = null;
  public voiceId: string = "EXAVITQu4vr4xnSDxMaL";
  public elevenLabsKey: string | null = null;
  private portfolioChannel: any = null;
  private isSubscribedToUpdates: boolean = false;

  constructor(private onMessage: (message: any) => void) {}

  async init() {
    try {
      // Only initialize audio recording
      this.recorder = new AudioRecorder((audioData) => {
        console.log('Audio data received:', audioData.length);
      });
      await this.recorder.start();
    } catch (error) {
      console.error("Error initializing chat:", error);
      throw error;
    }
  }

  async subscribeToPortfolioUpdates() {
    if (this.isSubscribedToUpdates) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

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
          console.log('Portfolio updated:', payload);
          this.sendMessage("Your portfolio has been updated with the latest data.");
        }
      )
      .subscribe();

    this.isSubscribedToUpdates = true;
  }

  async unsubscribeFromUpdates() {
    if (this.portfolioChannel) {
      await supabase.removeChannel(this.portfolioChannel);
      this.portfolioChannel = null;
      this.isSubscribedToUpdates = false;
    }
  }

  async sendMessage(text: string) {
    this.onMessage({ type: 'response.text', text });
  }

  disconnect() {
    this.recorder?.stop();
    this.unsubscribeFromUpdates();
  }
}
