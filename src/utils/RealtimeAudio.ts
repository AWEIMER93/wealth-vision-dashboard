
import { supabase } from "@/integrations/supabase/client";

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private isRecording: boolean = false;
  private lastProcessTime: number = 0;
  private processingThreshold: number = 2000; // 2 seconds between processing

  constructor(private onAudioData: (audioBlob: Blob) => void) {}

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

      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const now = Date.now();
        if (now - this.lastProcessTime >= this.processingThreshold) {
          const blob = new Blob(this.chunks, { type: 'audio/webm' });
          this.onAudioData(blob);
          this.lastProcessTime = now;
        }
        this.chunks = [];
        if (this.isRecording) {
          this.mediaRecorder?.start();
        }
      };

      this.isRecording = true;
      this.mediaRecorder.start();
      
      // Stop and process audio every 3 seconds
      setInterval(() => {
        if (this.isRecording && this.mediaRecorder?.state === 'recording') {
          this.mediaRecorder.stop();
        }
      }, 3000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    this.isRecording = false;
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}

export class RealtimeChat {
  private recorder: AudioRecorder | null = null;
  public voiceId: string = "EXAVITQu4vr4xnSDxMaL";
  public elevenLabsKey: string | null = null;
  private portfolioChannel: any = null;
  private isSubscribedToUpdates: boolean = false;
  private lastMessageTime: number = 0;
  private messageThreshold: number = 5000; // 5 seconds between messages

  constructor(private onMessage: (message: any) => void) {}

  async init() {
    try {
      // Initialize audio recording with blob handling
      this.recorder = new AudioRecorder(async (audioBlob) => {
        try {
          // Convert blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result?.toString().split(',')[1];
            if (base64Audio) {
              // Send to Supabase Edge Function for processing
              const { data, error } = await supabase.functions.invoke('voice-to-text', {
                body: { audio: base64Audio }
              });

              if (error) throw error;
              if (data?.text) {
                this.handleUserSpeech(data.text);
              }
            }
          };
        } catch (error) {
          console.error('Error processing audio:', error);
        }
      });
      await this.recorder.start();
    } catch (error) {
      console.error("Error initializing chat:", error);
      throw error;
    }
  }

  private handleUserSpeech(text: string) {
    // Process user's speech and respond accordingly
    console.log('User said:', text);
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('portfolio') || 
        lowerText.includes('stocks') || 
        lowerText.includes('investments')) {
      this.subscribeToPortfolioUpdates();
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
          const now = Date.now();
          if (now - this.lastMessageTime >= this.messageThreshold) {
            console.log('Portfolio updated:', payload);
            this.sendMessage("Your portfolio has been updated with the latest data.");
            this.lastMessageTime = now;
          }
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
    const now = Date.now();
    if (now - this.lastMessageTime >= this.messageThreshold) {
      this.onMessage({ type: 'response.text', text });
      this.lastMessageTime = now;
    }
  }

  disconnect() {
    this.recorder?.stop();
    this.unsubscribeFromUpdates();
  }
}
