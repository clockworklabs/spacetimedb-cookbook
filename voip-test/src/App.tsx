import { useState, useRef } from "react";
import { Stdb } from "./Stdb";
import { EventContext, VoiceData } from "./module_bindings";

const App = () => {
  const stdb = new Stdb("ws://localhost:3000", 'voip');
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  stdb.conn.db.voiceData.onInsert((ctx: EventContext, row: VoiceData) => {
    if(ctx.event.tag !== "Reducer") return;
    
    //if you wanna listen to yourself, comment out the below. 
    if(ctx.event.value.callerIdentity.toHexString() === stdb.identity.toHexString()) return;

    const audioContext = new AudioContext();

    const buffer = audioContext.createBuffer(1, row.data.length, audioContext.sampleRate);

    var temp_float_buffer = new Float32Array(row.data);
    buffer.copyToChannel(temp_float_buffer, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    applyEnhancements(audioContext, source);

    source.start();
  });

  const applyEnhancements = (audioContext: AudioContext, source: AudioNode) => {
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -20; 
  compressor.knee.value = 30; 
  compressor.ratio.value = 4; 
  compressor.attack.value = 0.02; 
  compressor.release.value = 0.25; 


  source.connect(filter);
  filter.connect(compressor);
  compressor.connect(audioContext.destination);
};

  const startVoIP = async () => {
    if (isRecording) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        var temp_float_buffer = new Float32Array(event.inputBuffer.getChannelData(0));
        var floatArray: number[] = [];
        for(var i = 0; i < temp_float_buffer.length; i++) {
          floatArray[i] = temp_float_buffer[i];
        }
        stdb.conn.reducers.addVoiceData(floatArray);
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      processorRef.current = processor;
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopVoIP = () => {
    if (!isRecording) return;
    
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    processorRef.current = null;
    setIsRecording(false);
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <button onClick={startVoIP} disabled={isRecording}>Start VoIP</button>
      <button onClick={stopVoIP} disabled={!isRecording}>Stop VoIP</button>
    </div>
  );
};

export default App;